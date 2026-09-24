import type { DatabaseError } from "pg";

import type { AuthContext } from "@/lib/auth-context";
import { pool } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { publishHomeEvent } from "@/lib/events/publisher";
import { hashPassword, validatePassword } from "@/modules/auth/password";
import {
  digestToken,
  insertPreparedSession,
  newOpaqueToken,
  prepareSession,
  type SessionToken,
} from "@/modules/auth/session";
import { type QueryTarget, withWriteTransaction } from "@/modules/auth/write-transaction";

export type InvitationPreview = { homeName: string; inviterName: string };
export type AcceptInvitationInput = {
  email: unknown;
  displayName: unknown;
  password: unknown;
};
export type AcceptedInvitation = SessionToken & {
  user: { id: string; email: string; displayName: string };
};

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new AppError(422, "validation_failed", "请检查输入内容", { email: "请输入有效邮箱地址" });
  }
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    throw new AppError(422, "validation_failed", "请检查输入内容", { email: "请输入有效邮箱地址" });
  }
  return email;
}

function normalizeDisplayName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 60) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      displayName: "显示名称不能为空且最多 60 个字符",
    });
  }
  return value.trim();
}

export async function issueInvitation(
  context: AuthContext,
  expiresAt = new Date(Date.now() + 24 * 60 * 60_000),
  target: QueryTarget = pool,
): Promise<{ token: string; expiresAt: Date }> {
  if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new AppError(422, "validation_failed", "邀请过期时间无效", {
      expiresAt: "过期时间必须晚于当前时间",
    });
  }
  const token = newOpaqueToken();
  await withWriteTransaction(target, async (tx) => {
    const home = await tx.query(
      `SELECT h.id FROM homes h
       JOIN home_members hm ON hm.home_id=h.id
       WHERE h.id=$1 AND hm.user_id=$2 FOR UPDATE OF h`,
      [context.homeId, context.userId],
    );
    if (!home.rowCount) throw new AppError(404, "home_not_found", "没有找到小屋");
    const count = await tx.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM home_members WHERE home_id=$1",
      [context.homeId],
    );
    if (count.rows[0].count >= 2) {
      throw new AppError(409, "home_full", "小屋已有两位成员");
    }
    await tx.query(
      "INSERT INTO invitations(token_hash,home_id,inviter_id,expires_at) VALUES($1,$2,$3,$4)",
      [digestToken(token), context.homeId, context.userId, expiresAt],
    );
  });
  return { token, expiresAt };
}

export async function getInvitationPreview(
  token: string,
  target: QueryTarget = pool,
  now = new Date(),
): Promise<InvitationPreview> {
  const result = await target.query<{ home_name: string; inviter_name: string }>(
    `SELECT h.name AS home_name,u.display_name AS inviter_name
     FROM invitations i
     JOIN homes h ON h.id=i.home_id
     JOIN users u ON u.id=i.inviter_id
     WHERE i.token_hash=$1 AND i.consumed_at IS NULL AND i.expires_at>$2`,
    [digestToken(token), now],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "invitation_not_found", "邀请不存在或已失效");
  return { homeName: row.home_name, inviterName: row.inviter_name };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as DatabaseError).code === "23505";
}

export async function acceptInvitation(
  token: string,
  input: AcceptInvitationInput,
  target: QueryTarget = pool,
): Promise<AcceptedInvitation> {
  const email = normalizeEmail(input.email);
  const displayName = normalizeDisplayName(input.displayName);
  validatePassword(input.password);
  const tokenHash = digestToken(token);
  const initial = await target.query<{ home_id: string }>(
    "SELECT home_id FROM invitations WHERE token_hash=$1",
    [tokenHash],
  );
  if (!initial.rows[0]) throw new AppError(404, "invitation_not_found", "邀请不存在或已失效");
  const passwordHash = await hashPassword(input.password);
  const session = prepareSession();

  try {
    return await withWriteTransaction(target, async (tx) => {
      await tx.query("SELECT id FROM homes WHERE id=$1 FOR UPDATE", [initial.rows[0].home_id]);
      const invite = await tx.query<{
        home_id: string;
        expires_at: Date;
        consumed_at: Date | null;
      }>(
        "SELECT home_id,expires_at,consumed_at FROM invitations WHERE token_hash=$1 FOR UPDATE",
        [tokenHash],
      );
      const row = invite.rows[0];
      if (!row || row.home_id !== initial.rows[0].home_id) {
        throw new AppError(404, "invitation_not_found", "邀请不存在或已失效");
      }
      if (row.consumed_at || row.expires_at <= new Date()) {
        throw new AppError(409, "invitation_unavailable", "邀请已使用、过期或无法加入");
      }
      const members = await tx.query<{ slot: number }>(
        "SELECT slot FROM home_members WHERE home_id=$1 ORDER BY slot",
        [row.home_id],
      );
      if (members.rows.length >= 2) {
        throw new AppError(409, "home_full", "小屋已有两位成员");
      }
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO users(email,display_name,password_hash)
         VALUES($1,$2,$3) RETURNING id`,
        [email, displayName, passwordHash],
      );
      const userId = inserted.rows[0].id;
      const usedSlots = new Set(members.rows.map((member) => member.slot));
      const slot = usedSlots.has(1) ? 2 : 1;
      await tx.query("INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,$3)", [
        row.home_id,
        userId,
        slot,
      ]);
      await tx.query(
        "UPDATE invitations SET consumed_at=now(),consumed_by=$1 WHERE token_hash=$2",
        [userId, tokenHash],
      );
      const updatedHome = await tx.query<{ version: number }>(
        "UPDATE homes SET version=version+1,updated_at=now() WHERE id=$1 RETURNING version",
        [row.home_id],
      );
      await insertPreparedSession(tx, userId, session);
      await publishHomeEvent(tx, {
        homeId: row.home_id,
        type: "home",
        resourceId: row.home_id,
        action: "updated",
        version: updatedHome.rows[0].version,
      });
      return { ...session, user: { id: userId, email, displayName } };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "account_exists", "该邮箱已经存在账号");
    }
    throw error;
  }
}
