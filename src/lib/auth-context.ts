import type { Pool, PoolClient } from "pg";

import { pool } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { digestToken, tokenFromRequest } from "@/modules/auth/session";

export type SessionContext = { userId: string };
export type AuthContext = SessionContext & { homeId: string };
export type AdminContext = SessionContext & { role: "admin" };
type QueryTarget = Pool | PoolClient;

export async function requireSession(
  request: Request,
  target: QueryTarget = pool,
  now = new Date(),
): Promise<SessionContext> {
  const token = tokenFromRequest(request);
  if (!token) throw new AppError(401, "authentication_required", "请先登录");
  const result = await target.query<{ user_id: string }>(
    `SELECT s.user_id FROM sessions s
     JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at > $2 AND u.disabled=false`,
    [digestToken(token), now],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(401, "authentication_required", "登录已失效，请重新登录");
  return { userId: row.user_id };
}

export async function requireAdmin(
  request: Request,
  target: QueryTarget = pool,
  now = new Date(),
): Promise<AdminContext> {
  const session = await requireSession(request, target, now);
  const result = await target.query<{ role: string; disabled: boolean }>(
    "SELECT role,disabled FROM users WHERE id=$1",
    [session.userId],
  );
  const user = result.rows[0];
  if (!user || user.disabled) {
    throw new AppError(401, "authentication_required", "登录已失效，请重新登录");
  }
  if (user.role !== "admin") {
    throw new AppError(403, "administrator_required", "需要管理员权限");
  }
  return { userId: session.userId, role: "admin" };
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
  if (!row) throw new AppError(403, "home_membership_required", "请先完成空间设置");
  return { userId: session.userId, homeId: row.home_id };
}
