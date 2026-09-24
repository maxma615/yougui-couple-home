import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { pool } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireSession } from "@/lib/auth-context";
import { auditSecurityEvent } from "@/lib/security";
import { getHome } from "@/modules/home/queries";
import type { HomeDto } from "@/modules/home/schema";
import { hashPassword, validatePassword, verifyPassword } from "@/modules/auth/password";
import {
  insertPreparedSession,
  digestToken,
  prepareSession,
  type SessionToken,
} from "@/modules/auth/session";
import {
  type QueryTarget,
  withWriteTransaction,
} from "@/modules/auth/write-transaction";

export type UserDto = { id: string; email: string; displayName: string };
export type LoginResult = SessionToken & { user: UserDto };
export type SessionSnapshot = { user: UserDto; home: HomeDto | null };

const emailSchema = z.string().trim().toLowerCase().email().max(320);

function normalizedEmail(value: unknown): string {
  const result = emailSchema.safeParse(value);
  if (!result.success) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      email: "请输入有效邮箱地址",
    });
  }
  return result.data;
}

function displayName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 60) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      displayName: "显示名称不能为空且最多 60 个字符",
    });
  }
  return value.trim();
}

type UserWithHash = UserDto & { passwordHash: string };

async function findUserByEmail(target: QueryTarget, email: string): Promise<UserWithHash | undefined> {
  const result = await target.query<{
    id: string;
    email: string;
    display_name: string;
    password_hash: string;
  }>("SELECT id,email,display_name,password_hash FROM users WHERE email=$1", [email]);
  const row = result.rows[0];
  return row
    ? { id: row.id, email: row.email, displayName: row.display_name, passwordHash: row.password_hash }
    : undefined;
}

export async function initializeAdmin(
  input: { email: unknown; displayName: unknown; password: unknown },
  target: QueryTarget = pool,
): Promise<UserDto> {
  const email = normalizedEmail(input.email);
  const name = displayName(input.displayName);
  validatePassword(input.password);
  const passwordHash = await hashPassword(input.password);

  return withWriteTransaction(target, async (tx) => {
    await tx.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
    const existing = await tx.query("SELECT 1 FROM users LIMIT 1");
    if (existing.rowCount) {
      throw new AppError(409, "already_initialized", "系统已经完成首次账号初始化");
    }
    const result = await tx.query<{ id: string; email: string; display_name: string }>(
      `INSERT INTO users(email,display_name,password_hash)
       VALUES($1,$2,$3) RETURNING id,email,display_name`,
      [email, name, passwordHash],
    );
    const row = result.rows[0];
    auditSecurityEvent("init_admin", "success", { actorId: row.id });
    return { id: row.id, email: row.email, displayName: row.display_name };
  });
}

export async function login(
  input: { email: unknown; password: unknown; previousToken?: string },
  target: QueryTarget = pool,
): Promise<LoginResult> {
  const email = normalizedEmail(input.email);
  if (
    typeof input.password !== "string" ||
    input.password.length < 1 ||
    input.password.length > 128
  ) {
    throw new AppError(401, "invalid_credentials", "邮箱或密码错误");
  }
  const candidate = await findUserByEmail(target, email);
  if (!candidate || !(await verifyPassword(candidate.passwordHash, input.password))) {
    auditSecurityEvent("login", "failure", { reason: "invalid_credentials" });
    throw new AppError(401, "invalid_credentials", "邮箱或密码错误");
  }
  const session = prepareSession();
  await withWriteTransaction(target, async (tx) => {
    const current = await tx.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id=$1 FOR UPDATE",
      [candidate.id],
    );
    if (current.rows[0]?.password_hash !== candidate.passwordHash) {
      throw new AppError(401, "invalid_credentials", "邮箱或密码错误");
    }
    if(input.previousToken) {
      await tx.query('DELETE FROM sessions WHERE token_hash=$1',[digestToken(input.previousToken)]);
    }
    await insertPreparedSession(tx, candidate.id, session);
  });
  auditSecurityEvent("login", "success", { actorId: candidate.id });
  return {
    ...session,
    user: { id: candidate.id, email: candidate.email, displayName: candidate.displayName },
  };
}

export async function changePassword(
  userId: string,
  input: { currentPassword: unknown; newPassword: unknown },
  target: QueryTarget = pool,
): Promise<SessionToken> {
  if (typeof input.currentPassword !== "string") {
    throw new AppError(401, "invalid_current_password", "当前密码错误");
  }
  validatePassword(input.newPassword, "newPassword");
  const currentResult = await target.query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id=$1",
    [userId],
  );
  const originalHash = currentResult.rows[0]?.password_hash;
  if (!originalHash || !(await verifyPassword(originalHash, input.currentPassword))) {
    throw new AppError(401, "invalid_current_password", "当前密码错误");
  }
  const newHash = await hashPassword(input.newPassword);
  const session = prepareSession();
  await withWriteTransaction(target, async (tx) => {
    const locked = await tx.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id=$1 FOR UPDATE",
      [userId],
    );
    if (locked.rows[0]?.password_hash !== originalHash) {
      throw new AppError(409, "credentials_changed", "账号凭据已变化，请重新登录");
    }
    await tx.query("UPDATE users SET password_hash=$1 WHERE id=$2", [newHash, userId]);
    await tx.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
    await insertPreparedSession(tx, userId, session);
  });
  auditSecurityEvent("password_change", "success", { actorId: userId });
  return session;
}

export async function resetPassword(
  emailInput: unknown,
  newPassword: unknown,
  target: QueryTarget = pool,
): Promise<UserDto> {
  const email = normalizedEmail(emailInput);
  validatePassword(newPassword, "newPassword");
  const candidate = await findUserByEmail(target, email);
  if (!candidate) throw new AppError(404, "account_not_found", "没有找到该账号");
  const newHash = await hashPassword(newPassword);
  await withWriteTransaction(target, async (tx) => {
    const locked = await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [candidate.id]);
    if (!locked.rowCount) throw new AppError(404, "account_not_found", "没有找到该账号");
    await tx.query("UPDATE users SET password_hash=$1 WHERE id=$2", [newHash, candidate.id]);
    await tx.query("DELETE FROM sessions WHERE user_id=$1", [candidate.id]);
  });
  auditSecurityEvent("password_reset", "success", { actorId: candidate.id });
  return { id: candidate.id, email: candidate.email, displayName: candidate.displayName };
}

export async function getSessionSnapshot(
  request: Request,
  target: QueryTarget = pool,
): Promise<SessionSnapshot> {
  const { userId } = await requireSession(request, target);
  const result = await target.query<{ id: string; email: string; display_name: string; home_id: string | null }>(
    `SELECT u.id,u.email,u.display_name,hm.home_id
     FROM users u LEFT JOIN home_members hm ON hm.user_id=u.id
     WHERE u.id=$1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(401, "authentication_required", "登录已失效，请重新登录");
  return {
    user: { id: row.id, email: row.email, displayName: row.display_name },
    home: row.home_id ? await getHome({ userId, homeId: row.home_id }, target) : null,
  };
}
