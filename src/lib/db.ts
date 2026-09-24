import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import * as schema from "@/db/schema";

export const pool = new Pool({
  // Pool construction is lazy and does not open a socket. Reading the URL
  // directly keeps module discovery and production builds independent of a
  // running database; runtime commands validate the full configuration.
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

// Task 7's backup process takes the exclusive form of this lock. Every
// application write transaction shares it so backups can wait for in-flight
// writes and prevent new writes from starting at the snapshot boundary.
export const WRITE_TRANSACTION_LOCK_KEY = 71_923_001;

export async function transaction<T>(
  fn: (tx: PoolClient) => Promise<T>,
  targetPool: Pool = pool,
): Promise<T> {
  const client = await targetPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock_shared($1)", [
      WRITE_TRANSACTION_LOCK_KEY,
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
