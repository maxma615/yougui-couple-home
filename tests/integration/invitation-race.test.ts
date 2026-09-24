import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/cli/migrate";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { initializeAdmin } from "../../src/modules/auth/service";
import {
  acceptInvitation,
  getInvitationPreview,
  issueInvitation,
} from "../../src/modules/auth/invitation";
import { createHome, getHome, updateHome } from "../../src/modules/home/service";

let database: TestDatabase;
let pool: Pool;
const password = "this-is-a-safe-password";

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

async function homeWithOwner() {
  const owner = await initializeAdmin(
    { email: "owner@example.com", displayName: "小满", password },
    pool,
  );
  const home = await createHome(
    owner.id,
    { name: "我们的小屋", startDate: "2025-01-02", displayName: "小满" },
    pool,
    new Date("2026-09-23T00:00:00+08:00"),
  );
  return { owner, home, context: { userId: owner.id, homeId: home.id } };
}

function invitee(email: string, displayName: string) {
  return { email, displayName, password: "an-invited-safe-password" };
}

describe("invitation concurrency", () => {
  it("lets exactly one request consume the same token", async () => {
    const { home, context } = await homeWithOwner();
    const { token } = await issueInvitation(context, new Date(Date.now() + 60_000), pool);

    const results = await Promise.allSettled([
      acceptInvitation(token, invitee("a@example.com", "阿青"), pool),
      acceptInvitation(token, invitee("b@example.com", "阿白"), pool),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM home_members WHERE home_id=$1", [home.id]))
        .rows[0].count,
    ).toBe(2);
    expect(
      (await pool.query("SELECT consumed_at FROM invitations WHERE home_id=$1", [home.id])).rows[0]
        .consumed_at,
    ).toBeInstanceOf(Date);
  });

  it("locks the home so two different tokens cannot fill the same final slot", async () => {
    const { home, context } = await homeWithOwner();
    const first = await issueInvitation(context, new Date(Date.now() + 60_000), pool);
    const second = await issueInvitation(context, new Date(Date.now() + 60_000), pool);

    const results = await Promise.allSettled([
      acceptInvitation(first.token, invitee("a@example.com", "阿青"), pool),
      acceptInvitation(second.token, invitee("b@example.com", "阿白"), pool),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM home_members WHERE home_id=$1", [home.id]))
        .rows[0].count,
    ).toBe(2);
  });
});

describe("invitation boundaries", () => {
  it("rejects expired and repeated invitations without leaving half-created accounts", async () => {
    const { context } = await homeWithOwner();
    const expired = await issueInvitation(context, new Date(Date.now() + 60_000), pool);
    await pool.query(
      "UPDATE invitations SET expires_at=now()-interval '1 second' WHERE home_id=$1",
      [context.homeId],
    );
    await expect(
      acceptInvitation(expired.token, invitee("expired@example.com", "过期者"), pool),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM users WHERE email=$1", ["expired@example.com"]))
        .rows[0].count,
    ).toBe(0);

    const active = await issueInvitation(context, new Date(Date.now() + 60_000), pool);
    await acceptInvitation(active.token, invitee("joined@example.com", "加入者"), pool);
    await expect(
      acceptInvitation(active.token, invitee("late@example.com", "后来者"), pool),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM users WHERE email=$1", ["late@example.com"]))
        .rows[0].count,
    ).toBe(0);
  });

  it("does not issue another invitation after the home is full", async () => {
    const { context } = await homeWithOwner();
    const invitation = await issueInvitation(context, new Date(Date.now() + 60_000), pool);
    await acceptInvitation(invitation.token, invitee("joined@example.com", "加入者"), pool);
    await expect(
      issueInvitation(context, new Date(Date.now() + 60_000), pool),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("exposes only the home and inviter names before acceptance", async () => {
    const { context } = await homeWithOwner();
    const invitation = await issueInvitation(context, new Date(Date.now() + 60_000), pool);
    await expect(getInvitationPreview(invitation.token, pool)).resolves.toEqual({
      homeName: "我们的小屋",
      inviterName: "小满",
    });
  });
});

describe("home settings", () => {
  it("rejects blank names and a future relationship date", async () => {
    const owner = await initializeAdmin(
      { email: "owner@example.com", displayName: "小满", password },
      pool,
    );
    await expect(
      createHome(
        owner.id,
        { name: " ", startDate: "2026-09-24", displayName: " " },
        pool,
        new Date("2026-09-23T00:00:00+08:00"),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("updates both member names and the home version atomically", async () => {
    const { home, context } = await homeWithOwner();
    const invitation = await issueInvitation(context, new Date(Date.now() + 60_000), pool);
    await acceptInvitation(invitation.token, invitee("joined@example.com", "加入者"), pool);
    const before = await getHome(context, pool);

    const updated = await updateHome(
      context,
      {
        name: "新名字",
        startDate: "2025-01-03",
        version: before.version,
        members: before.members.map((member, index) => ({
          id: member.id,
          displayName: index === 0 ? "甲" : "乙",
        })),
      },
      pool,
      new Date("2026-09-23T00:00:00+08:00"),
    );

    expect(updated).toMatchObject({ name: "新名字", startDate: "2025-01-03", version: 3 });
    expect(updated.members.map((member) => member.displayName)).toEqual(["甲", "乙"]);
    await expect(
      updateHome(context, { ...updated, name: "过期写入", version: 1 }, pool),
    ).rejects.toMatchObject({ status: 409, current: { version: 3 } });
  });
});
