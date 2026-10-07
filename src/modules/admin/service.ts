import type { DatabaseError, Pool, PoolClient } from "pg";
import { z } from "zod";

import type { AdminContext } from "@/lib/auth-context";
import { pool } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { publishHomeEvent } from "@/lib/events/publisher";
import { auditSecurityEvent } from "@/lib/security";
import { hashPassword, validatePassword } from "@/modules/auth/password";
import { type QueryTarget, withWriteTransaction } from "@/modules/auth/write-transaction";

export type AdminUserDto = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  role: "member" | "admin";
  disabled: boolean;
  createdAt: string;
  homeId: string | null;
  homeName: string | null;
  slot: number | null;
};

export type AdminHomeDto = {
  id: string;
  name: string;
  startDate: string;
  memberCount: number;
};

export type AdminOverview = { users: AdminUserDto[]; homes: AdminHomeDto[] };

export type CreateManagedMemberInput = {
  phone: unknown;
  displayName: unknown;
  password: unknown;
  homeId?: unknown;
  slot?: unknown;
};

export type PatchManagedMemberInput =
  | { action: "reset-password"; newPassword?: unknown }
  | { action: "set-disabled"; disabled?: unknown }
  | { action: "bind"; homeId?: unknown; slot?: unknown };

const uuidSchema = z.string().uuid();
const phonePattern = /^1[3-9][0-9]{9}$/;

function normalizePhone(value: unknown): string {
  const phone = typeof value === "string" ? value.trim() : "";
  if (!phonePattern.test(phone)) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      phone: "请输入有效的 11 位大陆手机号",
    });
  }
  return phone;
}

function normalizeDisplayName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 60) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      displayName: "显示名称不能为空且最多 60 个字符",
    });
  }
  return name;
}

function normalizeUuid(value: unknown, field: string): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      [field]: "标识无效",
    });
  }
  return result.data;
}

function normalizeSlot(value: unknown): 1 | 2 {
  if (value !== 1 && value !== 2) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      slot: "成员位置只能是 1 或 2",
    });
  }
  return value;
}

function normalizeOptionalBinding(input: { homeId?: unknown; slot?: unknown }) {
  if (input.homeId === undefined && input.slot === undefined) return undefined;
  if (input.homeId === undefined || input.slot === undefined) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      homeId: "绑定空间时必须同时选择成员位置",
      slot: "绑定空间时必须同时选择成员位置",
    });
  }
  return {
    homeId: normalizeUuid(input.homeId, "homeId"),
    slot: normalizeSlot(input.slot),
  };
}

export async function assertAdministrator(target: QueryTarget, context: AdminContext): Promise<void> {
  const result = await target.query<{ role: string; disabled: boolean }>(
    "SELECT role,disabled FROM users WHERE id=$1",
    [context.userId],
  );
  const actor = result.rows[0];
  if (!actor || actor.disabled) {
    throw new AppError(401, "authentication_required", "登录已失效，请重新登录");
  }
  if (actor.role !== "admin") {
    throw new AppError(403, "administrator_required", "需要管理员权限");
  }
}

