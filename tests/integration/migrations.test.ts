import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { runMigrations } from "@/cli/migrate";
import { transaction, WRITE_TRANSACTION_LOCK_KEY } from "@/lib/db";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

const temporaryDirectories: string[] = [];
const databases: TestDatabase[] = [];
async function temporaryDirectory(): Promise<string> {
  const root = path.resolve(".local/tests/migrations");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "run-"));
  temporaryDirectories.push(directory);
  return directory;
}
const migrationsDirectory = fileURLToPath(
  new URL("../../db/migrations", import.meta.url),
);

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.cleanup()));
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("database migrations", () => {
  it("upgrades 0000 through 0005 users without changing identity, credentials or membership", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const legacyMigrations = await temporaryDirectory();
    const migrationNames = (await readdir(migrationsDirectory))
      .filter((name) => /^000[0-5]_.*\.sql$/.test(name))
      .sort();
    expect(migrationNames).toHaveLength(6);
    for (const name of migrationNames) {
      await writeFile(
        path.join(legacyMigrations, name),
        await readFile(path.join(migrationsDirectory, name)),
      );
    }
    await runMigrations(database.pool, legacyMigrations);

    const legacyUserId = "11111111-1111-4111-8111-111111111111";
    const legacyHomeId = "22222222-2222-4222-8222-222222222222";
    const legacyHash = "$argon2id$legacy-hash-must-stay-byte-identical";
    await database.pool.query(
      `INSERT INTO users(id,email,display_name,password_hash)
       VALUES($1,'admin@example.test','旧管理员',$2)`,
      [legacyUserId, legacyHash],
    );
    await database.pool.query(
      `INSERT INTO homes(id,name,start_date) VALUES($1,'旧小屋','2020-01-02')`,
      [legacyHomeId],
    );
    await database.pool.query(
      `INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,1)`,
      [legacyHomeId, legacyUserId],
    );

    await runMigrations(database.pool, migrationsDirectory);

    const columns = await database.pool.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name,is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='users'
         AND column_name IN ('email','phone','role','disabled')
       ORDER BY column_name`,
    );
    expect(columns.rows).toEqual([
      { column_name: "disabled", is_nullable: "NO" },
      { column_name: "email", is_nullable: "YES" },
      { column_name: "phone", is_nullable: "YES" },
      { column_name: "role", is_nullable: "NO" },
    ]);
    const legacyUser = await database.pool.query<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string;
      phone: string | null;
      role: string;
      disabled: boolean;
    }>(
      `SELECT id,email,display_name,password_hash,phone,role,disabled
       FROM users WHERE id=$1`,
      [legacyUserId],
    );
    expect(legacyUser.rows[0]).toEqual({
      id: legacyUserId,
      email: "admin@example.test",
      display_name: "旧管理员",
      password_hash: legacyHash,
      phone: null,
      role: "member",
      disabled: false,
    });
    const legacyMembership = await database.pool.query<{
      home_id: string;
      user_id: string;
      slot: number;
      home_name: string;
    }>(
      `SELECT hm.home_id,hm.user_id,hm.slot,h.name AS home_name
       FROM home_members hm JOIN homes h ON h.id=hm.home_id
       WHERE hm.user_id=$1`,
      [legacyUserId],
    );
    expect(legacyMembership.rows[0]).toEqual({
      home_id: legacyHomeId,
      user_id: legacyUserId,
      slot: 1,
      home_name: "旧小屋",
    });

    const phoneOnlyUser = await database.pool.query<{
      email: string | null;
      role: string;
      disabled: boolean;
    }>(
      `INSERT INTO users(phone,display_name,password_hash)
       VALUES('13800000011','手机号一','hash')
       RETURNING email,role,disabled`,
    );
    expect(phoneOnlyUser.rows[0]).toEqual({
      email: null,
      role: "member",
      disabled: false,
    });
    await expect(
      database.pool.query(
        `INSERT INTO users(phone,display_name,password_hash)
         VALUES('13800000011','手机号二','hash')`,
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      database.pool.query(
        `INSERT INTO users(phone,display_name,password_hash)
         VALUES('12800000011','无效手机号','hash')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("creates the core tables and enforces exactly two distinct member slots", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    await runMigrations(database.pool);

    const tables = await database.pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name`,
      [["home_members", "homes", "sessions", "users"]],
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      "home_members",
      "homes",
      "sessions",
      "users",
    ]);

    const users = await database.pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ('one@example.test', '一', 'hash'),
              ('two@example.test', '二', 'hash'),
              ('three@example.test', '三', 'hash')
       RETURNING id`,
    );
    const home = await database.pool.query<{ id: string }>(
      `INSERT INTO homes (name, start_date) VALUES ('小屋', '2026-09-23') RETURNING id`,
    );
    await database.pool.query(
      `INSERT INTO home_members (home_id, user_id, slot)
       VALUES ($1, $2, 1), ($1, $3, 2)`,
      [home.rows[0].id, users.rows[0].id, users.rows[1].id],
    );

    await expect(
      database.pool.query(
        `INSERT INTO home_members (home_id, user_id, slot) VALUES ($1, $2, 3)`,
        [home.rows[0].id, users.rows[2].id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      database.pool.query(
        `INSERT INTO home_members (home_id, user_id, slot) VALUES ($1, $2, 2)`,
        [home.rows[0].id, users.rows[2].id],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("records migration checksums and rejects an edited applied migration", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const directory = await temporaryDirectory();
    const migration = await readFile(path.join(migrationsDirectory, "0000_core.sql"), "utf8");
    await writeFile(path.join(directory, "0000_core.sql"), migration);

    await runMigrations(database.pool, directory);
    const applied = await database.pool.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations",
    );
    expect(applied.rows).toEqual([
      expect.objectContaining({
        name: "0000_core.sql",
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);

    await writeFile(path.join(directory, "0000_core.sql"), `${migration}\n-- edited after apply\n`);
    await expect(runMigrations(database.pool, directory)).rejects.toThrow(/drift/i);
  });

  it("rolls back every statement in a failed migration file", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const directory = await temporaryDirectory();
    await writeFile(
      path.join(directory, "0000_invalid.sql"),
      "CREATE TABLE must_rollback (id integer);\nSELECT definitely_not_a_function();\n",
    );

    await expect(runMigrations(database.pool, directory)).rejects.toThrow();
    const rolledBack = await database.pool.query<{ regclass: string | null }>(
      "SELECT to_regclass('public.must_rollback')::text AS regclass",
    );
    expect(rolledBack.rows[0].regclass).toBeNull();
  });

  it("runs injected-pool writes under the shared backup lock and rolls failures back", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    await runMigrations(database.pool);

    await expect(
      transaction(async (client) => {
        await client.query(
          "INSERT INTO users (email, display_name, password_hash) VALUES ('rollback@example.test', '回滚', 'hash')",
        );
        const competingClient = await database.pool.connect();
        try {
          const lock = await competingClient.query<{ acquired: boolean }>(
            "SELECT pg_try_advisory_lock($1) AS acquired",
            [WRITE_TRANSACTION_LOCK_KEY],
          );
          expect(lock.rows[0].acquired).toBe(false);
        } finally {
          competingClient.release();
        }
        throw new Error("force rollback");
      }, database.pool),
    ).rejects.toThrow("force rollback");

    const users = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users",
    );
    expect(users.rows[0].count).toBe("0");
  });
});
