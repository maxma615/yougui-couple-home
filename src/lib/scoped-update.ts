import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

type VersionedTable = {
  id: unknown;
  homeId: unknown;
  version: unknown;
};

type DatabaseExecutor = NodePgDatabase<Record<string, never>>;

/**
 * Pass drizzle(tx) when the caller also publishes an event. The update and
 * publishHomeEvent(tx, ...) must run before the same PoolClient commits.
 * `toPublic` must be supplied if a table row contains non-public columns.
 */
export async function updateWithVersion<Row extends Record<string, unknown>>(
  table: VersionedTable,
  id: string,
  homeId: string,
  version: number,
  patch: Partial<Row>,
  target: DatabaseExecutor = db as unknown as DatabaseExecutor,
  toPublic: (row: Row) => unknown = (row) => row,
): Promise<Row> {
  const drizzleTable = table as never;
  const columns = table as {
    id: Parameters<typeof eq>[0];
    homeId: Parameters<typeof eq>[0];
    version: Parameters<typeof eq>[0];
  };
  const updated = (await target
    .update(drizzleTable)
    .set({ ...patch, version: sql`${columns.version} + 1` })
    .where(
      and(
        eq(columns.id, id),
        eq(columns.homeId, homeId),
        eq(columns.version, version),
      ),
    )
    .returning()) as Row[];
  if (updated[0]) return updated[0];

  const current = (await target
    .select()
    .from(drizzleTable)
    .where(and(eq(columns.id, id), eq(columns.homeId, homeId)))
    .limit(1)) as Row[];
  if (!current[0]) throw new AppError(404, "resource_not_found", "没有找到该内容");
  throw new AppError(
    409,
    "version_conflict",
    "内容已被另一位成员更新",
    undefined,
    toPublic(current[0]),
  );
}
