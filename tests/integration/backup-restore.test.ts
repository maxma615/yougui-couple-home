import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/cli/migrate";
import { verifyStorage } from "../../src/cli/verify-storage";
import { WRITE_TRANSACTION_LOCK_KEY, transaction } from "../../src/lib/db";
import { requireSession } from "../../src/lib/auth-context";
import {
  acceptInvitation,
  getInvitationPreview,
  issueInvitation,
} from "../../src/modules/auth/invitation";
import { initializeAdmin, login } from "../../src/modules/auth/service";
import { sessionCookieHeader } from "../../src/modules/auth/session";
import { createHome } from "../../src/modules/home/service";
import { createCalendarService } from "../../src/modules/calendar/service";
import type { CalendarEventDto } from "../../src/modules/calendar/schema";
import { runPhotoCleanup } from "../../src/modules/photos/cleanup";
import {
  createBackup,
  type BackupResult,
  withBackupSnapshotLocks,
  withMaintenanceLock,
} from "../../src/modules/backup/backup";
import { restoreBackup } from "../../src/modules/backup/restore";
import {
  MANIFEST_MAX_BYTES,
  encodeManifest,
  parseManifestBytes,
  writeEncodedManifest,
  type BackupManifest,
} from "../../src/modules/backup/manifest";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

const originalPassword = "backup-owner-password";
const imageFixtures = path.resolve(process.cwd(), "tests/fixtures/images");

type Fixture = {
  database: TestDatabase;
  attachments: string;
  backupRoot: string;
  oldSessionToken: string;
  unusedInvitationToken: string;
  calendarContext: { homeId: string; userId: string };
  calendarEvents: CalendarEventDto[];
};

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.allSettled(cleanups.splice(0).map((cleanup) => cleanup()));
});

function requestWithSession(token: string): Request {
  return new Request("http://localhost/api/session", {
    headers: { cookie: sessionCookieHeader(token) },
  });
}

async function tempDirectory(prefix: string): Promise<string> {
  const testRoot = path.resolve(process.cwd(), ".local/tests/backup");
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testRoot, prefix));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function isolatedDatabase(): Promise<TestDatabase> {
  const database = await createTestDatabase();
  cleanups.push(() => database.cleanup());
  return database;
}

