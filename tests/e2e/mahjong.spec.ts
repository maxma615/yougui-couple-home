import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { addSession, checkNoOverflow, mutationHeaders, origin, userFixture } from "./fixtures";
import { createHome } from "../../src/modules/home/service";
import { pool } from "../../src/lib/db";

async function coupleFixture(browser: import("@playwright/test").Browser, name: string) {
  const first = await userFixture(`${name}一`);
  const second = await userFixture(`${name}二`);
  const home = await createHome(first.id, {
    name: `${name}的空间`,
    startDate: "2020-05-20",
    displayName: first.displayName,
  });
  await pool.query("INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,2)", [home.id, second.id]);

  const firstContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await addSession(firstContext, first.id);
  await addSession(secondContext, second.id);
  return {
    users: [first, second] as const,
    contexts: [firstContext, secondContext] as const,
    async cleanup() {
      await firstContext.close();
      await secondContext.close();
    },
  };
}

async function waitForFirstDiscardTurn(pages: Page[]) {
  return Promise.any(
    pages.map(async (page, index) => {
      await page.locator('[data-choice-type="discard"]').first().waitFor({ state: "visible", timeout: 30_000 });
      return { page, index };
    }),
  );
}

test("四位来自两个情侣空间的成员联机摸切、同步并刷新恢复，移动端牌桌不横向溢出", async ({ browser }, testInfo) => {
  const firstCouple = await coupleFixture(browser, "海盐");
  const secondCouple = await coupleFixture(browser, "晚风");
  const fifth = await userFixture("第五位");
  const fifthContext = await browser.newContext();
  await addSession(fifthContext, fifth.id);
  const contexts: BrowserContext[] = [...firstCouple.contexts, ...secondCouple.contexts];
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  let hostRoomId: string | null = null;

  try {
    await Promise.all(pages.map((page) => page.goto("/mahjong")));
    await expect(pages[0].getByRole("heading", { name: /今晚，\s*来一场。/ })).toBeVisible();
    const createResponse = pages[0].waitForResponse((response) => response.url().endsWith("/api/mahjong") && response.request().method() === "POST");
    await pages[0].getByRole("button", { name: "创建东风牌桌" }).click();
    const created = await (await createResponse).json() as { room?: { id?: string } };
    hostRoomId = created.room?.id || null;
    await expect(pages[0].getByTestId("mahjong-room-code")).toHaveText(/[A-Z2-9]{8}/);
    const code = (await pages[0].getByTestId("mahjong-room-code").innerText()).trim();

    for (const page of pages.slice(1)) {
      await page.getByLabel("输入 8 位房间码").fill(code);
      await page.getByRole("button", { name: "加入牌桌" }).click();
    }

    await Promise.all([
      pages[0].getByRole("button", { name: "准备好了" }).click(),
      ...pages.slice(1).map((page) => page.getByRole("button", { name: "准备好了" }).click()),
    ]);
    await expect(pages[0].getByRole("button", { name: "开始对局" })).toBeEnabled();
    await pages[0].getByRole("button", { name: "开始对局" }).click();
    await Promise.all(pages.map(page => (page.viewportSize()?.width || 0) < (page.viewportSize()?.height || 0) ? page.setViewportSize({ width: 844, height: 390 }) : Promise.resolve()));
    await Promise.all(pages.map((page) => expect(page.getByTestId("mahjong-board")).toBeVisible()));
    await Promise.all(pages.map((page) => expect(page.locator(".mahjong-link-state.is-connected")).toHaveText("实时同步")));
    for (const name of ["海盐一", "海盐二", "晚风一", "晚风二"]) {
      await expect(pages[0].getByText(name)).toBeVisible();
    }

    const fifthJoin = await fifthContext.request.post(new URL("/api/mahjong", origin()).toString(), {
      headers: mutationHeaders(),
      data: { action: "join", code, nonce: randomUUID() },
    });
    expect(fifthJoin.status(), await fifthJoin.text()).toBe(409);

    const { page: turnPage } = await waitForFirstDiscardTurn(pages);
    const turnSeat = Number(await turnPage.getByTestId("mahjong-board").getAttribute("data-turn-seat"));
    for (const page of pages) {
      await page.route("**/api/mahjong", (route) => route.request().method() === "GET" ? route.abort("blockedbyclient") : route.continue());
    }
    await turnPage.locator('[data-choice-type="discard"]').first().click();

    await Promise.all(pages.map((page) => expect(page.getByTestId(`river-${turnSeat}`).locator("[data-tile]")).toHaveCount(1)));
    await pages[0].screenshot({ path: testInfo.outputPath("mahjong-desktop.png"), animations: "disabled", fullPage: true });
    await pages[1].screenshot({ path: testInfo.outputPath("mahjong-mobile.png"), animations: "disabled", fullPage: true });
    const mobilePage = pages[1];
    const handBeforeRefresh = await mobilePage.getByTestId("mahjong-hand").locator("[data-tile-face]").evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute("data-tile-face")));
    await Promise.all(pages.map((page) => page.unroute("**/api/mahjong")));
    await mobilePage.reload();
    await expect(mobilePage.getByTestId("mahjong-hand")).toBeVisible();
    await expect.poll(() => mobilePage.getByTestId("mahjong-hand").locator("[data-tile-face]").evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute("data-tile-face")))).toEqual(handBeforeRefresh);
    await checkNoOverflow(mobilePage);

    const state = await fifthContext.request.get(new URL("/api/mahjong", origin()).toString());
    expect(state.status(), await state.text()).toBe(200);
    expect((await state.json()).room).toBeNull();
  } finally {
    if (hostRoomId) {
      try {
        await firstCouple.contexts[0].request.post(new URL("/api/mahjong", origin()).toString(), {
          headers: mutationHeaders(),
          data: { action: "finish", roomId: hostRoomId, nonce: randomUUID() },
        });
      } catch { /* The isolated runtime may already have closed the room. */ }
    }
    await Promise.all([...contexts, fifthContext].map((context) => context.close()));
  }
});

