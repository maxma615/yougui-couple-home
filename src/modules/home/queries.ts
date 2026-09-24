import type { Pool, PoolClient } from "pg";

import { pool } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { AuthContext } from "@/lib/auth-context";
import type { HomeDto } from "@/modules/home/schema";

type QueryTarget = Pool | PoolClient;

export async function getHome(
  context: AuthContext,
  target: QueryTarget = pool,
): Promise<HomeDto> {
  const homeResult = await target.query<{
    id: string;
    name: string;
    start_date: string;
    version: number;
  }>(
    `SELECT h.id,h.name,h.start_date::text,h.version
     FROM homes h
     JOIN home_members mine ON mine.home_id=h.id
     WHERE h.id=$1 AND mine.user_id=$2`,
    [context.homeId, context.userId],
  );
  const home = homeResult.rows[0];
  if (!home) throw new AppError(404, "home_not_found", "没有找到小屋");
  const memberResult = await target.query<{ id: string; display_name: string }>(
    `SELECT u.id,u.display_name
     FROM home_members hm JOIN users u ON u.id=hm.user_id
     WHERE hm.home_id=$1 ORDER BY hm.slot`,
    [context.homeId],
  );
  return {
    id: home.id,
    name: home.name,
    startDate: home.start_date,
    version: home.version,
    members: memberResult.rows.map((member) => ({
      id: member.id,
      displayName: member.display_name,
    })),
  };
}
