import type { Pool } from "pg";
import argon2 from "argon2";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runMigrations } from "../../src/cli/migrate";
import {
  requireAdmin,
  requireHomeMember,
  requireSession,
} from "../../src/lib/auth-context";
import {
  createManagedMember,
  getAdminOverview,
  patchManagedMember,
} from "../../src/modules/admin/service";
import { hashPassword } from "../../src/modules/auth/password";
import { getSessionSnapshot, login } from "../../src/modules/auth/service";
import { sessionCookieHeader } from "../../src/modules/auth/session";
import { POST as createUserRoute } from "../../src/app/api/admin/users/route";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

let database: TestDatabase;
let pool: Pool;
const hashCache = new Map<string, Promise<string>>();

function testPhone(index: number): string {
  const secondDigit = 3 + (index % 7);
  return `1${secondDigit}${String(index).padStart(9, "0").slice(-9)}`;
}

function testPassword(label: string): string {
  return `test-only-${label}-passphrase`;
}

function passwordHash(label: string): Promise<string> {
  const existing = hashCache.get(label);
  if (existing) return existing;
  const created = hashPassword(testPassword(label));
  hashCache.set(label, created);
  return created;
}

async function insertUser(input: {
  index: number;
  role?: "member" | "admin";
  disabled?: boolean;
  email?: string | null;
  label?: string;
}) {
  const phone = testPhone(input.index);
  const label = input.label ?? `user-${input.index}`;
  const result = await pool.query<{
    id: string;
    phone: string;
    email: string | null;
    display_name: string;
  }>(
    `INSERT INTO users(email,phone,display_name,password_hash,role,disabled)
     VALUES($1,$2,$3,$4,$5,$6)
     RETURNING id,phone,email,display_name`,
    [
      input.email ?? null,
      phone,
      `测试成员${input.index}`,
      await passwordHash(label),
      input.role ?? "member",
      input.disabled ?? false,
    ],
  );
  return { ...result.rows[0], password: testPassword(label) };
}

async function insertHome(name = "测试空间") {
  return (
    await pool.query<{ id: string }>(
      "INSERT INTO homes(name,start_date) VALUES($1,$2) RETURNING id",
      [name, "2026-01-01"],
    )
  ).rows[0];
}

function requestWithToken(token: string): Request {
  return new Request("http://localhost/api/session", {
    headers: { cookie: sessionCookieHeader(token) },
  });
}

beforeAll(async () => {
  database = await createTestDatabase();
  pool = database.pool;
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    "TRUNCATE calendar_events,photo_cleanup_queue,photos,moments,todos,anniversaries,home_events,invitations,sessions,home_members,homes,users CASCADE",
  );
});

afterAll(async () => {
  await database.cleanup();
});

