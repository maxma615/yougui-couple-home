import { afterEach, describe, expect, it, vi } from "vitest";

import { enforceRateLimit, RateLimiter, requestSourceKey } from "../../src/lib/security";

type RequestWithIp = Request & { ip?: unknown };

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/auth/login", { headers });
}

function requestFromIp(ip: string, headers: Record<string, string> = {}): RequestWithIp {
  const result = request(headers) as RequestWithIp;
  Object.defineProperty(result, "ip", { value: ip });
  return result;
}

afterEach(() => vi.unstubAllEnvs());

describe("trusted client IP rate-limit source", () => {
  it("uses the dedicated proxy header only when proxy trust is enabled", () => {
    vi.stubEnv("TRUST_PROXY_CLIENT_IP", "1");

    expect(requestSourceKey(request({ "x-yougui-client-ip": "198.51.100.10" }))).toBe(
      "ip:198.51.100.10",
    );
    expect(requestSourceKey(request({ "x-yougui-client-ip": "2001:db8::10" }))).toBe(
      "ip:2001:db8::10",
    );
  });

  it("keeps source limits independent by IP and shared across account names per IP", () => {
    vi.stubEnv("TRUST_PROXY_CLIENT_IP", "1");
    const limiter = new RateLimiter();
    const options = { limit: 1, windowMs: 1_000, now: 10_000, limiter };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      enforceRateLimit(
        "login",
        `account-${attempt}`,
        request({ "x-yougui-client-ip": "198.51.100.20" }),
        options,
      );
    }
    expect(() =>
      enforceRateLimit(
        "login",
        "rotated-account",
        request({ "x-yougui-client-ip": "198.51.100.20" }),
        options,
      ),
    ).toThrowError(expect.objectContaining({ status: 429 }));

    expect(() =>
      enforceRateLimit(
        "login",
        "another-user",
        request({ "x-yougui-client-ip": "203.0.113.20" }),
        options,
      ),
    ).not.toThrow();
  });

  it("fails closed on missing or invalid proxy IP without consuming a shared fallback bucket", () => {
    vi.stubEnv("TRUST_PROXY_CLIENT_IP", "1");
    const limiter = new RateLimiter();
    const options = { limit: 1, windowMs: 1_000, now: 10_000, limiter };
    const invalidValue = "attacker.example";
    const badRequests = [request(), request({ "x-yougui-client-ip": invalidValue })];

    for (const [requestIndex, badRequest] of badRequests.entries()) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        let failure: unknown;
        try {
          enforceRateLimit(
            "login",
            `bad-account-${requestIndex}-${attempt}`,
            badRequest,
            options,
          );
        } catch (error) {
          failure = error;
        }
        expect(failure).toMatchObject({ status: 503 });
        expect(failure instanceof Error ? failure.message : String(failure)).not.toContain(invalidValue);
      }
    }

    expect(() =>
      enforceRateLimit(
        "login",
        "valid-account",
        request({ "x-yougui-client-ip": "198.51.100.30" }),
        options,
      ),
    ).not.toThrow();
  });

  it("prefers an existing trusted request.ip value", () => {
    vi.stubEnv("TRUST_PROXY_CLIENT_IP", "1");

    expect(
      requestSourceKey(
        requestFromIp("192.0.2.44", { "x-yougui-client-ip": "203.0.113.44" }),
      ),
    ).toBe("ip:192.0.2.44");
  });

  it("ignores forwarding headers when proxy trust is disabled", () => {
    vi.stubEnv("TRUST_PROXY_CLIENT_IP", "0");
    const first = request({
      "x-forwarded-for": "198.51.100.41",
      "x-yougui-client-ip": "198.51.100.41",
    });
    const second = request({
      "x-forwarded-for": "203.0.113.41",
      "x-yougui-client-ip": "203.0.113.41",
    });

    expect(requestSourceKey(first)).toBe("source:unavailable");
    expect(requestSourceKey(first)).toBe(requestSourceKey(second));
  });
});
