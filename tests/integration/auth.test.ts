import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/cli/migrate";
import { requireHomeMember, requireSession } from "../../src/lib/auth-context";
import {
  changePassword,
  getSessionSnapshot,
  initializeAdmin,
  login,
  resetPassword,
} from "../../src/modules/auth/service";
import { createSession, sessionCookieHeader } from "../../src/modules/auth/session";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

const password = "this-is-a-safe-password";
let database: TestDatabase;
let pool: Pool;

function requestWithToken(token?: string): Request {
  return new Request("http://localhost/api/session", {
    headers: token ? { cookie: sessionCookieHeader(token) } : undefined,
  });
}

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

describe("account initialization", () => {
  it("allows exactly one concurrent first administrator", async () => {
    const results = await Promise.allSettled([
      initializeAdmin(
        { email: "first@example.com", displayName: "一号", password },
        pool,
      ),
      initializeAdmin(
        { email: "second@example.com", displayName: "二号", password },
        pool,
      ),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect((await pool.query("SELECT count(*)::int AS count FROM users")).rows[0].count).toBe(1);
  });
});

describe("sessions", () => {
  it("rotates the presented login cookie while preserving another device session", async () => {
    const user=await initializeAdmin({email:'rotation@example.test',displayName:'轮换测试',password},pool);
    const original=await login({email:user.email,password},pool);
    const anotherDevice=await login({email:user.email,password},pool);
    const fresh=await login({email:user.email,password,previousToken:original.token},pool);
    await expect(requireSession(requestWithToken(original.token),pool)).rejects.toMatchObject({status:401});
    await expect(requireSession(requestWithToken(fresh.token),pool)).resolves.toEqual({userId:user.id});
    await expect(requireSession(requestWithToken(anotherDevice.token),pool)).resolves.toEqual({userId:user.id});
  });

  it("rejects anonymous requests", async () => {
    await expect(requireSession(requestWithToken(), pool)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("treats malformed or oversized cookie values as invalid sessions", async () => {
    for (const value of ["%", "x".repeat(257)] as const) {
      const request = new Request("http://localhost/api/session", {
        headers: { cookie: `couple_home_session=${value}` },
      });
      await expect(requireSession(request, pool)).rejects.toMatchObject({ status: 401 });
    }
  });

  it("does not create a session for an incorrect password", async () => {
    await initializeAdmin(
      { email: "owner@example.com", displayName: "小满", password },
      pool,
    );

    await expect(
      login({ email: "owner@example.com", password: "incorrect-password" }, pool),
    ).rejects.toMatchObject({ status: 401 });
    expect((await pool.query("SELECT count(*)::int AS count FROM sessions")).rows[0].count).toBe(0);
  });

  it("rejects oversized login passwords before password verification", async () => {
    await initializeAdmin(
      { email: "owner@example.com", displayName: "小满", password },
      pool,
    );
    await expect(
      login({ email: "owner@example.com", password: "x".repeat(129) }, pool),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("allows a signed-in account without a home but rejects home-only access", async () => {
    const user = await initializeAdmin(
      { email: "owner@example.com", displayName: "小满", password },
      pool,
    );
    const session = await login({ email: user.email, password }, pool);
    const request = requestWithToken(session.token);

    await expect(requireSession(request, pool)).resolves.toEqual({ userId: user.id });
    await expect(requireHomeMember(request, pool)).rejects.toMatchObject({ status: 403 });
    await expect(getSessionSnapshot(request, pool)).resolves.toEqual({
      user: { id: user.id, email: user.email, displayName: user.displayName },
      home: null,
    });
  });

  it("strictly rejects expired sessions", async () => {
    const user = await initializeAdmin(
      { email: "owner@example.com", displayName: "小满", password },
      pool,
    );
    const session = await createSession(user.id, pool, {
      now: new Date("2026-09-23T00:00:00Z"),
      expiresAt: new Date("2026-09-23T00:00:01Z"),
    });

    await expect(
      requireSession(requestWithToken(session.token), pool, new Date("2026-09-23T00:00:01Z")),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("revokes old cookies and rotates the session after a password change", async () => {
    const user = await initializeAdmin(
      { email: "owner@example.com", displayName: "小满", password },
      pool,
    );
    const oldSession = await login({ email: user.email, password }, pool);
    const changed = await changePassword(
      user.id,
      { currentPassword: password, newPassword: "a-different-safe-password" },
      pool,
    );

    await expect(requireSession(requestWithToken(oldSession.token), pool)).rejects.toMatchObject({
      status: 401,
    });
    await expect(requireSession(requestWithToken(changed.token), pool)).resolves.toEqual({
      userId: user.id,
    });
    await expect(login({ email: user.email, password }, pool)).rejects.toMatchObject({ status: 401 });
  });

  it("administrator reset revokes every existing session", async () => {
    const user = await initializeAdmin(
      { email: "owner@example.com", displayName: "小满", password },
      pool,
    );
    const first = await login({ email: user.email, password }, pool);
    const second = await login({ email: user.email, password }, pool);

    await resetPassword(user.email, "the-reset-safe-password", pool);

    await expect(requireSession(requestWithToken(first.token), pool)).rejects.toMatchObject({ status: 401 });
    await expect(requireSession(requestWithToken(second.token), pool)).rejects.toMatchObject({ status: 401 });
    await expect(
      login({ email: user.email, password: "the-reset-safe-password" }, pool),
    ).resolves.toMatchObject({ user: { id: user.id } });
  });
});