test("房主确认解散后返回大厅，服务仍运行时不误报有牌局", async ({ browser, page }) => {
  const player = await userFixture("牌桌房主");
  await addSession(page.context(), player.id);
  let hostRoomId: string | null = null;
  try {
    await page.goto("/mahjong");
    await expect(page.getByRole("heading", { name: /今晚，\s*来一场。/ })).toBeVisible();
    const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/mahjong") && response.request().method() === "POST");
    await page.getByRole("button", { name: "创建东风牌桌" }).click();
    const created = await (await createResponse).json() as { room?: { id?: string } };
    hostRoomId = created.room?.id || null;
    await expect(page.getByTestId("mahjong-room-code")).toBeVisible();

    await page.getByRole("button", { name: "解散牌桌" }).click();
    const dialog = page.locator("dialog.mahjong-confirm");
    await expect(dialog.getByRole("heading", { name: "确定解散这张牌桌？" })).toBeVisible();
    await dialog.getByRole("button", { name: "继续打牌" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByTestId("mahjong-room-code")).toBeVisible();

    await page.getByRole("button", { name: "解散牌桌" }).click();
    const finishResponse = page.waitForResponse((response) => response.url().endsWith("/api/mahjong") && response.request().method() === "POST");
    await dialog.getByRole("button", { name: "解散牌桌" }).click();
    const finished = await (await finishResponse).json();
    expect(finished.room).toBeNull();
    expect(finished.serviceRunning).toBe(true);
    hostRoomId = null;
    await expect(page.getByRole("heading", { name: /今晚，\s*来一场。/ })).toBeVisible();
    await expect(page.locator(".mahjong-service-note")).not.toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: /今晚，\s*来一场。/ })).toBeVisible();
    const state = await page.context().request.get(new URL("/api/mahjong", origin()).toString());
    expect(state.status()).toBe(200);
    const refreshed = await state.json();
    expect(refreshed.room).toBeNull();
    expect(refreshed.serviceRunning).toBe(true);
    await expect(page.locator(".mahjong-service-note")).not.toBeVisible();
  } finally {
    if (hostRoomId) {
      try {
        await page.context().request.post(new URL("/api/mahjong", origin()).toString(), {
          headers: mutationHeaders(),
          data: { action: "finish", roomId: hostRoomId, nonce: randomUUID() },
        });
      } catch { /* The isolated runtime may already have closed the room. */ }
    }
  }
});
