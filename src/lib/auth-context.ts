import type { Pool, PoolClient } from "pg";

import { pool } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { digestToken, tokenFromRequest } from "@/modules/auth/session";

export type SessionContext = { userId: string };
export type AuthContext = SessionContext & { homeId: string };
type QueryTarget = Pool | PoolClient;

export async function requireSession(
  request: Request,
  target: QueryTarget = pool,
  now = new Date(),
): Promise<SessionContext> {
  const token = tokenFromRequest(request);
  if (!token) throw new AppError(401, "authentication_required", "请先登录");
  const result = await target.query<{ user_id: string }>(
    `SELECT user_id FROM sessions
     WHERE token_hash=$1 AND expires_at > $2`,
    [digestToken(token), now],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(401, "authentication_required", "登录已失效，请重新登录");
  return { userId: row.user_id };
}

export async function requireHomeMember(
  request: Request,
  target: QueryTarget = pool,
  now = new Date(),
): Promise<AuthContext> {
  const session = await requireSession(request, target, now);
  const result = await target.query<{ home_id: string }>(
    "SELECT home_id FROM home_members WHERE user_id=$1",
    [session.userId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(403, "home_membership_required", "请先完成小屋设置");
  return { userId: session.userId, homeId: row.home_id };
}
