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

export type UserRole = "member" | "admin";
export type UserDto = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  role: UserRole;
};
export type LoginResult = SessionToken & { user: UserDto };
export type SessionSnapshot = { user: UserDto; home: HomeDto | null };
type LegacyAccountDto = { id: string; email: string; displayName: string };

const emailSchema = z.string().trim().toLowerCase().email().max(320);
// Generated once from a random, discarded value using the production Argon2id settings.
const UNKNOWN_ACCOUNT_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=1,t=3$iqCTHunokWU6pILoWbgQKA$O86J1jVjd4RrKydyRYKVPBiKAAN1CkCTr4jV6HjnTDg";

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

type UserWithHash = UserDto & { passwordHash: string; disabled: boolean };

async function findUserByEmail(target: QueryTarget, email: string): Promise<UserWithHash | undefined> {
  const result = await target.query<{
    id: string;
    email: string | null;
    phone: string | null;
    display_name: string;
    password_hash: string;
    role: UserRole;
    disabled: boolean;
  }>("SELECT id,email,phone,display_name,password_hash,role,disabled FROM users WHERE email=$1", [email]);
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        email: row.email,
        phone: row.phone,
        displayName: row.display_name,
        passwordHash: row.password_hash,
        role: row.role,
        disabled: row.disabled,
      }
    : undefined;
}

const phonePattern = /^1[3-9][0-9]{9}$/;

function loginIdentifier(input: {
  identifier?: unknown;
  phone?: unknown;
  email?: unknown;
}): { kind: "phone" | "email"; value: string } {
  const value = input.identifier ?? input.phone ?? input.email;
  if (typeof value !== "string") {
    throw new AppError(401, "invalid_credentials", "账号或密码错误");
  }
  const normalized = value.trim().toLowerCase();
  if (phonePattern.test(normalized)) return { kind: "phone", value: normalized };
  const email = emailSchema.safeParse(normalized);
  if (email.success) return { kind: "email", value: email.data };
  throw new AppError(401, "invalid_credentials", "账号或密码错误");
}

async function findUserByIdentifier(
  target: QueryTarget,
  identifier: { kind: "phone" | "email"; value: string },
): Promise<UserWithHash | undefined> {
  const column = identifier.kind === "phone" ? "phone" : "email";
  const result = await target.query<{
    id: string;
    email: string | null;
    phone: string | null;
    display_name: string;
    password_hash: string;
    role: UserRole;
    disabled: boolean;
  }>(
    `SELECT id,email,phone,display_name,password_hash,role,disabled FROM users WHERE ${column}=$1`,
    [identifier.value],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        email: row.email,
        phone: row.phone,
        displayName: row.display_name,
        passwordHash: row.password_hash,
        role: row.role,
        disabled: row.disabled,
      }
    : undefined;
}

export async function initializeAdmin(
  input: { email: unknown; displayName: unknown; password: unknown },
  target: QueryTarget = pool,
): Promise<LegacyAccountDto> {
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
  input: {
    identifier?: unknown;
    phone?: unknown;
    email?: unknown;
    password: unknown;
    previousToken?: string;
  },
  target: QueryTarget = pool,
): Promise<LoginResult> {
  const identifier = loginIdentifier(input);
  if (
    typeof input.password !== "string" ||
    input.password.length < 1 ||
    input.password.length > 128
  ) {
    throw new AppError(401, "invalid_credentials", "账号或密码错误");
  }
  const candidate = await findUserByIdentifier(target, identifier);
  const passwordMatches = await verifyPassword(
    candidate?.passwordHash ?? UNKNOWN_ACCOUNT_PASSWORD_HASH,
    input.password,
  );
  if (!candidate || !passwordMatches || candidate.disabled) {
    auditSecurityEvent("login", "failure", { reason: "invalid_credentials" });
    throw new AppError(401, "invalid_credentials", "账号或密码错误");
  }
  const session = prepareSession();
  await withWriteTransaction(target, async (tx) => {
    const current = await tx.query<{
      password_hash: string;
      disabled: boolean;
      role: UserRole;
    }>(
      "SELECT password_hash,disabled,role FROM users WHERE id=$1 FOR UPDATE",
      [candidate.id],
    );
    if (
      current.rows[0]?.password_hash !== candidate.passwordHash ||
      current.rows[0]?.disabled ||
      current.rows[0]?.role !== candidate.role
    ) {
      throw new AppError(401, "invalid_credentials", "账号或密码错误");
    }
    if(input.previousToken) {
      await tx.query('DELETE FROM sessions WHERE token_hash=$1',[digestToken(input.previousToken)]);
    }
    await insertPreparedSession(tx, candidate.id, session);
  });
  auditSecurityEvent("login", "success", { actorId: candidate.id });
  return {
    ...session,
    user: {
      id: candidate.id,
      email: candidate.email,
      phone: candidate.phone,
      displayName: candidate.displayName,
      role: candidate.role,
    },
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
  const currentResult = await target.query<{ password_hash: string; disabled: boolean }>(
    "SELECT password_hash,disabled FROM users WHERE id=$1",
    [userId],
  );
  const originalHash = currentResult.rows[0]?.password_hash;
  if (
    !originalHash ||
    currentResult.rows[0].disabled ||
    !(await verifyPassword(originalHash, input.currentPassword))
  ) {
    throw new AppError(401, "invalid_current_password", "当前密码错误");
  }
  const newHash = await hashPassword(input.newPassword);
  const session = prepareSession();
  await withWriteTransaction(target, async (tx) => {
    const locked = await tx.query<{ password_hash: string; disabled: boolean }>(
      "SELECT password_hash,disabled FROM users WHERE id=$1 FOR UPDATE",
      [userId],
    );
    if (locked.rows[0]?.password_hash !== originalHash || locked.rows[0]?.disabled) {
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
): Promise<LegacyAccountDto> {
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
  return { id: candidate.id, email, displayName: candidate.displayName };
}

export async function getSessionSnapshot(
  request: Request,
  target: QueryTarget = pool,
): Promise<SessionSnapshot> {
  const { userId } = await requireSession(request, target);
  const result = await target.query<{
    id: string;
    email: string | null;
    phone: string | null;
    display_name: string;
    role: UserRole;
    home_id: string | null;
  }>(
    `SELECT u.id,u.email,u.phone,u.display_name,u.role,hm.home_id
     FROM users u LEFT JOIN home_members hm ON hm.user_id=u.id
     WHERE u.id=$1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(401, "authentication_required", "登录已失效，请重新登录");
  return {
    user: {
      id: row.id,
      email: row.email,
      phone: row.phone,
      displayName: row.display_name,
      role: row.role,
    },
    home: row.home_id ? await getHome({ userId, homeId: row.home_id }, target) : null,
  };
}
