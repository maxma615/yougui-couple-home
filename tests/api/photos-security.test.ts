import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";

import { createMomentPhotoRoutes, createPhotoItemRoutes } from "../../src/modules/photos/routes";
import { verifyStorage } from "../../src/cli/verify-storage";
import { runMigrations } from "../../src/cli/migrate";
import { createMomentService } from "../../src/modules/moments/service";
import { createSession, revokeSessionToken, sessionCookieHeader } from "../../src/modules/auth/session";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

const origin = "http://127.0.0.1:3000";
const limits = { maxBytes: 1024, maxPixels: 100 };

describe("photo API security boundary", () => {
  let database: TestDatabase;
  let attachmentsDirectory: string;
  let cookieA: string;
  let cookieB: string;
  const a = { homeId: randomUUID(), userId: randomUUID() };
  const b = { homeId: randomUUID(), userId: randomUUID() };

  beforeAll(async () => {
    database = await createTestDatabase();
    const testRoot = path.resolve(".local/tests/photos-security");
    await mkdir(testRoot, { recursive: true });
    attachmentsDirectory = await mkdtemp(path.join(testRoot, "attachments-"));
    await runMigrations(database.pool);
    await database.pool.query(
      `INSERT INTO users(id,email,display_name,password_hash) VALUES
       ($1,'photo-a@example.test','A','x'),($2,'photo-b@example.test','B','x')`,
      [a.userId, b.userId],
    );
    await database.pool.query(
      "INSERT INTO homes(id,name,start_date) VALUES($1,'A','2020-01-01'),($2,'B','2020-01-01')",
      [a.homeId, b.homeId],
    );
    await database.pool.query(
      "INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,1),($3,$4,1)",
      [a.homeId, a.userId, b.homeId, b.userId],
    );
    cookieA = sessionCookieHeader((await createSession(a.userId, database.pool)).token);
    cookieB = sessionCookieHeader((await createSession(b.userId, database.pool)).token);
  });

  afterAll(async () => {
    await database?.cleanup();
    await rm(attachmentsDirectory, { recursive: true, force: true });
  });

  async function uploadRequest(momentId: string, version = 1): Promise<Response> {
    return uploadDataRequest(
      momentId,
      await readFile(path.resolve("tests/fixtures/images/valid.jpg")),
      "私密照片.jpg",
      "image/jpeg",
      version,
      limits,
    );
  }

  async function uploadDataRequest(
    momentId: string,
    bytes: Uint8Array,
    filename: string,
    mime: string,
    version = 1,
    photoLimits = limits,
  ): Promise<Response> {
    const form = new FormData();
    form.set(
      "file",
      new File([Buffer.from(bytes)], filename, { type: mime }),
    );
    form.set("version", String(version));
    return createMomentPhotoRoutes(database.pool, attachmentsDirectory, photoLimits).POST(
      new Request(`${origin}/api/moments/${momentId}/photos`, {
        method: "POST",
        headers: { origin, cookie: cookieA },
        body: form,
      }),
      { params: Promise.resolve({ id: momentId }) },
    );
  }

  it("uploads multipart bytes, serves only to the same home and sends hardened headers", async () => {
    const moment = await createMomentService(database.pool).create(a, {
      title: "API 照片",
      date: "2026-09-23",
      body: "",
    });
    const uploaded = await uploadRequest(moment.id);
    expect(uploaded.status).toBe(201);
    const payload = (await uploaded.json()) as { photo: { id: string; filename: string }; version: number };
    expect(payload.version).toBe(2);
    expect(payload.photo.filename).toBe("私密照片.jpg");

    const routes = createPhotoItemRoutes(database.pool, attachmentsDirectory);
    const denied = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}`, { headers: { cookie: cookieB } }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(denied.status).toBe(404);
    expect(JSON.stringify(await denied.json())).not.toContain(attachmentsDirectory);
    const deniedDelete = await routes.DELETE(
      new Request(`${origin}/api/photos/${payload.photo.id}`, {
        method: "DELETE",
        headers: { origin, cookie: cookieB, "content-type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(deniedDelete.status).toBe(404);

    const allowed = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}`, { headers: { cookie: cookieA } }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("content-type")).toBe("image/jpeg");
    expect(allowed.headers.get("content-disposition")).toContain("inline");
    expect(allowed.headers.get("content-disposition")).toContain(encodeURIComponent("私密照片.jpg"));
    expect(allowed.headers.get("x-content-type-options")).toBe("nosniff");
    expect(allowed.headers.get("cache-control")).toContain("private");
    expect(allowed.headers.get("cache-control")).toContain("no-cache");
    expect(allowed.headers.get("vary")).toContain("Cookie");
    const originalEtag = allowed.headers.get("etag");
    expect(originalEtag).toMatch(/^"[a-f0-9]{64}"$/);
    expect(Buffer.from(await allowed.arrayBuffer())).toEqual(
      await readFile(path.resolve("tests/fixtures/images/valid.jpg")),
    );

    const thumbnail = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}?variant=thumbnail`, {
        headers: { cookie: cookieA },
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get("content-type")).toBe("image/webp");
    expect(thumbnail.headers.get("cache-control")).toContain("private, no-cache");
    expect(thumbnail.headers.get("etag")).not.toBe(originalEtag);
    expect(thumbnail.headers.get("content-length")).toBeTruthy();
    const thumbnailEtag = thumbnail.headers.get("etag");
    await thumbnail.arrayBuffer();

    const invalidVariant = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}?variant=1024`, {
        headers: { cookie: cookieA },
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(invalidVariant.status).toBe(400);
    expect(await invalidVariant.json()).toMatchObject({
      error: { code: "INVALID_PHOTO_VARIANT" },
    });

    const revalidated = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}?variant=thumbnail`, {
        headers: { cookie: cookieA, "if-none-match": thumbnailEtag! },
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(revalidated.status).toBe(304);
    expect(revalidated.headers.get("etag")).toBe(thumbnailEtag);

    const unauthenticatedRevalidation = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}?variant=thumbnail`, {
        headers: { "if-none-match": thumbnailEtag! },
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(unauthenticatedRevalidation.status).toBe(401);

    const crossHomeRevalidation = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}?variant=thumbnail`, {
        headers: { cookie: cookieB, "if-none-match": thumbnailEtag! },
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(crossHomeRevalidation.status).toBe(404);

    const storage = await verifyStorage(database.pool, attachmentsDirectory);
    expect(storage.unknownOrphans).toEqual([]);
    expect(storage.brokenReferences).toEqual([]);
    expect(storage.hashMismatches).toEqual([]);

    const stored = await database.pool.query<{ storage_name: string }>(
      "SELECT storage_name FROM photos WHERE id=$1",
      [payload.photo.id],
    );
    const formalPath = path.join(attachmentsDirectory, "photos", stored.rows[0].storage_name);
    const outsidePhotoDirectory = path.join(attachmentsDirectory, "must-not-leak.txt");
    await writeFile(outsidePhotoDirectory, "private-server-file");
    await rm(formalPath);
    await symlink(outsidePhotoDirectory, formalPath);
    const linkedRead = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}`, { headers: { cookie: cookieA } }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(linkedRead.status).toBe(500);
    expect(await linkedRead.text()).not.toContain("private-server-file");

    const staleDelete = await routes.DELETE(
      new Request(`${origin}/api/photos/${payload.photo.id}`, {
        method: "DELETE",
        headers: { origin, cookie: cookieA, "content-type": "application/json" },
        body: JSON.stringify({ version: 1 }),
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(staleDelete.status).toBe(409);

    const deleted = await routes.DELETE(
      new Request(`${origin}/api/photos/${payload.photo.id}`, {
        method: "DELETE",
        headers: { origin, cookie: cookieA, "content-type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(deleted.status).toBe(200);
    const readAfterDelete = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}?variant=thumbnail`, {
        headers: { cookie: cookieA, "if-none-match": thumbnailEtag! },
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(readAfterDelete.status).toBe(404);
  });

  it.each([
    ["JPEG", "valid.jpg", "image/jpeg"],
    ["PNG", "valid.png", "image/png"],
    ["WebP", "valid.webp", "image/webp"],
  ])("serves an on-demand WebP thumbnail for an existing %s photo", async (_label, fixture, mime) => {
    const moment = await createMomentService(database.pool).create(a, {
      title: `${fixture} 缩略图`,
      date: "2026-09-23",
      body: "",
    });
    const source = await readFile(path.resolve(`tests/fixtures/images/${fixture}`));
    const uploaded = await uploadDataRequest(moment.id, source, fixture, mime);
    expect(uploaded.status).toBe(201);
    const payload = (await uploaded.json()) as { photo: { id: string } };
    const routes = createPhotoItemRoutes(database.pool, attachmentsDirectory);
    const response = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}?variant=thumbnail`, {
        headers: { cookie: cookieA },
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(response.status).toBe(200);
    const data = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect((await sharp(data).metadata()).format).toBe("webp");
  });

  it("reduces a large existing photo to a bounded WebP preview while preserving the original", async () => {
    const width = 1600;
    const height = 1200;
    const pixels = randomBytes(width * height * 3);
    const source = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const moment = await createMomentService(database.pool).create(a, {
      title: "较大照片预览",
      date: "2026-09-23",
      body: "",
    });
    const uploaded = await uploadDataRequest(
      moment.id,
      source,
      "large.jpg",
      "image/jpeg",
      1,
      { maxBytes: 10 * 1024 * 1024, maxPixels: width * height },
    );
    expect(uploaded.status).toBe(201);
    const payload = (await uploaded.json()) as { photo: { id: string } };
    const routes = createPhotoItemRoutes(database.pool, attachmentsDirectory);
    const preview = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}?variant=preview`, {
        headers: { cookie: cookieA },
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    const previewBytes = Buffer.from(await preview.arrayBuffer());
    const previewMetadata = await sharp(previewBytes).metadata();
    expect(preview.status).toBe(200);
    expect(previewMetadata.format).toBe("webp");
    expect(Math.max(previewMetadata.width!, previewMetadata.height!)).toBeLessThanOrEqual(1280);
    expect(previewBytes.byteLength).toBeLessThan(source.byteLength);

    const original = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}`, { headers: { cookie: cookieA } }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(Buffer.from(await original.arrayBuffer())).toEqual(source);
  });

  it("does not return 304 after the previously valid session is revoked", async () => {
    const moment = await createMomentService(database.pool).create(a, {
      title: "注销后仍需鉴权",
      date: "2026-09-23",
      body: "",
    });
    const uploaded = await uploadRequest(moment.id);
    expect(uploaded.status).toBe(201);
    const payload = (await uploaded.json()) as { photo: { id: string } };
    const session = await createSession(a.userId, database.pool);
    const cookie = sessionCookieHeader(session.token);
    const routes = createPhotoItemRoutes(database.pool, attachmentsDirectory);
    const beforeLogout = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}?variant=thumbnail`, {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(beforeLogout.status).toBe(200);
    const etag = beforeLogout.headers.get("etag");
    await beforeLogout.arrayBuffer();

    await revokeSessionToken(session.token, database.pool);
    const afterLogout = await routes.GET(
      new Request(`${origin}/api/photos/${payload.photo.id}?variant=thumbnail`, {
        headers: { cookie, "if-none-match": etag! },
      }),
      { params: Promise.resolve({ id: payload.photo.id }) },
    );
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.headers.get("cache-control")).toBe("no-store");
  });

  it("checks origin and multipart content type before accepting upload", async () => {
    const moment = await createMomentService(database.pool).create(a, {
      title: "请求边界",
      date: "2026-09-23",
      body: "",
    });
    const routes = createMomentPhotoRoutes(database.pool, attachmentsDirectory, limits);
    const wrongOrigin = await routes.POST(
      new Request(`${origin}/api/moments/${moment.id}/photos`, {
        method: "POST",
        headers: { origin: "https://attacker.example", cookie: cookieA, "content-type": "text/plain" },
        body: "x",
      }),
      { params: Promise.resolve({ id: moment.id }) },
    );
    expect(wrongOrigin.status).toBe(403);

    const wrongType = await routes.POST(
      new Request(`${origin}/api/moments/${moment.id}/photos`, {
        method: "POST",
        headers: { origin, cookie: cookieA, "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ id: moment.id }) },
    );
    expect(wrongType.status).toBe(400);
  });

  it("rejects declared and chunked oversized bodies without unbounded formData parsing", async () => {
    const moment = await createMomentService(database.pool).create(a, {
      title: "大小限制",
      date: "2026-09-23",
      body: "",
    });
    const routes = createMomentPhotoRoutes(database.pool, attachmentsDirectory, limits);
    const declared = await routes.POST(
      new Request(`${origin}/api/moments/${moment.id}/photos`, {
        method: "POST",
        headers: {
          origin,
          cookie: cookieA,
          "content-type": "multipart/form-data; boundary=x",
          "content-length": "100000",
        },
        body: "--x--\r\n",
      }),
      { params: Promise.resolve({ id: moment.id }) },
    );
    expect(declared.status).toBe(413);

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(70_000));
        controller.close();
      },
    });
    const chunked = await routes.POST(
      new Request(`${origin}/api/moments/${moment.id}/photos`, {
        method: "POST",
        headers: { origin, cookie: cookieA, "content-type": "multipart/form-data; boundary=x" },
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" }),
      { params: Promise.resolve({ id: moment.id }) },
    );
    expect(chunked.status).toBe(413);
  });
});
