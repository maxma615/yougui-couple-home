import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";

import { loadConfig } from "@/lib/config";
import { pool } from "@/lib/db";
import type { QueryTarget } from "@/modules/auth/write-transaction";
import { withWriteTransaction } from "@/modules/auth/write-transaction";

export const SESSION_COOKIE_NAME = "couple_home_session";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60_000;

export type SessionToken = { token: string; expiresAt: Date };

export function digestToken(token: string): string {
  return crypto.createHmac("sha256", loadConfig().sessionSecret).update(token).digest("hex");
}

export function newOpaqueToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function preparedSession(options: { now?: Date; expiresAt?: Date } = {}): SessionToken {
  const now = options.now ?? new Date();
  return {
    token: newOpaqueToken(),
    expiresAt: options.expiresAt ?? new Date(now.getTime() + SESSION_LIFETIME_MS),
  };
}

export async function insertPreparedSession(
  tx: PoolClient,
  userId: string,
  session: SessionToken,
): Promise<void> {
  await tx.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
    [digestToken(session.token), userId, session.expiresAt],
  );
}

export async function createSession(
  userId: string,
  target: QueryTarget = pool,
  options: { now?: Date; expiresAt?: Date } = {},
): Promise<SessionToken> {
  const session = preparedSession(options);
  await withWriteTransaction(target, async (tx) => {
    await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    await insertPreparedSession(tx, userId, session);
  });
  return session;
}

export function prepareSession(options: { now?: Date; expiresAt?: Date } = {}): SessionToken {
  return preparedSession(options);
}

export async function revokeUserSessions(
  userId: string,
  target: QueryTarget = pool,
): Promise<void> {
  await withWriteTransaction(target, async (tx) => {
    await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    await tx.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
  });
}

export async function revokeSessionToken(
  token: string | undefined,
  target: QueryTarget = pool,
): Promise<void> {
  if (!token) return;
  await withWriteTransaction(target, async (tx) => {
    await tx.query("DELETE FROM sessions WHERE token_hash=$1", [digestToken(token)]);
  });
}

export function tokenFromRequest(request: Request): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const item of cookie.split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (name === SESSION_COOKIE_NAME) {
      const encoded = rest.join("=");
      if (!encoded || encoded.length > 256) return undefined;
      try {
        const token = decodeURIComponent(encoded);
        return token.length > 0 && token.length <= 256 ? token : undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function sessionCookieHeader(token: string, expiresAt?: Date): string {
  const config = loadConfig();
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    config.production ? "Secure" : undefined,
    expiresAt ? `Expires=${expiresAt.toUTCString()}` : undefined,
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookieHeader(): string {
  const config = loadConfig();
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    config.production ? "Secure" : undefined,
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}
