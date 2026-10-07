import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/cli/migrate";
import { createAdminAlbumRoutes, getAdminAlbums } from "../../src/modules/admin/albums";
import { createSession, revokeSessionToken, sessionCookieHeader } from "../../src/modules/auth/session";
import { createMomentService } from "../../src/modules/moments/service";
import { createPhotoService } from "../../src/modules/photos/store";
import { createPhotoItemRoutes } from "../../src/modules/photos/routes";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

describe("administrator album read boundary", () => {
  let db: TestDatabase;
  let directory: string;
  let adminCookie: string;
  let memberCookie: string;
  const admin = { userId: randomUUID(), role: "admin" as const };
  const a = { userId: randomUUID(), homeId: randomUUID() };
  const b = { userId: randomUUID(), homeId: randomUUID() };
  const empty = randomUUID();
  let firstPhoto: string;
  let secondPhoto: string;
  let firstMoment: string;
  const request = (suffix: string, cookie?: string, etag?: string) => new Request("http://localhost/api/admin/" + suffix, {
    headers: { ...(cookie ? { cookie } : {}), ...(etag ? { "if-none-match": etag } : {}) },
  });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const routes = () => createAdminAlbumRoutes(db.pool, directory);

  beforeAll(async () => {
    db = await createTestDatabase();
    await runMigrations(db.pool);
    await mkdir(path.resolve(".local/tests/admin-albums"), { recursive: true });
    directory = await mkdtemp(path.resolve(".local/tests/admin-albums/attachments-"));
    await db.pool.query(`INSERT INTO users(id,email,display_name,password_hash,role) VALUES
      ($1,'admin-album@example.test','Admin','x','admin'),($2,'album-a@example.test','A','x','member'),($3,'album-b@example.test','B','x','member')`,
      [admin.userId, a.userId, b.userId]);
    await db.pool.query("INSERT INTO homes(id,name,start_date) VALUES($1,'A','2020-01-01'),($2,'B','2020-01-01'),($3,'Empty','2020-01-01')", [a.homeId, b.homeId, empty]);
    await db.pool.query("INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,1),($3,$4,1)", [a.homeId, a.userId, b.homeId, b.userId]);
    adminCookie = sessionCookieHeader((await createSession(admin.userId, db.pool)).token);
    memberCookie = sessionCookieHeader((await createSession(a.userId, db.pool)).token);
    for (const [ctx, title] of [[a, "First"], [b, "Second"]] as const) {
      const moment = await createMomentService(db.pool).create(ctx, { title, date: "2026-10-07", body: "Do not disclose this private text" });
      const photo = await createPhotoService(db.pool, directory, { maxBytes: 1024, maxPixels: 100 }).upload(ctx, moment.id, {
        data: await readFile("tests/fixtures/images/valid.jpg"), filename: title + ".jpg", claimedMime: "image/jpeg", version: 1,
      });
      if (ctx === a) { firstPhoto = photo.photo.id; firstMoment = moment.id; } else secondPhoto = photo.photo.id;
    }
  });

  afterAll(async () => {
    await db?.cleanup();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("lists every space including empty albums, without granting home membership", async () => {
    const response = await routes().list(request("albums", adminCookie));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.albums).toHaveLength(3);
    expect(data.albums.find((album: { id: string }) => album.id === a.homeId)).toMatchObject({ name: "A", photoCount: 1, memberCount: 1 });
    expect(data.albums.find((album: { id: string }) => album.id === empty)).toMatchObject({ photoCount: 0, memberCount: 0 });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await db.pool.query("SELECT 1 FROM home_members WHERE user_id=$1", [admin.userId])).rowCount).toBe(0);
  });

  it("returns only the selected space's photos, dates and titles without storage paths or record bodies", async () => {
    const response = await routes().album(request("albums/" + b.homeId, adminCookie), params(b.homeId));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toMatchObject({ photo: { id: secondPhoto }, moment: { title: "Second", date: "2026-10-07" }, photoIndex: 0 });
    expect(data.nextOffset).toBeNull();
    expect(JSON.stringify(data)).not.toContain("Do not disclose");
    expect(JSON.stringify(data)).not.toContain("storage_name");
    expect(JSON.stringify(data)).not.toContain(directory);
  });

  it.each([undefined, "member"])("rejects non-admin readers (%s) on all admin album endpoints", async (kind) => {
    const cookie = kind ? memberCookie : undefined;
    const expected = kind ? 403 : 401;
    const handlers = [
      routes().list(request("albums", cookie)),
      routes().album(request("albums/" + a.homeId, cookie), params(a.homeId)),
      routes().photo(request("photos/" + firstPhoto + "?variant=thumbnail", cookie), params(firstPhoto)),
    ];
    for (const response of await Promise.all(handlers)) {
      expect(response.status).toBe(expected);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("etag")).toBeNull();
    }
  });

  it("rechecks the database role even when a forged service context claims admin", async () => {
    await expect(getAdminAlbums({ userId: a.userId, role: "admin" }, db.pool)).rejects.toMatchObject({ status: 403 });
  });

  it("serves original bytes and bounded WebP renditions with authenticated private caching", async () => {
    for (const variant of ["original", "thumbnail", "preview"]) {
      const response = await routes().photo(request(`photos/${secondPhoto}?variant=${variant}`, adminCookie), params(secondPhoto));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-cache, must-revalidate");
      expect(response.headers.get("vary")).toBe("Cookie");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (variant === "original") expect(bytes.equals(await readFile("tests/fixtures/images/valid.jpg"))).toBe(true);
      else {
        const image = await sharp(bytes).metadata();
        expect(image.format).toBe("webp");
        expect(Math.max(image.width!, image.height!)).toBeLessThanOrEqual(variant === "thumbnail" ? 640 : 1280);
      }
    }
  });

  it("does not bypass ordinary member photo access or grant photo deletion to admins", async () => {
    const ordinary = createPhotoItemRoutes(db.pool, directory);
    expect((await ordinary.GET(request("photos/" + firstPhoto, adminCookie), params(firstPhoto))).status).toBe(403);
    expect((await ordinary.GET(request("photos/" + secondPhoto, memberCookie), params(secondPhoto))).status).toBe(404);
    const deletion = await ordinary.DELETE(new Request("http://127.0.0.1:3000/api/photos/" + firstPhoto, {
      method: "DELETE", headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json", cookie: adminCookie }, body: '{"version":2}',
    }), params(firstPhoto));
    expect(deletion.status).toBe(403);
    expect((await db.pool.query("SELECT 1 FROM photos WHERE id=$1", [firstPhoto])).rowCount).toBe(1);
  });

  it("checks revocation before returning a conditional 304", async () => {
    const session = await createSession(admin.userId, db.pool);
    const cookie = sessionCookieHeader(session.token);
    const before = await routes().photo(request("photos/" + firstPhoto, cookie), params(firstPhoto));
    const etag = before.headers.get("etag")!;
    expect((await routes().photo(request("photos/" + firstPhoto, cookie, etag), params(firstPhoto))).status).toBe(304);
    await revokeSessionToken(session.token, db.pool);
    const after = await routes().photo(request("photos/" + firstPhoto, cookie, etag), params(firstPhoto));
    expect(after.status).toBe(401);
    expect(after.headers.get("etag")).toBeNull();
  });

  it("blocks disabled administrators and role downgrades immediately", async () => {
    try {
      await db.pool.query("UPDATE users SET disabled=true WHERE id=$1", [admin.userId]);
      expect((await routes().photo(request("photos/" + firstPhoto, adminCookie), params(firstPhoto))).status).toBe(401);
      await db.pool.query("UPDATE users SET disabled=false,role='member' WHERE id=$1", [admin.userId]);
      expect((await routes().list(request("albums", adminCookie))).status).toBe(403);
    } finally {
      await db.pool.query("UPDATE users SET disabled=false,role='admin' WHERE id=$1", [admin.userId]);
    }
  });

  it("rejects invalid identifiers, missing spaces and invalid pagination", async () => {
    expect((await routes().album(request("albums/x", adminCookie), params("../outside"))).status).toBe(404);
    expect((await routes().album(request("albums/" + empty + "?offset=-1", adminCookie), params(empty))).status).toBe(400);
    expect((await routes().album(request("albums/" + randomUUID(), adminCookie), params(randomUUID()))).status).toBe(404);
    expect((await routes().photo(request("photos/" + firstPhoto + "?variant=huge", adminCookie), params(firstPhoto))).status).toBe(400);
  });

  it("never follows a photo storage symlink outside the attachment directory", async () => {
    const row = (await db.pool.query<{ storage_name: string }>("SELECT storage_name FROM photos WHERE id=$1", [secondPhoto])).rows[0];
    const file = path.join(directory, "photos", row.storage_name);
    const bytes = await readFile(file);
    const secret = path.join(directory, "outside-test.txt");
    try {
      await rm(file);
      await writeFile(secret, "test-only private payload");
      await symlink(secret, file);
      const response = await routes().photo(request("photos/" + secondPhoto, adminCookie), params(secondPhoto));
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("private payload");
    } finally {
      await rm(file, { force: true });
      await writeFile(file, bytes);
    }
  });

  it("paginates the selected album without duplicating or omitting photos", async () => {
    const uploader = createPhotoService(db.pool, directory, { maxBytes: 1024, maxPixels: 100 });
    const bytes = await readFile("tests/fixtures/images/valid.jpg");
    let version = 2;
    for (let index = 0; index < 62; index++) {
      const added = await uploader.upload(a, firstMoment, { data: bytes, filename: "same.jpg", claimedMime: "image/jpeg", version });
      version = added.version;
    }
    const first = await (await routes().album(request("albums/" + a.homeId, adminCookie), params(a.homeId))).json();
    expect(first.entries).toHaveLength(60);
    expect(first.nextOffset).toBe(60);
    const second = await (await routes().album(request("albums/" + a.homeId + "?offset=60", adminCookie), params(a.homeId))).json();
    expect(second.entries).toHaveLength(3);
    expect(second.nextOffset).toBeNull();
    expect(new Set([...first.entries, ...second.entries].map(entry => entry.photo.id)).size).toBe(63);
    expect(second.entries.map((entry: { photoIndex: number }) => entry.photoIndex)).toEqual([60, 61, 62]);
  });
});
