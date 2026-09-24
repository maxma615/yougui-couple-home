import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/cli/migrate";
import { WRITE_TRANSACTION_LOCK_KEY } from "../../src/lib/db";
import { createMomentService } from "../../src/modules/moments/service";
import { validateImage } from "../../src/modules/photos/validate";
import { createPhotoService } from "../../src/modules/photos/store";
import { runPhotoCleanup } from "../../src/modules/photos/cleanup";
import { verifyStorage } from "../../src/cli/verify-storage";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

const imageFixtures = path.resolve("tests/fixtures/images");

describe("moment and photo storage schema", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await runMigrations(database.pool);
  });

  afterAll(async () => {
    await database?.cleanup();
  });

  it("stores photo integrity metadata and cleanup state", async () => {
    const columns = await database.pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name,column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name IN ('moments','photos','photo_cleanup_queue')`,
    );
    expect(columns.rows.map((row) => `${row.table_name}.${row.column_name}`)).toEqual(
      expect.arrayContaining([
        "moments.version",
        "photos.home_id",
        "photos.moment_id",
        "photos.storage_name",
        "photos.sha256",
        "photos.byte_size",
        "photo_cleanup_queue.storage_name",
        "photo_cleanup_queue.last_error",
      ]),
    );
  });

  it("prevents a photo row from crossing home and moment boundaries", async () => {
    const homeA = randomUUID();
    const homeB = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();
    const momentId = randomUUID();
    await database.pool.query(
      `INSERT INTO users(id,email,display_name,password_hash) VALUES
         ($1,'a@example.test','A','x'),($2,'b@example.test','B','x')`,
      [userA, userB],
    );
    await database.pool.query(
      "INSERT INTO homes(id,name,start_date) VALUES ($1,'A','2020-01-01'),($2,'B','2020-01-01')",
      [homeA, homeB],
    );
    await database.pool.query(
      "INSERT INTO home_members(home_id,user_id,slot) VALUES ($1,$2,1),($3,$4,1)",
      [homeA, userA, homeB, userB],
    );
    await database.pool.query(
      `INSERT INTO moments(id,home_id,title,date,body,created_by,updated_by)
       VALUES($1,$2,'A','2026-09-23','',$3,$3)`,
      [momentId, homeA, userA],
    );

    await expect(
      database.pool.query(
        `INSERT INTO photos(home_id,moment_id,storage_name,original_filename,mime_type,byte_size,sha256,uploaded_by)
         VALUES($1,$2,'random.jpg','safe.jpg','image/jpeg',3,$3,$4)`,
        [homeB, momentId, "a".repeat(64), userB],
      ),
    ).rejects.toBeTruthy();
  });
});

describe("real image byte validation", () => {
  let temporaryDirectory: string;

  beforeAll(async () => {
    const testRoot = path.resolve(".local/tests/photo-lifecycle");
    await mkdir(testRoot, { recursive: true });
    temporaryDirectory = await mkdtemp(path.join(testRoot, "images-"));
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  for (const [filename, claimedMime, expectedMime] of [
    ["valid.jpg", "image/jpeg", "image/jpeg"],
    ["valid.png", "image/png", "image/png"],
    ["valid.webp", "image/webp", "image/webp"],
  ] as const) {
    it(`accepts fully decoded ${expectedMime} bytes`, async () => {
      const filePath = path.join(imageFixtures, filename);
      const bytes = await readFile(filePath);
      await expect(
        validateImage(filePath, { claimedMime, maxBytes: 1024 * 1024, maxPixels: 100 }),
      ).resolves.toEqual({
        mime: expectedMime,
        extension: expectedMime === "image/jpeg" ? "jpg" : expectedMime.slice("image/".length),
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        width: 2,
        height: 2,
      });
    });
  }

  it("rejects content-type mismatch even when the image bytes are valid", async () => {
    await expect(
      validateImage(path.join(imageFixtures, "valid.png"), {
        claimedMime: "image/jpeg",
        maxBytes: 1024 * 1024,
        maxPixels: 100,
      }),
    ).rejects.toMatchObject({ status: 422, code: "IMAGE_TYPE_MISMATCH" });
  });

  it.each(["fake.jpg", "truncated.jpg"])("rejects undecodable fixture %s", async (filename) => {
    await expect(
      validateImage(path.join(imageFixtures, filename), {
        claimedMime: "image/jpeg",
        maxBytes: 1024 * 1024,
        maxPixels: 100,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("rejects empty, byte-limit and pixel-limit inputs", async () => {
    const empty = path.join(temporaryDirectory, "empty.jpg");
    await writeFile(empty, Buffer.alloc(0));
    await expect(
      validateImage(empty, { claimedMime: "image/jpeg", maxBytes: 100, maxPixels: 100 }),
    ).rejects.toMatchObject({ status: 422, code: "EMPTY_IMAGE" });

    const valid = path.join(imageFixtures, "valid.png");
    await expect(
      validateImage(valid, { claimedMime: "image/png", maxBytes: 1, maxPixels: 100 }),
    ).rejects.toMatchObject({ status: 413, code: "IMAGE_TOO_LARGE" });
    await expect(
      validateImage(valid, { claimedMime: "image/png", maxBytes: 1024 * 1024, maxPixels: 3 }),
    ).rejects.toMatchObject({ status: 422, code: "IMAGE_TOO_MANY_PIXELS" });
  });
});

describe("moment lifecycle on real PostgreSQL", () => {
  let database: TestDatabase;
  const ctx = { homeId: randomUUID(), userId: randomUUID() };

  beforeAll(async () => {
    database = await createTestDatabase();
    await runMigrations(database.pool);
    await database.pool.query(
      "INSERT INTO users(id,email,display_name,password_hash) VALUES($1,'moment@example.test','M','x')",
      [ctx.userId],
    );
    await database.pool.query(
      "INSERT INTO homes(id,name,start_date) VALUES($1,'M','2020-01-01')",
      [ctx.homeId],
    );
    await database.pool.query(
      "INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,1)",
      [ctx.homeId, ctx.userId],
    );
  });

  afterAll(async () => {
    await database?.cleanup();
  });

  it("returns moments in stable reverse timeline order with photo DTOs", async () => {
    const moments = createMomentService(database.pool);
    const older = await moments.create(ctx, {
      title: "旧点滴",
      date: "2026-09-20",
      body: "旧正文",
    });
    const newer = await moments.create(ctx, {
      title: "新点滴",
      date: "2026-09-23",
      body: "新正文",
    });
    await database.pool.query(
      `INSERT INTO photos(home_id,moment_id,storage_name,original_filename,mime_type,byte_size,sha256,uploaded_by)
       VALUES($1,$2,$3,'display.jpg','image/jpeg',3,$4,$5)`,
      [ctx.homeId, newer.id, `${"1".repeat(32)}.jpg`, "b".repeat(64), ctx.userId],
    );

    const list = await moments.list(ctx);
    expect(list.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(list[0]).toMatchObject({
      title: "新点滴",
      photos: [{ filename: "display.jpg", mime: "image/jpeg", bytes: 3 }],
    });
    expect(list[1].photos).toEqual([]);
  });

  it("queues every referenced file in the same transaction when deleting a moment", async () => {
    const moments = createMomentService(database.pool);
    const moment = await moments.create(ctx, {
      title: "要删除",
      date: "2026-09-22",
      body: "",
    });
    const photoId = randomUUID();
    const storageName = `${"2".repeat(32)}.png`;
    await database.pool.query(
      `INSERT INTO photos(id,home_id,moment_id,storage_name,original_filename,mime_type,byte_size,sha256,uploaded_by)
       VALUES($1,$2,$3,$4,'safe.png','image/png',8,$5,$6)`,
      [photoId, ctx.homeId, moment.id, storageName, "c".repeat(64), ctx.userId],
    );

    await moments.remove(ctx, moment.id, 1);

    expect((await database.pool.query("SELECT * FROM photos WHERE id=$1", [photoId])).rowCount).toBe(0);
    expect(
      (await database.pool.query("SELECT storage_name,photo_id FROM photo_cleanup_queue WHERE storage_name=$1", [storageName])).rows,
    ).toEqual([{ storage_name: storageName, photo_id: photoId }]);
    expect(
      (await database.pool.query("SELECT resource_type,action,version FROM home_events WHERE resource_id=$1 ORDER BY id DESC LIMIT 1", [moment.id])).rows[0],
    ).toEqual({ resource_type: "moment", action: "deleted", version: 2 });
  });
});

describe("photo file and database lifecycle", () => {
  let database: TestDatabase;
  let attachmentsDirectory: string;
  const ctx = { homeId: randomUUID(), userId: randomUUID() };

  beforeAll(async () => {
    database = await createTestDatabase();
    const testRoot = path.resolve(".local/tests/photo-lifecycle");
    await mkdir(testRoot, { recursive: true });
    attachmentsDirectory = await mkdtemp(path.join(testRoot, "attachments-"));
    await mkdir(path.join(attachmentsDirectory, "photos"), { recursive: true });
    await runMigrations(database.pool);
    await database.pool.query(
      "INSERT INTO users(id,email,display_name,password_hash) VALUES($1,'photo@example.test','P','x')",
      [ctx.userId],
    );
    await database.pool.query(
      "INSERT INTO homes(id,name,start_date) VALUES($1,'P','2020-01-01')",
      [ctx.homeId],
    );
    await database.pool.query(
      "INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,1)",
      [ctx.homeId, ctx.userId],
    );
  });

  afterAll(async () => {
    await database?.cleanup();
    await rm(attachmentsDirectory, { recursive: true, force: true });
  });

  it("stores a validated image under a random name and advances the parent version", async () => {
    const moment = await createMomentService(database.pool).create(ctx, {
      title: "有照片",
      date: "2026-09-23",
      body: "",
    });
    const bytes = await readFile(path.join(imageFixtures, "valid.jpg"));
    const photos = createPhotoService(database.pool, attachmentsDirectory, {
      maxBytes: 1024 * 1024,
      maxPixels: 100,
    });

    const result = await photos.upload(ctx, moment.id, {
      filename: "相册照片.jpg",
      claimedMime: "image/jpeg",
      data: bytes,
      version: 1,
    });

    expect(result).toMatchObject({
      photo: { filename: "相册照片.jpg", mime: "image/jpeg", bytes: bytes.length },
      version: 2,
    });
    const stored = await database.pool.query<{ storage_name: string; sha256: string }>(
      "SELECT storage_name,sha256 FROM photos WHERE id=$1",
      [result.photo.id],
    );
    expect(stored.rows[0].storage_name).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(stored.rows[0].storage_name).not.toContain("相册照片");
    expect(
      await readFile(path.join(attachmentsDirectory, "photos", stored.rows[0].storage_name)),
    ).toEqual(bytes);
    expect((await createMomentService(database.pool).get(ctx, moment.id)).version).toBe(2);
  });

  it("does not create a formal file while an exclusive maintenance lock is held", async () => {
    const moment = await createMomentService(database.pool).create(ctx, {
      title: "维护窗口",
      date: "2026-09-23",
      body: "",
    });
    const photos = createPhotoService(database.pool, attachmentsDirectory, {
      maxBytes: 1024 * 1024,
      maxPixels: 100,
    });
    const before = new Set(await readdir(path.join(attachmentsDirectory, "photos")));
    const maintenance = await database.pool.connect();
    await maintenance.query("BEGIN");
    await maintenance.query("SELECT pg_advisory_xact_lock($1)", [WRITE_TRANSACTION_LOCK_KEY]);
    const pendingUpload = photos.upload(ctx, moment.id, {
      filename: "maintenance.png",
      claimedMime: "image/png",
      data: await readFile(path.join(imageFixtures, "valid.png")),
      version: 1,
    });

    let duringMaintenance: Set<string> | undefined;
    try {
      const deadline = Date.now() + 2_000;
      while (true) {
        const waiting = await database.pool.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_stat_activity
           WHERE datname=$1 AND wait_event_type='Lock'
             AND query LIKE '%pg_advisory_xact_lock_shared%'`,
          [database.name],
        );
        if (waiting.rows[0].count > 0) break;
        if (Date.now() > deadline) throw new Error("upload did not reach the maintenance lock");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      duringMaintenance = new Set(await readdir(path.join(attachmentsDirectory, "photos")));
    } finally {
      await maintenance.query("COMMIT");
      maintenance.release();
    }
    const uploaded = await pendingUpload;

    expect(duringMaintenance).toEqual(before);
    expect(uploaded.version).toBe(2);
  });

  it("rejects path-like display names and stale parent versions without leaving files", async () => {
    const moment = await createMomentService(database.pool).create(ctx, {
      title: "路径安全",
      date: "2026-09-23",
      body: "",
    });
    const photos = createPhotoService(database.pool, attachmentsDirectory, {
      maxBytes: 1024 * 1024,
      maxPixels: 100,
    });
    const bytes = await readFile(path.join(imageFixtures, "valid.png"));
    const before = new Set(await readdir(path.join(attachmentsDirectory, "photos")));

    await expect(
      photos.upload(ctx, moment.id, {
        filename: "../../x.png",
        claimedMime: "image/png",
        data: bytes,
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_FILENAME" });
    await createMomentService(database.pool).update(ctx, moment.id, { title: "版本已更新", version: 1 });
    await expect(
      photos.upload(ctx, moment.id, {
        filename: "safe.png",
        claimedMime: "image/png",
        data: bytes,
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(new Set(await readdir(path.join(attachmentsDirectory, "photos")))).toEqual(before);
  });

  it("removes the formal file when the database insert fails after the move", async () => {
    const moment = await createMomentService(database.pool).create(ctx, {
      title: "故障注入",
      date: "2026-09-23",
      body: "",
    });
    await database.pool.query(`
      CREATE FUNCTION reject_test_photo() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.original_filename = 'db-fail.jpg' THEN RAISE EXCEPTION 'injected insert failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER reject_test_photo BEFORE INSERT ON photos
        FOR EACH ROW EXECUTE FUNCTION reject_test_photo()
    `);
    const photos = createPhotoService(database.pool, attachmentsDirectory, {
      maxBytes: 1024 * 1024,
      maxPixels: 100,
    });
    const before = new Set(await readdir(path.join(attachmentsDirectory, "photos")));

    await expect(
      photos.upload(ctx, moment.id, {
        filename: "db-fail.jpg",
        claimedMime: "image/jpeg",
        data: await readFile(path.join(imageFixtures, "valid.jpg")),
        version: 1,
      }),
    ).rejects.toBeTruthy();

    expect(new Set(await readdir(path.join(attachmentsDirectory, "photos")))).toEqual(before);
    expect((await verifyStorage(database.pool, attachmentsDirectory)).unknownOrphans).toEqual([]);
  });

  it("does not create a database reference when the temporary write cannot start", async () => {
    const moment = await createMomentService(database.pool).create(ctx, {
      title: "临时写失败",
      date: "2026-09-23",
      body: "",
    });
    const blockedRoot = path.join(attachmentsDirectory, "blocked-root");
    await writeFile(blockedRoot, "not a directory");
    const photos = createPhotoService(database.pool, blockedRoot, {
      maxBytes: 1024 * 1024,
      maxPixels: 100,
    });

    await expect(
      photos.upload(ctx, moment.id, {
        filename: "safe.jpg",
        claimedMime: "image/jpeg",
        data: await readFile(path.join(imageFixtures, "valid.jpg")),
        version: 1,
      }),
    ).rejects.toBeTruthy();

    expect(
      (await database.pool.query("SELECT count(*)::int AS count FROM photos WHERE moment_id=$1", [moment.id]))
        .rows[0].count,
    ).toBe(0);
    expect((await createMomentService(database.pool).get(ctx, moment.id)).version).toBe(1);
  });

  it("queues photo deletion and cleans the file idempotently", async () => {
    const moment = await createMomentService(database.pool).create(ctx, {
      title: "清理",
      date: "2026-09-23",
      body: "",
    });
    const photos = createPhotoService(database.pool, attachmentsDirectory, {
      maxBytes: 1024 * 1024,
      maxPixels: 100,
    });
    const uploaded = await photos.upload(ctx, moment.id, {
      filename: "cleanup.webp",
      claimedMime: "image/webp",
      data: await readFile(path.join(imageFixtures, "valid.webp")),
      version: 1,
    });
    const stored = await database.pool.query<{ storage_name: string }>(
      "SELECT storage_name FROM photos WHERE id=$1",
      [uploaded.photo.id],
    );

    await expect(photos.remove(ctx, uploaded.photo.id, 1)).rejects.toMatchObject({ status: 409 });
    await expect(photos.remove(ctx, uploaded.photo.id, 2)).resolves.toEqual({ ok: true, version: 3 });
    expect((await verifyStorage(database.pool, attachmentsDirectory)).pendingCleanup).toHaveLength(1);
    await expect(runPhotoCleanup(database.pool, attachmentsDirectory)).resolves.toBe(1);
    await expect(runPhotoCleanup(database.pool, attachmentsDirectory)).resolves.toBe(0);
    expect(
      await readFile(path.join(attachmentsDirectory, "photos", stored.rows[0].storage_name)).catch(
        () => undefined,
      ),
    ).toBeUndefined();
    expect((await verifyStorage(database.pool, attachmentsDirectory)).pendingCleanup).toEqual([]);
  });

  it("keeps a cleanup queue item after an interrupted filesystem deletion", async () => {
    const storageName = `${"e".repeat(32)}.png`;
    const filePath = path.join(attachmentsDirectory, "photos", storageName);
    await mkdir(filePath);
    await database.pool.query(
      `INSERT INTO photo_cleanup_queue(storage_name,home_id,photo_id,sha256,byte_size)
       VALUES($1,$2,$3,$4,1)`,
      [storageName, ctx.homeId, randomUUID(), "e".repeat(64)],
    );

    await expect(runPhotoCleanup(database.pool, attachmentsDirectory)).resolves.toBe(0);
    expect(
      (await database.pool.query("SELECT attempts,last_error FROM photo_cleanup_queue WHERE storage_name=$1", [storageName]))
        .rows[0],
    ).toMatchObject({ attempts: 1, last_error: expect.any(String) });

    await rm(filePath, { recursive: true });
    await expect(runPhotoCleanup(database.pool, attachmentsDirectory)).resolves.toBe(1);
    expect(
      (await database.pool.query("SELECT 1 FROM photo_cleanup_queue WHERE storage_name=$1", [storageName])).rowCount,
    ).toBe(0);
  });

  it("reports damaged pending-cleanup files as hash mismatches without calling them orphans", async () => {
    const storageName = `${"d".repeat(32)}.jpg`;
    await writeFile(path.join(attachmentsDirectory, "photos", storageName), "changed");
    await database.pool.query(
      `INSERT INTO photo_cleanup_queue(storage_name,home_id,photo_id,sha256,byte_size)
       VALUES($1,$2,$3,$4,3)`,
      [storageName, ctx.homeId, randomUUID(), "d".repeat(64)],
    );

    const report = await verifyStorage(database.pool, attachmentsDirectory);
    expect(report.pendingCleanup).toContainEqual({ storageName, exists: true });
    expect(report.hashMismatches).toContain(storageName);
    expect(report.unknownOrphans).not.toContain(storageName);

    await runPhotoCleanup(database.pool, attachmentsDirectory);
  });

  it("separates broken references, hash damage and unknown orphans", async () => {
    const moment = await createMomentService(database.pool).create(ctx, {
      title: "一致性",
      date: "2026-09-23",
      body: "",
    });
    const photos = createPhotoService(database.pool, attachmentsDirectory, {
      maxBytes: 1024 * 1024,
      maxPixels: 100,
    });
    const first = await photos.upload(ctx, moment.id, {
      filename: "missing.png",
      claimedMime: "image/png",
      data: await readFile(path.join(imageFixtures, "valid.png")),
      version: 1,
    });
    const second = await photos.upload(ctx, moment.id, {
      filename: "damaged.jpg",
      claimedMime: "image/jpeg",
      data: await readFile(path.join(imageFixtures, "valid.jpg")),
      version: 2,
    });
    const linked = await photos.upload(ctx, moment.id, {
      filename: "linked.webp",
      claimedMime: "image/webp",
      data: await readFile(path.join(imageFixtures, "valid.webp")),
      version: 3,
    });
    const rows = await database.pool.query<{ id: string; storage_name: string }>(
      "SELECT id,storage_name FROM photos WHERE id=ANY($1::uuid[])",
      [[first.photo.id, second.photo.id, linked.photo.id]],
    );
    const byId = new Map(rows.rows.map((row) => [row.id, row.storage_name]));
    await rm(path.join(attachmentsDirectory, "photos", byId.get(first.photo.id)!));
    await writeFile(path.join(attachmentsDirectory, "photos", byId.get(second.photo.id)!), "damaged");
    const linkedPath = path.join(attachmentsDirectory, "photos", byId.get(linked.photo.id)!);
    await rm(linkedPath);
    await symlink(path.join(imageFixtures, "valid.webp"), linkedPath);
    await symlink(
      path.join(imageFixtures, "valid.jpg"),
      path.join(attachmentsDirectory, "photos", `${"a".repeat(32)}.jpg`),
    );
    await mkdir(path.join(attachmentsDirectory, "photos", `${"b".repeat(32)}.png`));
    await writeFile(path.join(attachmentsDirectory, "photos", `${"f".repeat(32)}.jpg`), "orphan");
    await symlink(
      path.join(imageFixtures, "valid.png"),
      path.join(attachmentsDirectory, "tmp", "linked.upload"),
    );
    await mkdir(path.join(attachmentsDirectory, "tmp", "nested"));
    await writeFile(path.join(attachmentsDirectory, "tmp", "stale.upload"), "partial");

    const report = await verifyStorage(database.pool, attachmentsDirectory);
    expect(report.brokenReferences).toEqual(
      expect.arrayContaining([byId.get(first.photo.id), byId.get(linked.photo.id)]),
    );
    expect(report.brokenReferences).toHaveLength(2);
    expect(report.hashMismatches).toEqual([byId.get(second.photo.id)]);
    expect(report.unknownOrphans).toEqual([
      `${"a".repeat(32)}.jpg`,
      `${"b".repeat(32)}.png`,
      `${"f".repeat(32)}.jpg`,
      "tmp/linked.upload",
      "tmp/nested",
      "tmp/stale.upload",
    ]);
  });
});