describe("administrator authorization", () => {
  it("allows active admins, rejects members, and keeps admins outside home business", async () => {
    const admin = await insertUser({ index: 1, role: "admin" });
    const member = await insertUser({ index: 2 });
    const adminSession = await login({ identifier: admin.phone, password: admin.password }, pool);
    const memberSession = await login({ identifier: member.phone, password: member.password }, pool);

    await expect(requireAdmin(requestWithToken(adminSession.token), pool)).resolves.toEqual({
      userId: admin.id,
      role: "admin",
    });
    await expect(requireHomeMember(requestWithToken(adminSession.token), pool)).rejects.toMatchObject({
      status: 403,
    });
    await expect(requireAdmin(requestWithToken(memberSession.token), pool)).rejects.toMatchObject({
      status: 403,
    });
    await expect(getAdminOverview({ userId: member.id, role: "admin" }, pool)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects cross-origin administrator writes before authentication", async () => {
    const response = await createUserRoute(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        headers: {
          origin: "https://cross-origin.invalid",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("phone and account state authentication", () => {
  it("performs one same-cost Argon2 verification for an unknown valid phone", async () => {
    const verify = vi.spyOn(argon2, "verify");
    try {
      await expect(
        login(
          { identifier: testPhone(9), password: testPassword("unknown-account") },
          pool,
        ),
      ).rejects.toMatchObject({
        status: 401,
        code: "invalid_credentials",
        fields: undefined,
        current: undefined,
      });

      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify.mock.calls[0][0]).toMatch(
        /^\$argon2id\$v=19\$m=65536,p=1,t=3\$/,
      );
    } finally {
      verify.mockRestore();
    }
  });

  it("logs in by phone while preserving legacy email login and session fields", async () => {
    const member = await insertUser({
      index: 10,
      email: "legacy-account@example.test",
    });
    const phoneLogin = await login({ identifier: member.phone, password: member.password }, pool);
    const emailLogin = await login({ email: member.email, password: member.password }, pool);

    expect(phoneLogin.user).toEqual({
      id: member.id,
      email: member.email,
      phone: member.phone,
      displayName: member.display_name,
      role: "member",
    });
    expect(emailLogin.user.id).toBe(member.id);
    await expect(getSessionSnapshot(requestWithToken(phoneLogin.token), pool)).resolves.toMatchObject({
      user: { id: member.id, phone: member.phone, role: "member" },
      home: null,
    });
  });

  it("rejects disabled login and invalidates an existing session immediately", async () => {
    const admin = await insertUser({ index: 20, role: "admin" });
    const member = await insertUser({ index: 21 });
    const session = await login({ phone: member.phone, password: member.password }, pool);

    await patchManagedMember(
      { userId: admin.id, role: "admin" },
      member.id,
      { action: "set-disabled", disabled: true },
      pool,
    );

    await expect(requireSession(requestWithToken(session.token), pool)).rejects.toMatchObject({
      status: 401,
    });
    await expect(login({ identifier: member.phone, password: member.password }, pool)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("resets a member password and revokes all old sessions", async () => {
    const admin = await insertUser({ index: 30, role: "admin" });
    const member = await insertUser({ index: 31 });
    const oldSession = await login({ identifier: member.phone, password: member.password }, pool);
    const replacement = testPassword("replacement");

    await patchManagedMember(
      { userId: admin.id, role: "admin" },
      member.id,
      { action: "reset-password", newPassword: replacement },
      pool,
    );

    await expect(requireSession(requestWithToken(oldSession.token), pool)).rejects.toMatchObject({ status: 401 });
    await expect(login({ identifier: member.phone, password: member.password }, pool)).rejects.toMatchObject({ status: 401 });
    await expect(login({ identifier: member.phone, password: replacement }, pool)).resolves.toMatchObject({
      user: { id: member.id },
    });
  });
});

describe("administrator member management", () => {
  it("creates phone-only members, rejects duplicate phones, and lists safe overview data", async () => {
    const admin = await insertUser({ index: 40, role: "admin" });
    const home = await insertHome();
    const input = {
      phone: testPhone(41),
      displayName: "新成员",
      password: testPassword("managed-member"),
      homeId: home.id,
      slot: 1,
    };

    const created = await createManagedMember({ userId: admin.id, role: "admin" }, input, pool);
    await expect(
      createManagedMember({ userId: admin.id, role: "admin" }, input, pool),
    ).rejects.toMatchObject({ status: 409 });
    const overview = await getAdminOverview({ userId: admin.id, role: "admin" }, pool);

    expect(created).toMatchObject({
      phone: input.phone,
      email: null,
      role: "member",
      disabled: false,
      homeId: home.id,
      slot: 1,
    });
    expect(overview.users.find((user) => user.id === created.id)).toEqual(created);
    expect(overview.homes).toContainEqual({
      id: home.id,
      name: "测试空间",
      startDate: "2026-01-01",
      memberCount: 1,
    });
    expect(JSON.stringify(overview)).not.toContain("password_hash");
  });

  it("binds idempotently, enforces two slots, and publishes a home change", async () => {
    const admin = await insertUser({ index: 50, role: "admin" });
    const home = await insertHome();
    const first = await createManagedMember(
      { userId: admin.id, role: "admin" },
      { phone: testPhone(51), displayName: "成员甲", password: testPassword("member-a") },
      pool,
    );
    const second = await createManagedMember(
      { userId: admin.id, role: "admin" },
      { phone: testPhone(52), displayName: "成员乙", password: testPassword("member-b") },
      pool,
    );
    const third = await createManagedMember(
      { userId: admin.id, role: "admin" },
      { phone: testPhone(53), displayName: "成员丙", password: testPassword("member-c") },
      pool,
    );

    const bound = await patchManagedMember(
      { userId: admin.id, role: "admin" },
      first.id,
      { action: "bind", homeId: home.id, slot: 1 },
      pool,
    );
    await expect(
      patchManagedMember(
        { userId: admin.id, role: "admin" },
        first.id,
        { action: "bind", homeId: home.id, slot: 1 },
        pool,
      ),
    ).resolves.toEqual(bound);
    await patchManagedMember(
      { userId: admin.id, role: "admin" },
      second.id,
      { action: "bind", homeId: home.id, slot: 2 },
      pool,
    );
    await expect(
      patchManagedMember(
        { userId: admin.id, role: "admin" },
        third.id,
        { action: "bind", homeId: home.id, slot: 1 },
        pool,
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect((await pool.query("SELECT version FROM homes WHERE id=$1", [home.id])).rows[0].version).toBe(3);
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM home_events WHERE home_id=$1", [home.id])).rows[0].count,
    ).toBe(2);
  });

  it("serializes concurrent claims for the same empty slot", async () => {
    const admin = await insertUser({ index: 60, role: "admin" });
    const home = await insertHome();
    const first = await createManagedMember(
      { userId: admin.id, role: "admin" },
      { phone: testPhone(61), displayName: "并发甲", password: testPassword("race-a") },
      pool,
    );
    const second = await createManagedMember(
      { userId: admin.id, role: "admin" },
      { phone: testPhone(62), displayName: "并发乙", password: testPassword("race-b") },
      pool,
    );

    const results = await Promise.allSettled([
      patchManagedMember(
        { userId: admin.id, role: "admin" },
        first.id,
        { action: "bind", homeId: home.id, slot: 1 },
        pool,
      ),
      patchManagedMember(
        { userId: admin.id, role: "admin" },
        second.id,
        { action: "bind", homeId: home.id, slot: 1 },
        pool,
      ),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM home_members WHERE home_id=$1", [home.id])).rows[0].count,
    ).toBe(1);
  });

  it("requires both binding fields and rolls back account creation when binding fails", async () => {
    const admin = await insertUser({ index: 65, role: "admin" });
    const home = await insertHome();
    const occupied = await insertUser({ index: 66 });
    await pool.query("INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,1)", [
      home.id,
      occupied.id,
    ]);

    await expect(
      patchManagedMember(
        { userId: admin.id, role: "admin" },
        occupied.id,
        { action: "bind" },
        pool,
      ),
    ).rejects.toMatchObject({ status: 422 });

    const attemptedPhone = testPhone(67);
    await expect(
      createManagedMember(
        { userId: admin.id, role: "admin" },
        {
          phone: attemptedPhone,
          displayName: "应回滚成员",
          password: testPassword("rollback-member"),
          homeId: home.id,
          slot: 1,
        },
        pool,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM users WHERE phone=$1", [attemptedPhone]))
        .rows[0].count,
    ).toBe(0);
  });

  it("never permits administrator targets through member management actions", async () => {
    const actor = await insertUser({ index: 70, role: "admin" });
    const target = await insertUser({ index: 71, role: "admin" });
    await expect(
      patchManagedMember(
        { userId: actor.id, role: "admin" },
        target.id,
        { action: "set-disabled", disabled: true },
        pool,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
