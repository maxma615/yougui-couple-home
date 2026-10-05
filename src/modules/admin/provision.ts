import { z } from "zod";
import { pool } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { publishHomeEvent } from "@/lib/events/publisher";
import { auditSecurityEvent } from "@/lib/security";
import { hashPassword, validatePassword, verifyPassword } from "@/modules/auth/password";
import { withWriteTransaction, type QueryTarget } from "@/modules/auth/write-transaction";

const phone = z.string().trim().regex(/^1[3-9]\d{9}$/);
const email = z.string().trim().toLowerCase().email().max(320);
const name = z.string().trim().min(1).max(60);
const schema = z.object({
  existingOwnerEmail: email,
  first: z.object({ phone, password: z.string() }),
  second: z.object({ phone, displayName: name, password: z.string() }),
  admin: z.object({ email, displayName: name, password: z.string() }),
});

type ExistingUser = { id: string; phone: string | null; role: string; disabled: boolean; password_hash: string };
export type ProvisionResult = { homeId: string; firstUserId: string; secondUserId: string; adminUserId: string };

/** Offline operational initialization; no public route. Atomic and retry-safe. */
export async function provisionCoupleAccounts(input: unknown, target: QueryTarget = pool): Promise<ProvisionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError(422, "invalid_provision_input", "账号配置格式无效");
  const config = parsed.data;
  if (config.first.phone === config.second.phone) throw new AppError(422, "duplicate_phone", "两位成员需要不同手机号");
  for (const account of [config.first, config.second, config.admin]) validatePassword(account.password);
  const hashes = await Promise.all([config.first, config.second, config.admin].map(account => hashPassword(account.password)));

  const result = await withWriteTransaction(target, async tx => {
    await tx.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
    const owner = (await tx.query<ExistingUser>("SELECT id,phone,role,disabled,password_hash FROM users WHERE email=$1 FOR UPDATE", [config.existingOwnerEmail])).rows[0];
    if (!owner || owner.role !== "member" || owner.disabled) throw new AppError(409, "owner_not_available", "原成员账号不存在或不可用");
    if (owner.phone && owner.phone !== config.first.phone) throw new AppError(409, "owner_phone_conflict", "原成员已绑定不同手机号");
    const membership = (await tx.query<{ home_id: string; slot: number }>("SELECT home_id,slot FROM home_members WHERE user_id=$1", [owner.id])).rows[0];
    if (!membership || membership.slot !== 1) throw new AppError(409, "owner_home_conflict", "原成员不在空间第一位置");
    const home = (await tx.query<{ version: number }>("SELECT version FROM homes WHERE id=$1 FOR UPDATE", [membership.home_id])).rows[0];
    if (!home) throw new AppError(409, "home_not_available", "原空间不存在");
    const conflict = await tx.query("SELECT id FROM users WHERE phone=$1 AND id<>$2", [config.first.phone, owner.id]);
    if (conflict.rowCount) throw new AppError(409, "phone_conflict", "首位手机号已属于其他账号");

    let second = (await tx.query<ExistingUser>("SELECT id,phone,role,disabled,password_hash FROM users WHERE phone=$1 FOR UPDATE", [config.second.phone])).rows[0];
    if (second && (second.role !== "member" || second.disabled)) throw new AppError(409, "second_not_available", "第二位账号不可用");
    const occupied = (await tx.query<{ user_id: string }>("SELECT user_id FROM home_members WHERE home_id=$1 AND slot=2", [membership.home_id])).rows[0];
    if (occupied && occupied.user_id !== second?.id) throw new AppError(409, "slot_occupied", "空间第二位置已有成员");
    if (second) {
      const existing = (await tx.query<{ home_id: string; slot: number }>("SELECT home_id,slot FROM home_members WHERE user_id=$1", [second.id])).rows[0];
      if (existing && (existing.home_id !== membership.home_id || existing.slot !== 2)) throw new AppError(409, "second_home_conflict", "第二位账号已绑定其他空间或位置");
    }
    let admin = (await tx.query<ExistingUser>("SELECT id,phone,role,disabled,password_hash FROM users WHERE email=$1 FOR UPDATE", [config.admin.email])).rows[0];
    if (admin && (admin.role !== "admin" || admin.disabled || !(await verifyPassword(admin.password_hash, config.admin.password)))) {
      throw new AppError(409, "admin_account_conflict", "管理员账号已存在且不匹配，不能提升或覆盖已有账号");
    }
    if (admin && (await tx.query("SELECT 1 FROM home_members WHERE user_id=$1", [admin.id])).rowCount) throw new AppError(409, "admin_membership_conflict", "管理员账号已有成员身份");

    if (!second) {
      second = (await tx.query<ExistingUser>(
        `INSERT INTO users(email,phone,display_name,password_hash,role)
         VALUES(NULL,$1,$2,$3,'member') RETURNING id,phone,role,disabled,password_hash`,
        [config.second.phone, config.second.displayName, hashes[1]],
      )).rows[0];
    } else if (!(await verifyPassword(second.password_hash, config.second.password))) {
      await tx.query("UPDATE users SET password_hash=$1 WHERE id=$2", [hashes[1], second.id]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [second.id]);
    }
    const ownerPasswordChanged = !(await verifyPassword(owner.password_hash, config.first.password));
    if (owner.phone !== config.first.phone || ownerPasswordChanged) {
      await tx.query("UPDATE users SET phone=$1,password_hash=$2 WHERE id=$3", [config.first.phone, ownerPasswordChanged ? hashes[0] : owner.password_hash, owner.id]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [owner.id]);
    }
    if (!admin) {
      admin = (await tx.query<ExistingUser>(
        `INSERT INTO users(email,display_name,password_hash,role)
         VALUES($1,$2,$3,'admin') RETURNING id,phone,role,disabled,password_hash`,
        [config.admin.email, config.admin.displayName, hashes[2]],
      )).rows[0];
    }
    if (!occupied) {
      await tx.query("INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,2)", [membership.home_id, second.id]);
      const updated = (await tx.query<{ version: number }>("UPDATE homes SET version=version+1,updated_at=now() WHERE id=$1 RETURNING version", [membership.home_id])).rows[0];
      await tx.query("UPDATE invitations SET expires_at=now() WHERE home_id=$1 AND consumed_at IS NULL", [membership.home_id]);
      await publishHomeEvent(tx, { homeId: membership.home_id, resourceId: membership.home_id, type: "home", action: "updated", version: updated.version });
    }
    return { homeId: membership.home_id, firstUserId: owner.id, secondUserId: second.id, adminUserId: admin.id };
  });
  auditSecurityEvent("provision_accounts", "success", { actorId: result.adminUserId });
  return result;
}
