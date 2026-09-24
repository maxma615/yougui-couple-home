import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