async function managedUserById(target: QueryTarget, userId: string): Promise<AdminUserDto> {
  const result = await target.query<{
    id: string;
    email: string | null;
    phone: string | null;
    display_name: string;
    role: "member" | "admin";
    disabled: boolean;
    created_at: Date;
    home_id: string | null;
    home_name: string | null;
    slot: number | null;
  }>(
    `SELECT u.id,u.email,u.phone,u.display_name,u.role,u.disabled,u.created_at,
            hm.home_id,h.name AS home_name,hm.slot
     FROM users u
     LEFT JOIN home_members hm ON hm.user_id=u.id
     LEFT JOIN homes h ON h.id=hm.home_id
     WHERE u.id=$1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "account_not_found", "没有找到该账号");
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    displayName: row.display_name,
    role: row.role,
    disabled: row.disabled,
    createdAt: row.created_at.toISOString(),
    homeId: row.home_id,
    homeName: row.home_name,
    slot: row.slot,
  };
}

async function lockManagedMember(tx: PoolClient, userId: string) {
  const result = await tx.query<{ id: string; role: string }>(
    "SELECT id,role FROM users WHERE id=$1 FOR UPDATE",
    [userId],
  );
  const target = result.rows[0];
  if (!target) throw new AppError(404, "account_not_found", "没有找到该账号");
  if (target.role === "admin") {
    throw new AppError(403, "admin_target_forbidden", "不能通过成员管理操作管理员账号");
  }
  return target;
}

async function bindMember(
  tx: PoolClient,
  userId: string,
  binding: { homeId: string; slot: 1 | 2 },
): Promise<boolean> {
  const home = await tx.query<{ version: number }>(
    "SELECT version FROM homes WHERE id=$1 FOR UPDATE",
    [binding.homeId],
  );
  if (!home.rows[0]) throw new AppError(404, "home_not_found", "没有找到空间");
  await lockManagedMember(tx, userId);
  const existing = await tx.query<{ home_id: string; slot: number }>(
    "SELECT home_id,slot FROM home_members WHERE user_id=$1",
    [userId],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].home_id === binding.homeId && existing.rows[0].slot === binding.slot) {
      return false;
    }
    throw new AppError(409, "member_already_bound", "该成员已经绑定其他空间或位置");
  }
  const members = await tx.query<{ user_id: string; slot: number }>(
    "SELECT user_id,slot FROM home_members WHERE home_id=$1 ORDER BY slot",
    [binding.homeId],
  );
  if (members.rows.length >= 2) {
    throw new AppError(409, "home_full", "空间已有两位成员");
  }
  if (members.rows.some((member) => member.slot === binding.slot)) {
    throw new AppError(409, "slot_occupied", "该成员位置已经被占用");
  }
  await tx.query("INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,$3)", [
    binding.homeId,
    userId,
    binding.slot,
  ]);
  const updated = await tx.query<{ version: number }>(
    "UPDATE homes SET version=version+1,updated_at=now() WHERE id=$1 RETURNING version",
    [binding.homeId],
  );
  await publishHomeEvent(tx, {
    homeId: binding.homeId,
    type: "home",
    resourceId: binding.homeId,
    action: "updated",
    version: updated.rows[0].version,
  });
  return true;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as DatabaseError).code === "23505";
}

export async function getAdminOverview(
  context: AdminContext,
  target: QueryTarget = pool,
): Promise<AdminOverview> {
  await assertAdministrator(target, context);
  const [users, homes] = await Promise.all([
    target.query<{
      id: string;
      email: string | null;
      phone: string | null;
      display_name: string;
      role: "member" | "admin";
      disabled: boolean;
      created_at: Date;
      home_id: string | null;
      home_name: string | null;
      slot: number | null;
    }>(
      `SELECT u.id,u.email,u.phone,u.display_name,u.role,u.disabled,u.created_at,
              hm.home_id,h.name AS home_name,hm.slot
       FROM users u
       LEFT JOIN home_members hm ON hm.user_id=u.id
       LEFT JOIN homes h ON h.id=hm.home_id
       ORDER BY u.created_at,u.id`,
    ),
    target.query<{ id: string; name: string; start_date: string; member_count: number }>(
      `SELECT h.id,h.name,h.start_date::text,
              count(hm.user_id)::int AS member_count
       FROM homes h LEFT JOIN home_members hm ON hm.home_id=h.id
       GROUP BY h.id ORDER BY h.created_at,h.id`,
    ),
  ]);
  return {
    users: users.rows.map((row) => ({
      id: row.id,
      email: row.email,
      phone: row.phone,
      displayName: row.display_name,
      role: row.role,
      disabled: row.disabled,
      createdAt: row.created_at.toISOString(),
      homeId: row.home_id,
      homeName: row.home_name,
      slot: row.slot,
    })),
    homes: homes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      memberCount: row.member_count,
    })),
  };
}

export async function createManagedMember(
  context: AdminContext,
  input: CreateManagedMemberInput,
  target: QueryTarget = pool,
): Promise<AdminUserDto> {
  const phone = normalizePhone(input.phone);
  const name = normalizeDisplayName(input.displayName);
  validatePassword(input.password);
  const binding = normalizeOptionalBinding(input);
  const passwordHash = await hashPassword(input.password);
  try {
    const created = await withWriteTransaction(target, async (tx) => {
      await assertAdministrator(tx, context);
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO users(email,phone,display_name,password_hash,role,disabled)
         VALUES(NULL,$1,$2,$3,'member',false) RETURNING id`,
        [phone, name, passwordHash],
      );
      if (binding) await bindMember(tx, inserted.rows[0].id, binding);
      return managedUserById(tx, inserted.rows[0].id);
    });
    auditSecurityEvent("admin_member_create", "success", {
      actorId: context.userId,
      targetId: created.id,
    });
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "phone_exists", "该手机号已经存在账号", {
        phone: "该手机号已经存在账号",
      });
    }
    throw error;
  }
}

export async function patchManagedMember(
  context: AdminContext,
  userIdInput: unknown,
  input: PatchManagedMemberInput,
  target: QueryTarget = pool,
): Promise<AdminUserDto> {
  const userId = normalizeUuid(userIdInput, "id");
  if (!input || typeof input !== "object") {
    throw new AppError(422, "validation_failed", "请检查输入内容", { action: "操作无效" });
  }

  let replacementHash: string | undefined;
  let binding: { homeId: string; slot: 1 | 2 } | undefined;
  if (input.action === "reset-password") {
    validatePassword(input.newPassword, "newPassword");
    replacementHash = await hashPassword(input.newPassword);
  } else if (input.action === "set-disabled") {
    if (typeof input.disabled !== "boolean") {
      throw new AppError(422, "validation_failed", "请检查输入内容", {
        disabled: "停用状态必须为布尔值",
      });
    }
  } else if (input.action === "bind") {
    binding = normalizeOptionalBinding(input);
    if (!binding) {
      throw new AppError(422, "validation_failed", "请检查输入内容", {
        homeId: "请选择要绑定的空间",
        slot: "请选择成员位置",
      });
    }
  } else {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      action: "不支持的成员管理操作",
    });
  }

  const updated = await withWriteTransaction(target, async (tx) => {
    await assertAdministrator(tx, context);
    if (input.action === "bind" && binding) {
      await bindMember(tx, userId, binding);
    } else {
      await lockManagedMember(tx, userId);
      if (input.action === "reset-password" && replacementHash) {
        await tx.query("UPDATE users SET password_hash=$1 WHERE id=$2", [replacementHash, userId]);
        await tx.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
      } else if (input.action === "set-disabled") {
        await tx.query("UPDATE users SET disabled=$1 WHERE id=$2", [input.disabled, userId]);
        if (input.disabled) await tx.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
      }
    }
    return managedUserById(tx, userId);
  });
  auditSecurityEvent(`admin_member_${input.action}`, "success", {
    actorId: context.userId,
    targetId: updated.id,
  });
  return updated;
}
