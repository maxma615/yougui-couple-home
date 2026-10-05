import type { Pool, PoolClient } from "pg";
import { requireSession } from "@/lib/auth-context";
import { pool } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { PlayerIdentity } from "./types";

export async function requireMahjongPlayer(request: Request, target: Pool | PoolClient = pool): Promise<PlayerIdentity> {
  const { userId } = await requireSession(request, target);
  const result = await target.query<{ display_name: string; role: string; disabled: boolean }>("SELECT display_name,role,disabled FROM users WHERE id=$1", [userId]);
  const user = result.rows[0];
  if (!user || user.disabled) throw new AppError(401, "authentication_required", "登录已失效，请重新登录");
  if (user.role !== "member") throw new AppError(403, "player_required", "请使用成员账号参与对局，管理员账号不占牌桌席位");
  return { userId, displayName: user.display_name };
}
