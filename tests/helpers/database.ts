import crypto from "node:crypto";
import { Pool } from "pg";

export type TestDatabase = {
  name: string;
  databaseUrl: string;
  pool: Pool;
  cleanup(): Promise<void>;
};

function quoteIdentifier(value: string): string {
  if (!/^ch_[a-f0-9]+$/.test(value)) {
    throw new Error("Unsafe test database name");
  }
  return `"${value}"`;
}

function requiredAdminUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("DATABASE_URL is required to create an isolated PostgreSQL test database");
  }
  return value;
}

export async function createTestDatabase(
  adminUrl = process.env.DATABASE_URL,
): Promise<TestDatabase> {
  const source = new URL(requiredAdminUrl(adminUrl));
  const name = `ch_${crypto.randomBytes(12).toString("hex")}`;
  const adminDatabaseUrl = new URL(source);
  adminDatabaseUrl.pathname = "/postgres";
  const databaseUrl = new URL(source);
  databaseUrl.pathname = `/${name}`;
  const adminPool = new Pool({ connectionString: adminDatabaseUrl.toString(), max: 1 });

  try {
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool({ connectionString: databaseUrl.toString(), max: 4 });
  let cleaned = false;

  return {
    name,
    databaseUrl: databaseUrl.toString(),
    pool,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await pool.end();
      const cleanupPool = new Pool({ connectionString: adminDatabaseUrl.toString(), max: 1 });
      try {
        await cleanupPool.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [name],
        );
        await cleanupPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)}`);
      } finally {
        await cleanupPool.end();
      }
    },
  };
}

export async function withTestDatabase<T>(
  fn: (database: TestDatabase) => Promise<T>,
  adminUrl = process.env.DATABASE_URL,
): Promise<T> {
  const database = await createTestDatabase(adminUrl);
  try {
    return await fn(database);
  } finally {
    await database.cleanup();
  }
}
