import type { Pool, PoolClient } from "pg";

import type { AuthContext } from "@/lib/auth-context";
import { pool } from "@/lib/db";
import { AppError, type ErrorFields } from "@/lib/errors";
import { publishHomeEvent } from "@/lib/events/publisher";
import { parseLocalDate, shanghaiToday } from "@/lib/local-date";
import { withWriteTransaction, type QueryTarget } from "@/modules/auth/write-transaction";
import { getHome as queryHome } from "@/modules/home/queries";
import type { HomeDto } from "@/modules/home/schema";

type HomeValues = { name: unknown; startDate: unknown };

function validateName(value: unknown, field: string, label: string, maximum: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > maximum) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      [field]: `${label}不能为空且最多 ${maximum} 个字符`,
    });
  }
  return value.trim();
}

function validateHomeValues(input: HomeValues, now: Date): { name: string; startDate: string } {
  const fields: ErrorFields = {};
  let name = "";
  let startDate = "";
  try {
    name = validateName(input.name, "name", "小屋名称", 120);
  } catch (error) {
    Object.assign(fields, (error as AppError).fields);
  }
  try {
    if (typeof input.startDate !== "string") throw new Error("invalid");
    startDate = parseLocalDate(input.startDate);
    if (startDate > shanghaiToday(now)) fields.startDate = "恋爱开始日期不能晚于今天";
  } catch {
    fields.startDate = "请输入有效日期（YYYY-MM-DD）";
  }
  if (Object.keys(fields).length) {
    throw new AppError(422, "validation_failed", "请检查输入内容", fields);
  }
  return { name, startDate };
}

function validateDisplayName(value: unknown, field = "displayName"): string {
  return validateName(value, field, "显示名称", 60);
}

export async function createHome(
  ownerId: string,
  input: HomeValues & { displayName: unknown },
  target: QueryTarget = pool,
  now = new Date(),
): Promise<HomeDto> {
  const values = validateHomeValues(input, now);
  const ownerName = validateDisplayName(input.displayName);
  return withWriteTransaction(target, async (tx) => {
    const user = await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [ownerId]);
    if (!user.rowCount) throw new AppError(404, "account_not_found", "没有找到账号");
    const membership = await tx.query("SELECT home_id FROM home_members WHERE user_id=$1", [ownerId]);
    if (membership.rowCount) throw new AppError(409, "home_already_exists", "账号已经加入小屋");
    const inserted = await tx.query<{ id: string }>(
      "INSERT INTO homes(name,start_date) VALUES($1,$2) RETURNING id",
      [values.name, values.startDate],
    );
    const homeId = inserted.rows[0].id;
    await tx.query("UPDATE users SET display_name=$1 WHERE id=$2", [ownerName, ownerId]);
    await tx.query("INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,1)", [
      homeId,
      ownerId,
    ]);
    await publishHomeEvent(tx, {
      homeId,
      type: "home",
      resourceId: homeId,
      action: "created",
      version: 1,
    });
    return queryHome({ userId: ownerId, homeId }, tx);
  });
}

export const getHome = queryHome;

export type UpdateHomeInput = HomeValues & {
  version: unknown;
  members: unknown;
};

export async function updateHome(
  context: AuthContext,
  input: UpdateHomeInput,
  target: QueryTarget = pool,
  now = new Date(),
): Promise<HomeDto> {
  const values = validateHomeValues(input, now);
  if (!Number.isInteger(input.version) || (input.version as number) < 1) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      version: "版本号无效",
    });
  }
  if (!Array.isArray(input.members)) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      members: "成员列表无效",
    });
  }
  const memberNames = input.members.map((member, index) => {
    if (!member || typeof member !== "object" || typeof (member as { id?: unknown }).id !== "string") {
      throw new AppError(422, "validation_failed", "请检查输入内容", {
        members: "成员列表无效",
      });
    }
    return {
      id: (member as { id: string }).id,
      displayName: validateDisplayName(
        (member as { displayName?: unknown }).displayName,
        `members.${index}.displayName`,
      ),
    };
  });

  return withWriteTransaction(target, async (tx) => {
    const locked = await tx.query<{ version: number }>(
      `SELECT h.version FROM homes h
       JOIN home_members mine ON mine.home_id=h.id
       WHERE h.id=$1 AND mine.user_id=$2 FOR UPDATE OF h`,
      [context.homeId, context.userId],
    );
    if (!locked.rows[0]) throw new AppError(404, "home_not_found", "没有找到小屋");
    if (locked.rows[0].version !== input.version) {
      const current = await queryHome(context, tx);
      throw new AppError(409, "version_conflict", "内容已被另一位成员更新", undefined, current);
    }
    const currentMembers = await tx.query<{ user_id: string }>(
      "SELECT user_id FROM home_members WHERE home_id=$1 ORDER BY slot",
      [context.homeId],
    );
    const expectedIds = currentMembers.rows.map((member) => member.user_id).sort();
    const submittedIds = memberNames.map((member) => member.id).sort();
    if (
      expectedIds.length !== submittedIds.length ||
      new Set(submittedIds).size !== submittedIds.length ||
      expectedIds.some((id, index) => id !== submittedIds[index])
    ) {
      throw new AppError(422, "validation_failed", "请检查输入内容", {
        members: "只能修改当前小屋成员的显示名称",
      });
    }
    const updated = await tx.query<{ version: number }>(
      `UPDATE homes SET name=$1,start_date=$2,version=version+1,updated_at=now()
       WHERE id=$3 AND version=$4 RETURNING version`,
      [values.name, values.startDate, context.homeId, input.version],
    );
    if (!updated.rows[0]) {
      const current = await queryHome(context, tx);
      throw new AppError(409, "version_conflict", "内容已被另一位成员更新", undefined, current);
    }
    for (const member of memberNames) {
      await tx.query("UPDATE users SET display_name=$1 WHERE id=$2", [member.displayName, member.id]);
    }
    await publishHomeEvent(tx, {
      homeId: context.homeId,
      type: "home",
      resourceId: context.homeId,
      action: "updated",
      version: updated.rows[0].version,
    });
    return queryHome(context, tx);
  });
}
