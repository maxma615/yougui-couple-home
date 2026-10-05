import crypto from "node:crypto";
import { isIP } from "node:net";

import { AppError } from "@/lib/errors";

type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly maximumBuckets = 4_096) {}

  consume(key: string, limit: number, windowMs: number, now: number): void {
    for (const [candidate, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(candidate);
    }
    const bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maximumBuckets) {
        throw new AppError(429, "rate_limited", "操作过于频繁，请稍后再试");
      }
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (bucket.count >= limit) {
      throw new AppError(429, "rate_limited", "操作过于频繁，请稍后再试");
    }
    bucket.count += 1;
  }
}

const globalRateLimiter = new RateLimiter();

export type RateLimitOptions = {
  limit?: number;
  windowMs?: number;
  now?: number;
  limiter?: RateLimiter;
};

export function requestSourceKey(request: Request): string {
  const serverObservedIp = (request as Request & { ip?: unknown }).ip;
  if (typeof serverObservedIp === "string" && serverObservedIp.length > 0) {
    return `ip:${serverObservedIp}`;
  }

  if (process.env.TRUST_PROXY_CLIENT_IP === "1") {
    const proxyObservedIp = request.headers.get("x-yougui-client-ip");
    if (proxyObservedIp && isIP(proxyObservedIp) !== 0) return `ip:${proxyObservedIp}`;
    throw new AppError(503, "trusted_client_ip_unavailable", "暂时无法处理请求来源");
  }

  return "source:unavailable";
}

function opaqueIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function enforceRateLimit(
  scope: "login" | "invite" | "password" | "admin",
  account: string,
  request: Request,
  options: RateLimitOptions = {},
): void {
  const limit = options.limit ?? 10;
  const windowMs = options.windowMs ?? 15 * 60_000;
  const now = options.now ?? Date.now();
  const limiter = options.limiter ?? globalRateLimiter;
  limiter.consume(`${scope}:source:${requestSourceKey(request)}`, limit * 5, windowMs, now);
  limiter.consume(
    `${scope}:account:${opaqueIdentifier(account.trim().toLowerCase())}`,
    limit,
    windowMs,
    now,
  );
}

export function auditSecurityEvent(
  event: string,
  outcome: "success" | "failure",
  details: { actorId?: string; targetId?: string; homeId?: string; reason?: string } = {},
): void {
  console.info(
    JSON.stringify({
      category: "security",
      event,
      outcome,
      actorId: details.actorId,
      targetId: details.targetId,
      homeId: details.homeId,
      reason: details.reason,
    }),
  );
}
