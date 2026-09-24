import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";

import { loadConfig, validateRuntimeConfig } from "@/lib/config";
import { pool } from "@/lib/db";

const MIGRATION_LOCK_KEY = 71_923_002;

type AppliedMigration = {
  name: string;
  checksum: string;
};

function checksum(contents: Buffer): string {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

export async function runMigrations(
  targetPool: Pool = pool,
  migrationsDir = path.resolve(process.cwd(), "db/migrations"),
): Promise<void> {
  const client = await targetPool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const names = (await readdir(migrationsDir))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const localMigrations = new Map<string, { contents: Buffer; checksum: string }>();
    for (const name of names) {
      const contents = await readFile(path.join(migrationsDir, name));
      localMigrations.set(name, { contents, checksum: checksum(contents) });
    }

    const appliedResult = await client.query<AppliedMigration>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name",
    );
    const applied = new Map(appliedResult.rows.map((migration) => [migration.name, migration]));

    for (const migration of applied.values()) {
      const local = localMigrations.get(migration.name);
      if (!local || local.checksum !== migration.checksum) {
        throw new Error(`Migration drift detected for ${migration.name}`);
      }
    }

    for (const [name, migration] of localMigrations) {
      if (applied.has(name)) continue;
      try {
        await client.query("BEGIN");
        await client.query(migration.contents.toString("utf8"));
        await client.query(
          "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
          [name, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function main(): Promise<void> {
  try {
    await validateRuntimeConfig(loadConfig());
    await runMigrations();
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown migration error";
    console.error(`Migration failed: ${message}`);
    process.exitCode = 1;
  });
}
