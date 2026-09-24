import type { Pool, PoolClient } from "pg";

import {
  pool as applicationPool,
  transaction,
  WRITE_TRANSACTION_LOCK_KEY,
} from "@/lib/db";

export type QueryTarget = Pool | PoolClient;

function isPool(target: QueryTarget): target is Pool {
  return typeof (target as Pool).connect === "function";
}

/**
 * Application writes use the shared backup lock. A PoolClient argument must
 * already belong to a caller-owned transaction; it is reused so the business
 * write and publishHomeEvent commit together.
 */
export async function withWriteTransaction<T>(
  target: QueryTarget,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  if (target === applicationPool) return transaction(fn);
  if (!isPool(target)) {
    await target.query("SELECT pg_advisory_xact_lock_shared($1)", [WRITE_TRANSACTION_LOCK_KEY]);
    return fn(target);
  }

  const client = await target.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock_shared($1)", [WRITE_TRANSACTION_LOCK_KEY]);
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
