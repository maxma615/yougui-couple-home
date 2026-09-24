import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/cli/migrate";
import { assertJsonMutation, json, readJson, requestSourceKey } from "../../src/lib/http";
import { enforceRateLimit, RateLimiter } from "../../src/lib/security";
import { createHome } from "../../src/modules/home/service";
import { initializeAdmin, login } from "../../src/modules/auth/service";
import { sessionCookieHeader } from "../../src/modules/auth/session";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { requireHomeMember } from "../../src/lib/auth-context";

let database: TestDatabase;
let pool: Pool;

beforeAll(async () => {
  database = await createTestDatabase();
  pool = database.pool;
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query("TRUNCATE invitations, sessions, home_members, homes, users CASCADE");
});

afterAll(async () => {
  await database.cleanup();
});

describe("mutation request boundary", () => {
  it("marks JSON responses as private and non-cacheable", () => {
    expect(json({ ok: true }).headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a JSON body larger than the server-side limit", async () => {
    const request = new Request("http://localhost/api/home", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(262_144) }),
    });
    await expect(readJson(request)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects null and array JSON bodies before routes access fields", async () => {
    for (const body of ["null", "[]"] as const) {
      const request = new Request("http://localhost/api/home", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body,
      });
      await expect(readJson(request)).rejects.toMatchObject({ status: 400 });
    }
  });

  it("rejects cross-origin state changes", () => {
    const request = new Request("http://localhost/api/home", {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: "{}",
    });
    expect(() => assertJsonMutation(request, "http://localhost")).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("requires JSON for JSON mutation endpoints", () => {
    const request = new Request("http://localhost/api/home", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "text/plain" },
      body: "{}",
    });
    expect(() => assertJsonMutation(request, "http://localhost")).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
  });

  it("does not trust attacker-controlled forwarding headers for rate-limit source", () => {
    const first = new Request("http://localhost/api/auth/login", {
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    const second = new Request("http://localhost/api/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    expect(requestSourceKey(first)).toBe(requestSourceKey(second));
  });

  it("checks the source bucket before account allocation and recovers after expiry", () => {
    const limiter = new RateLimiter(2);
    const request = new Request("http://localhost/api/auth/login");
    enforceRateLimit("login", "first@example.com", request, {
      limit: 1,
      windowMs: 100,
      now: 1_000,
      limiter,
    });
    expect(() =>
      enforceRateLimit("login", "rotated@example.com", request, {
        limit: 1,
        windowMs: 100,
        now: 1_001,
        limiter,
      }),
    ).toThrowError(expect.objectContaining({ status: 429 }));
    expect(() =>
      enforceRateLimit("login", "rotated@example.com", request, {
        limit: 1,
        windowMs: 100,
        now: 1_101,
        limiter,
      }),
    ).not.toThrow();
  });
});

describe("home authorization", () => {
  it("derives homeId from the server session", async () => {
    const user = await initializeAdmin(
      { email: "owner@example.com", displayName: "小满", password: "this-is-a-safe-password" },
      pool,
    );
    const home = await createHome(
      user.id,
      { name: "我们的小屋", startDate: "2026-01-01", displayName: "小满" },
      pool,
      new Date("2026-09-23T00:00:00+08:00"),
    );
    const session = await login(
      { email: user.email, password: "this-is-a-safe-password" },
      pool,
    );
    const request = new Request("http://localhost/api/home?homeId=00000000-0000-0000-0000-000000000000", {
      headers: { cookie: sessionCookieHeader(session.token) },
    });

    await expect(requireHomeMember(request, pool)).resolves.toEqual({
      userId: user.id,
      homeId: home.id,
    });
  });
});
