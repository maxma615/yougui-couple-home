import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { runMigrations } from "../../src/cli/migrate";
import { provisionCoupleAccounts } from "../../src/modules/admin/provision";
import { requireHomeMember, requireSession } from "../../src/lib/auth-context";
import { initializeAdmin, login } from "../../src/modules/auth/service";
import { createSession, sessionCookieHeader } from "../../src/modules/auth/session";
import { createHome } from "../../src/modules/home/service";
import { createTestDatabase, type TestDatabase } from "../helpers/database";

let db: TestDatabase;
const originalPassword = "original-member-password";
const input = {
  existingOwnerEmail: "owner@example.test",
  first: { phone: "18700001111", password: "new-member-password" },
  second: { phone: "18700002222", displayName: "第二位", password: "new-member-password" },
  admin: { email: "admin@operations.example.test", displayName: "管理员", password: "separate-admin-password" },
};
const request = (token: string) => new Request("http://localhost/api/session", {
  headers: { cookie: sessionCookieHeader(token) },
});

beforeAll(async () => { db = await createTestDatabase(); await runMigrations(db.pool); });
beforeEach(async () => { await db.pool.query("TRUNCATE users, homes CASCADE"); });
afterAll(async () => { await db?.cleanup(); });

async function existingSpace() {
  const owner = await initializeAdmin({ email: input.existingOwnerEmail, displayName: "原成员", password: originalPassword }, db.pool);
  const home = await createHome(owner.id, { name: "保留的空间", displayName: owner.displayName, startDate: "2025-01-01" }, db.pool);
  return { owner, home };
}

it("preserves the original identity and space, pairs phone members and keeps admin separate", async () => {
  const { owner, home } = await existingSpace();
  const oldSession = await createSession(owner.id, db.pool);
  const result = await provisionCoupleAccounts(input, db.pool);
  expect(result).toMatchObject({ homeId: home.id, firstUserId: owner.id });
  expect((await db.pool.query("SELECT id,name,start_date::text FROM homes")).rows).toEqual([
    { id: home.id, name: "保留的空间", start_date: "2025-01-01" },
  ]);
  expect((await db.pool.query("SELECT user_id,slot FROM home_members ORDER BY slot")).rows).toEqual([
    { user_id: owner.id, slot: 1 }, { user_id: result.secondUserId, slot: 2 },
  ]);
  await expect(requireSession(request(oldSession.token), db.pool)).rejects.toMatchObject({ status: 401 });
  const first = await login({ identifier: input.first.phone, password: input.first.password }, db.pool);
  const second = await login({ identifier: input.second.phone, password: input.second.password }, db.pool);
  expect(second.user.email).toBeNull();
  const admin = await login({ identifier: input.admin.email, password: input.admin.password }, db.pool);
  expect(first.user.id).toBe(owner.id);
  expect(admin.user.role).toBe("admin");
  expect(await requireHomeMember(request(first.token), db.pool)).toMatchObject({ homeId: home.id });
  expect(await requireHomeMember(request(second.token), db.pool)).toMatchObject({ homeId: home.id });
  await expect(requireHomeMember(request(admin.token), db.pool)).rejects.toMatchObject({ status: 403 });
  await expect(createHome(admin.user.id, { name: "管理账号的空间", displayName: "管理员", startDate: "2025-01-01" }, db.pool)).rejects.toMatchObject({ status: 403 });
});

it("is idempotent without duplicate members or unnecessary credential/session changes", async () => {
  await existingSpace();
  const first = await provisionCoupleAccounts(input, db.pool);
  const session = await login({ identifier: input.first.phone, password: input.first.password }, db.pool);
  const before = (await db.pool.query("SELECT id,password_hash FROM users ORDER BY id")).rows;
  expect(await provisionCoupleAccounts(input, db.pool)).toEqual(first);
  expect((await db.pool.query("SELECT id,password_hash FROM users ORDER BY id")).rows).toEqual(before);
  expect((await db.pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(3);
  await expect(requireSession(request(session.token), db.pool)).resolves.toMatchObject({ userId: first.firstUserId });
});

it("rolls back every change when the original space's second position is occupied", async () => {
  const { owner, home } = await existingSpace();
  const occupied = (await db.pool.query("INSERT INTO users(email,display_name,password_hash) VALUES('other@example.test','原第二位','hash') RETURNING id")).rows[0];
  await db.pool.query("INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,2)", [home.id, occupied.id]);
  await expect(provisionCoupleAccounts(input, db.pool)).rejects.toMatchObject({ status: 409 });
  expect((await db.pool.query("SELECT phone FROM users WHERE id=$1", [owner.id])).rows[0].phone).toBeNull();
  await expect(login({ email: owner.email, password: originalPassword }, db.pool)).resolves.toBeDefined();
  expect((await db.pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(2);
});

it("does not promote an existing member when administrator email conflicts", async () => {
  const { owner } = await existingSpace();
  await expect(provisionCoupleAccounts({ ...input, admin: { ...input.admin, email: owner.email } }, db.pool)).rejects.toMatchObject({ status: 409 });
  expect((await db.pool.query("SELECT phone,role FROM users WHERE id=$1", [owner.id])).rows[0]).toEqual({ phone: null, role: "member" });
  expect((await db.pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(1);
});

it("rejects duplicate phone configuration and a weak password before writing anything", async () => {
  await existingSpace();
  await expect(provisionCoupleAccounts({ ...input, second: { ...input.second, phone: input.first.phone } }, db.pool)).rejects.toMatchObject({ status: 422 });
  await expect(provisionCoupleAccounts({ ...input, admin: { ...input.admin, password: "short" } }, db.pool)).rejects.toMatchObject({ status: 422 });
  expect((await db.pool.query("SELECT phone FROM users")).rows).toEqual([{ phone: null }]);
});