async function seedBackupFixture(): Promise<Fixture> {
  const database = await isolatedDatabase();
  const attachments = await tempDirectory("couple-home-backup-source-");
  const backupRoot = await tempDirectory("couple-home-backups-");
  await mkdir(path.join(attachments, "photos"), { recursive: true });
  await runMigrations(database.pool);

  const owner = await initializeAdmin(
    { email: "owner@example.test", displayName: "甲", password: originalPassword },
    database.pool,
  );
  const home = await createHome(
    owner.id,
    { name: "备份小屋", startDate: "2020-01-01", displayName: "甲" },
    database.pool,
    new Date("2026-09-23T00:00:00+08:00"),
  );
  const context = { userId: owner.id, homeId: home.id };
  const joinInvitation = await issueInvitation(
    context,
    new Date(Date.now() + 60_000),
    database.pool,
  );
  const unusedInvitation = await issueInvitation(
    context,
    new Date(Date.now() + 60_000),
    database.pool,
  );
  const partner = await acceptInvitation(
    joinInvitation.token,
    {
      email: "partner@example.test",
      displayName: "乙",
      password: "backup-partner-password",
    },
    database.pool,
  );
  const oldSession = await login(
    { email: owner.email, password: originalPassword },
    database.pool,
  );
  const calendar = createCalendarService(database.pool);
  const allDay = await calendar.create(context, {
    title: "跨月旅行",
    allDay: true,
    start: "2026-10-30",
    end: "2026-11-02",
    location: "山里小屋",
    description: "跨过十月与十一月",
  });
  await calendar.update(
    { homeId: home.id, userId: partner.user.id },
    allDay.id,
    { version: allDay.version, description: "两位成员确认后的跨月行程" },
  );
  await calendar.create(
    { homeId: home.id, userId: partner.user.id },
    {
      title: "DST 回拨时刻",
      allDay: false,
      start: "2026-11-01T01:30:00-04:00",
      end: "2026-11-01T01:30:00-05:00",
      location: "纽约",
      description: "相同墙上时间，对应相隔一小时的真实时刻",
    },
  );

  await database.pool.query(
    `INSERT INTO anniversaries(home_id,title,date,note,yearly,created_by,updated_by)
     VALUES($1,'相识日','2020-02-29','每年纪念',true,$2,$2)`,
    [home.id, owner.id],
  );
  const alreadyRemovedName = `${"d".repeat(32)}.jpg`;
  const alreadyRemovedBytes = await readFile(path.join(imageFixtures, "valid.jpg"));
  await database.pool.query(
    `INSERT INTO photo_cleanup_queue(storage_name,home_id,photo_id,sha256,byte_size)
     VALUES($1,$2,$3,$4,$5)`,
    [
      alreadyRemovedName,
      home.id,
      randomUUID(),
      createHash("sha256").update(alreadyRemovedBytes).digest("hex"),
      alreadyRemovedBytes.length,
    ],
  );
  await database.pool.query(
    `INSERT INTO todos(home_id,title,description,assignee_id,due_date,completed,created_by,updated_by)
     VALUES($1,'准备晚餐','买菜',$2,'2026-09-30',false,$3,$3)`,
    [home.id, partner.user.id, owner.id],
  );
  const momentId = randomUUID();
  await database.pool.query(
    `INSERT INTO moments(id,home_id,title,date,body,created_by,updated_by)
     VALUES($1,$2,'海边','2026-09-20','两张照片',$3,$3)`,
    [momentId, home.id, owner.id],
  );

  const activeFiles = [
    { name: `${"a".repeat(32)}.jpg`, fixture: "valid.jpg", mime: "image/jpeg" },
    { name: `${"b".repeat(32)}.png`, fixture: "valid.png", mime: "image/png" },
  ];
  for (const item of activeFiles) {
    const bytes = await readFile(path.join(imageFixtures, item.fixture));
    await writeFile(path.join(attachments, "photos", item.name), bytes);
    await database.pool.query(
      `INSERT INTO photos(home_id,moment_id,storage_name,original_filename,mime_type,byte_size,sha256,uploaded_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        home.id,
        momentId,
        item.name,
        item.fixture,
        item.mime,
        bytes.length,
        createHash("sha256").update(bytes).digest("hex"),
        owner.id,
      ],
    );
  }

  const pendingName = `${"c".repeat(32)}.webp`;
  const pendingBytes = await readFile(path.join(imageFixtures, "valid.webp"));
  await writeFile(path.join(attachments, "photos", pendingName), pendingBytes);
  await database.pool.query(
    `INSERT INTO photo_cleanup_queue(storage_name,home_id,photo_id,sha256,byte_size)
     VALUES($1,$2,$3,$4,$5)`,
    [
      pendingName,
      home.id,
      randomUUID(),
      createHash("sha256").update(pendingBytes).digest("hex"),
      pendingBytes.length,
    ],
  );

  return {
    database,
    attachments,
    backupRoot,
    oldSessionToken: oldSession.token,
    unusedInvitationToken: unusedInvitation.token,
    calendarContext: context,
    calendarEvents: (await calendar.list(context)) as CalendarEventDto[],
  };
}

async function backupFixture(fixture: Fixture): Promise<BackupResult> {
  return createBackup({
    databaseUrl: fixture.database.databaseUrl,
    attachmentsDir: fixture.attachments,
    destinationRoot: fixture.backupRoot,
  });
}

async function userTableCount(target: Pool): Promise<number> {
  const result = await target.query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM pg_catalog.pg_tables
     WHERE schemaname NOT IN ('pg_catalog','information_schema')`,
  );
  return result.rows[0].count;
}

describe("consistent backup and empty-target restore", () => {
  it("round-trips a valid manifest larger than the former one MiB reader limit", () => {
    const pendingCleanupMissing = Array.from({ length: 8_000 }, (_, index) => ({
      storageName: `${index.toString(16).padStart(32, "0")}.jpg`,
      bytes: 1,
      sha256: "a".repeat(64),
    }));
    const manifest: BackupManifest = {
      format: "couple-home-backup",
      formatVersion: 1,
      backupId: "20260923T010000Z-abcdef123456",
      createdAt: "2026-09-23T01:00:00.000Z",
      schemaMigrations: [],
      files: [
        { path: "database.dump", kind: "database", bytes: 1, sha256: "b".repeat(64) },
      ],
      pendingCleanupMissing,
      totalBytes: 1,
    };

    const encoded = encodeManifest(manifest);

    expect(encoded.length).toBeGreaterThan(1024 * 1024);
    expect(encoded.length).toBeLessThan(MANIFEST_MAX_BYTES);
    expect(parseManifestBytes(encoded).pendingCleanupMissing).toHaveLength(8_000);
  });

  it("rejects manifest bytes above the shared limit before writing a completion marker", async () => {
    const output = await tempDirectory("couple-home-oversized-manifest-");

    await expect(
      writeEncodedManifest(output, Buffer.alloc(MANIFEST_MAX_BYTES + 1)),
    ).rejects.toThrow(/manifest.*large/i);
    await expect(readdir(output)).resolves.toEqual([]);
  });

  it("restores M2 records, calendar events, active photos and pending cleanup state into an empty target", async () => {
    const fixture = await seedBackupFixture();
    const backup = await backupFixture(fixture);
    const restored = await isolatedDatabase();
    const restoredAttachments = await tempDirectory("couple-home-restore-target-");

    await restoreBackup({
      backupDir: backup.directory,
      databaseUrl: restored.databaseUrl,
      attachmentsDir: restoredAttachments,
    });

    const counts = await restored.pool.query<{
      users: number;
      anniversaries: number;
      todos: number;
      moments: number;
      calendar_events: number;
      photos: number;
      cleanup: number;
      sessions: number;
      active_invites: number;
    }>(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM anniversaries) AS anniversaries,
      (SELECT count(*)::int FROM todos) AS todos,
      (SELECT count(*)::int FROM moments) AS moments,
      (SELECT count(*)::int FROM calendar_events) AS calendar_events,
      (SELECT count(*)::int FROM photos) AS photos,
      (SELECT count(*)::int FROM photo_cleanup_queue) AS cleanup,
      (SELECT count(*)::int FROM sessions) AS sessions,
      (SELECT count(*)::int FROM invitations WHERE consumed_at IS NULL AND expires_at > now()) AS active_invites`);
    expect(counts.rows[0]).toEqual({
      users: 2,
      anniversaries: 1,
      todos: 1,
      moments: 1,
      calendar_events: fixture.calendarEvents.length,
      photos: 2,
      cleanup: 2,
      sessions: 0,
      active_invites: 0,
    });

    const restoredCalendarEvents = (await createCalendarService(restored.pool).list(
      fixture.calendarContext,
    )) as CalendarEventDto[];
    expect(restoredCalendarEvents).toHaveLength(fixture.calendarEvents.length);
    expect([...restoredCalendarEvents].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...fixture.calendarEvents].sort((a, b) => a.id.localeCompare(b.id)),
    );
    const restoredAllDay = restoredCalendarEvents.find((event) => event.allDay);
    expect(restoredAllDay).toMatchObject({
      title: "跨月旅行",
      start: "2026-10-30",
      end: "2026-11-02",
      version: 2,
      createdBy: fixture.calendarContext.userId,
      description: "两位成员确认后的跨月行程",
    });
    expect(restoredAllDay?.updatedBy).not.toBe(restoredAllDay?.createdBy);
    const restoredTimed = restoredCalendarEvents.find((event) => !event.allDay);
    expect(restoredTimed).toMatchObject({
      title: "DST 回拨时刻",
      start: "2026-11-01T05:30:00.000Z",
      end: "2026-11-01T06:30:00.000Z",
      version: 1,
    });
    expect(restoredTimed?.createdBy).toBe(restoredTimed?.updatedBy);

    const storage = await verifyStorage(restored.pool, restoredAttachments);
    expect(storage.summary).toEqual({
      valid: 2,
      pendingCleanup: 2,
      unknownOrphans: 0,
      brokenReferences: 0,
      hashMismatches: 0,
    });
    expect(storage.pendingCleanup).toEqual([
      { storageName: `${"c".repeat(32)}.webp`, exists: true },
      { storageName: `${"d".repeat(32)}.jpg`, exists: false },
    ]);
    await expect(
      requireSession(requestWithSession(fixture.oldSessionToken), restored.pool),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      getInvitationPreview(fixture.unusedInvitationToken, restored.pool),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      login({ email: "owner@example.test", password: originalPassword }, restored.pool),
    ).resolves.toMatchObject({ user: { email: "owner@example.test" } });
    await expect(readdir(restoredAttachments)).resolves.not.toContain(".restore-in-progress");
    await expect(readdir(restoredAttachments)).resolves.not.toContain(".restore-failed");
  });

  it("rejects a checksum mismatch before writing either empty target", async () => {
    const fixture = await seedBackupFixture();
    const backup = await backupFixture(fixture);
    const restored = await isolatedDatabase();
    const restoredAttachments = await tempDirectory("couple-home-tampered-target-");
    const archivePath = path.join(backup.directory, "database.dump");
    const archive = await readFile(archivePath);
    archive[0] ^= 0xff;
    await writeFile(archivePath, archive);

    await expect(
      restoreBackup({
        backupDir: backup.directory,
        databaseUrl: restored.databaseUrl,
        attachmentsDir: restoredAttachments,
      }),
    ).rejects.toThrow(/checksum/i);
    await expect(userTableCount(restored.pool)).resolves.toBe(0);
    await expect(readdir(restoredAttachments)).resolves.toEqual([]);
  });

  it("rejects symbolic links in a backup before touching either target", async () => {
    const fixture = await seedBackupFixture();
    const backup = await backupFixture(fixture);
    const restored = await isolatedDatabase();
    const restoredAttachments = await tempDirectory("couple-home-symlink-target-");
    const marker = path.join(backup.directory, "COMPLETE");
    await rm(marker);
    await symlink("manifest.json", marker);

    await expect(
      restoreBackup({
        backupDir: backup.directory,
        databaseUrl: restored.databaseUrl,
        attachmentsDir: restoredAttachments,
      }),
    ).rejects.toThrow(/symbolic link/i);
    await expect(userTableCount(restored.pool)).resolves.toBe(0);
    await expect(readdir(restoredAttachments)).resolves.toEqual([]);
  });

  it("refuses a non-empty database or attachment directory", async () => {
    const fixture = await seedBackupFixture();
    const backup = await backupFixture(fixture);
    const nonEmptyDatabase = await isolatedDatabase();
    const emptyAttachments = await tempDirectory("couple-home-nonempty-db-");
    await nonEmptyDatabase.pool.query("CREATE TABLE already_here(id integer)");

    await expect(
      restoreBackup({
        backupDir: backup.directory,
        databaseUrl: nonEmptyDatabase.databaseUrl,
        attachmentsDir: emptyAttachments,
      }),
    ).rejects.toThrow(/empty database/i);

    const emptyDatabase = await isolatedDatabase();
    const nonEmptyAttachments = await tempDirectory("couple-home-nonempty-files-");
    await writeFile(path.join(nonEmptyAttachments, "keep.txt"), "do not overwrite");
    await expect(
      restoreBackup({
        backupDir: backup.directory,
        databaseUrl: emptyDatabase.databaseUrl,
        attachmentsDir: nonEmptyAttachments,
      }),
    ).rejects.toThrow(/empty attachment/i);
    await expect(readFile(path.join(nonEmptyAttachments, "keep.txt"), "utf8")).resolves.toBe(
      "do not overwrite",
    );
  });

  it("refuses overlapping backup and attachment paths", async () => {
    const fixture = await seedBackupFixture();
    const nestedBackupRoot = path.join(fixture.attachments, "nested-backups");
    await expect(
      createBackup({
        databaseUrl: fixture.database.databaseUrl,
        attachmentsDir: fixture.attachments,
        destinationRoot: nestedBackupRoot,
      }),
    ).rejects.toThrow(/overlap/i);
    await expect(lstat(nestedBackupRoot)).rejects.toMatchObject({ code: "ENOENT" });

    const backup = await backupFixture(fixture);
    const restored = await isolatedDatabase();
    await expect(
      restoreBackup({
        backupDir: backup.directory,
        databaseUrl: restored.databaseUrl,
        attachmentsDir: path.join(backup.directory, "restore-target"),
      }),
    ).rejects.toThrow(/overlap/i);
    await expect(userTableCount(restored.pool)).resolves.toBe(0);
  });

  it("holds an exclusive maintenance lock that blocks writes and photo cleanup transactions", async () => {
    const database = await isolatedDatabase();
    const attachments = await tempDirectory("couple-home-lock-cleanup-");
    await mkdir(path.join(attachments, "photos"), { recursive: true });
    await runMigrations(database.pool);
    const userId = randomUUID();
    const homeId = randomUUID();
    const pendingName = `${"e".repeat(32)}.jpg`;
    const bytes = Buffer.from("pending-cleanup");
    await writeFile(path.join(attachments, "photos", pendingName), bytes);
    await database.pool.query(
      "INSERT INTO users(id,email,display_name,password_hash) VALUES($1,'lock@example.test','L','x')",
      [userId],
    );
    await database.pool.query(
      "INSERT INTO homes(id,name,start_date) VALUES($1,'Lock','2020-01-01')",
      [homeId],
    );
    await database.pool.query(
      `INSERT INTO photo_cleanup_queue(storage_name,home_id,photo_id,sha256,byte_size)
       VALUES($1,$2,$3,$4,$5)`,
      [pendingName, homeId, randomUUID(), createHash("sha256").update(bytes).digest("hex"), bytes.length],
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let acquired!: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const maintenance = withMaintenanceLock(database.pool, async () => {
      acquired();
      await held;
    });
    await lockAcquired;

    let writeFinished = false;
    const write = transaction(async (tx) => {
      await tx.query("SELECT 1");
      writeFinished = true;
    }, database.pool);
    let cleanupFinished = false;
    const cleanup = runPhotoCleanup(database.pool, attachments, 1).then((count) => {
      cleanupFinished = true;
      return count;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(writeFinished).toBe(false);
    expect(cleanupFinished).toBe(false);
    const waiting = await database.pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pg_locks
       WHERE locktype='advisory' AND objid=$1 AND NOT granted`,
      [WRITE_TRANSACTION_LOCK_KEY],
    );
    expect(waiting.rows[0].count).toBeGreaterThan(0);

    release();
    await maintenance;
    await write;
    await expect(cleanup).resolves.toBe(1);
    expect(writeFinished).toBe(true);
    expect(cleanupFinished).toBe(true);
  });

  it("holds the migration lock for the entire backup snapshot window", async () => {
    const database = await isolatedDatabase();
    await runMigrations(database.pool);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let acquired!: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const snapshot = withBackupSnapshotLocks(database.pool, async () => {
      acquired();
      await held;
    });
    await lockAcquired;

    const migrationClient = await database.pool.connect();
    let migrationLockAcquired = false;
    const migration = migrationClient.query("SELECT pg_advisory_lock($1)", [71_923_002]).then(() => {
      migrationLockAcquired = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(migrationLockAcquired).toBe(false);
    release();
    await snapshot;
    await migration;
    expect(migrationLockAcquired).toBe(true);
    await migrationClient.query("SELECT pg_advisory_unlock($1)", [71_923_002]);
    migrationClient.release();
  });

  it("keeps the startup-blocking marker when restore mutates the target and later fails", async () => {
    const fixture = await seedBackupFixture();
    const backup = await backupFixture(fixture);
    const restored = await isolatedDatabase();
    const restoredAttachments = await tempDirectory("couple-home-failed-restore-");
    const incompatibleMigrations = await tempDirectory("couple-home-empty-migrations-");

    await expect(
      restoreBackup({
        backupDir: backup.directory,
        databaseUrl: restored.databaseUrl,
        attachmentsDir: restoredAttachments,
        migrationsDir: incompatibleMigrations,
      }),
    ).rejects.toThrow(/drift/i);
    await expect(userTableCount(restored.pool)).resolves.toBeGreaterThan(0);
    await expect(readdir(restoredAttachments)).resolves.toContain(".restore-in-progress");
    await expect(
      readFile(path.join(restoredAttachments, ".restore-in-progress"), "utf8"),
    ).resolves.toContain('"state":"failed"');
  });
});
