import argon2 from "argon2";

import { AppError } from "@/lib/errors";

export function validatePassword(password: unknown, field = "password"): asserts password is string {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw new AppError(422, "validation_failed", "请检查输入内容", {
      [field]: "密码长度必须为 12–128 个字符",
    });
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
