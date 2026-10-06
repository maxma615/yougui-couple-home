import { randomUUID } from "node:crypto";
import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { addSession, checkNoOverflow, mutationHeaders, origin, userFixture } from "./fixtures";
import type { MahjongResponse } from "../../src/modules/mahjong/types";

async function command(context: BrowserContext, input: object) {
  return context.request.post(new URL("/api/mahjong", origin()).toString(), { timeout: 5_000, headers: mutationHeaders(), data: { ...input, nonce: randomUUID() } });
}
async function create(page: Page, variant: "sanma" | "yonma") {
  await page.goto("/mahjong");
  await expect(page.getByRole("button", { name: "四人", exact: true })).toHaveAttribute("aria-pressed", "true");
  if (variant === "sanma") await page.getByRole("button", { name: "三人", exact: true }).click();
  await page.getByRole("button", { name: "查看规则" }).click();
  const rules = page.getByRole("dialog", { name: variant === "sanma" ? "三人麻将规则" : "四人麻将规则" });
  await expect(rules).toBeVisible();
  await expect(rules).toContainText(variant === "sanma" ? "108 张" : "136 张");
  if (variant === "sanma") { await expect(rules).toContainText("禁止吃"); await expect(rules).toContainText("自摸损"); }
  await rules.getByRole("button", { name: "关闭规则" }).click();
  const response = page.waitForResponse(r => r.url().endsWith("/api/mahjong") && r.request().method() === "POST");
  await page.getByRole("button", { name: variant === "sanma" ? "创建三人东风牌桌" : "创建东风牌桌" }).click();
  return ((await (await response).json()) as MahjongResponse).room!;
}
async function actHumans(pages: Page[]) {
  for (const page of pages) {
    const action = page.locator('[data-choice-type="pass"]:enabled, [data-choice-type="discard"]:enabled, [data-choice-type="ack"]:enabled').first();
    if (await action.count()) await action.click();
  }
}
async function dissolve(page: Page) {
  await page.getByRole("button", { name: "结束并解散牌桌" }).click();
  const dialog = page.getByRole("dialog", { name: "确定解散这张牌桌？" });
  await dialog.getByRole("button", { name: "继续打牌" }).click();
  await expect(page.getByTestId("mahjong-board")).toBeVisible();
  await page.getByRole("button", { name: "结束并解散牌桌" }).click();
  await dialog.getByRole("button", { name: "解散牌桌" }).click();
  await expect(page.getByRole("heading", { name: /今晚，\s*来一场。/ })).toBeVisible();
  await expect(page.locator(".mahjong-service-note")).toHaveCount(0);
}

test("两位真人与一位电脑三麻：房主补位权限、真三席与实时电脑出牌", async ({ browser }, testInfo) => {
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1365, height: 900 } }), browser.newContext({ viewport: { width: 390, height: 844 } })]);
  const users = await Promise.all([userFixture("三麻房主"), userFixture("三麻牌友")]);
  await Promise.all(contexts.map((context, i) => addSession(context, users[i].id)));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  let roomId: string | undefined;
  try {
    const room = await create(pages[0], "sanma"); roomId = room.id;
    await expect(pages[0].locator('[data-testid^="mahjong-seat-"]')).toHaveCount(3);
    await pages[1].goto("/mahjong");
    await pages[1].getByLabel("输入 8 位房间码").fill(room.code);
    await pages[1].getByRole("button", { name: "加入牌桌" }).click();
    await expect(pages[1].getByTestId("mahjong-room-code")).toHaveText(room.code);
    await Promise.all(pages.map(page => expect(page.locator(".mahjong-link-state.is-connected")).toHaveText("实时同步")));
    await expect(pages[1].getByRole("button", { name: "添加电脑" })).toHaveCount(0);
    expect((await command(contexts[1], { action: "fill-bots", roomId })).status()).toBe(403);
    // Block polling: the second page must receive lobby changes and moves over its actual socket.
    await Promise.all(pages.map(page => page.route("**/api/mahjong", route => route.request().method() === "GET" ? route.abort("blockedbyclient") : route.continue())));
    await pages[0].getByRole("button", { name: "添加电脑" }).click();
    await expect(pages[1].getByTestId("mahjong-seat-2")).toContainText("自动准备");
    await expect(pages[1].getByRole("button", { name: "移除电脑" })).toHaveCount(0);
    await pages[0].getByRole("button", { name: "移除电脑" }).click();
    await expect(pages[1].getByTestId("mahjong-seat-2")).toContainText("等一位牌友");
    await pages[0].getByRole("button", { name: "电脑补齐空位" }).click();
    await expect(pages[1].getByTestId("mahjong-seat-2")).toContainText("自动准备");
    expect((await command(contexts[0], { action: "add-bot", roomId, seat: 3 })).status()).toBe(400);
    await Promise.all(pages.map(page => page.getByRole("button", { name: "准备好了" }).click()));
    await pages[0].getByRole("button", { name: "开始对局" }).click();
    await pages[1].setViewportSize({ width: 844, height: 390 });
    await Promise.all(pages.map(page => expect(page.locator('.mahjong-player')).toHaveCount(3)));
    await expect.poll(async () => { await actHumans(pages); return pages[1].getByTestId("river-2").locator("[data-tile]").count(); }, { timeout: 30_000 }).toBeGreaterThan(0);
    await Promise.all(pages.map(page => expect(page.locator('.mahjong-link-state.is-connected')).toHaveText("实时同步")));
    for (const page of pages) { await expect(page.locator('.mahjong-player__head > b')).toHaveCount(3); await checkNoOverflow(page); }
    await pages[0].screenshot({ path: testInfo.outputPath("sanma-desktop.png"), fullPage: true, animations: "disabled" });
    await pages[1].screenshot({ path: testInfo.outputPath("sanma-mobile.png"), fullPage: true, animations: "disabled" });
    await Promise.all(pages.map(page => page.unroute("**/api/mahjong")));
    await dissolve(pages[0]); roomId = undefined;
    await expect(pages[1].getByRole("heading", { name: /今晚，\s*来一场。/ })).toBeVisible();
  } finally { if (roomId) { try { await command(contexts[0], { action: "finish", roomId }); } catch { /* Preserve the actual assertion failure if cleanup cannot connect. */ } } await Promise.all(contexts.map(context => context.close())); }
});

for (const variant of ["sanma", "yonma"] as const) test(`单人${variant === "sanma" ? "三麻加两位" : "四麻加三位"}电脑，自动行动与刷新恢复`, async ({ page }, testInfo) => {
  const user = await userFixture("独自练习"); await addSession(page.context(), user.id);
  let roomId: string | undefined;
  try {
    const room = await create(page, variant); roomId = room.id;
    const count = variant === "sanma" ? 3 : 4;
    await page.getByRole("button", { name: "电脑补齐空位" }).click();
    await expect(page.locator('.mahjong-seat-card__ready')).toHaveCount(count);
    await expect(page.getByText("自动准备", { exact: false })).toHaveCount(count - 1);
    await page.getByRole("button", { name: "准备好了" }).click();
    await page.getByRole("button", { name: "开始对局" }).click();
    if ((page.viewportSize()?.width || 0) < (page.viewportSize()?.height || 0)) await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('.mahjong-player')).toHaveCount(count);
    await page.route("**/api/mahjong", route => route.request().method() === "GET" ? route.abort("blockedbyclient") : route.continue());
    await expect.poll(async () => { await actHumans([page]); return page.locator('.mahjong-river:not(.mahjong-river--0) [data-tile]').count(); }, { timeout: 30_000 }).toBeGreaterThan(0);
    // A legal human decision holds this hand stable, including a pending call/pass response.
    await expect(page.locator("[data-choice-type]:enabled").first()).toBeVisible({ timeout: 30_000 });
    const hand = await page.getByTestId("mahjong-hand").locator('[data-tile-face]').evaluateAll(tiles => tiles.map(tile => tile.getAttribute("data-tile-face")));
    await page.unroute("**/api/mahjong"); await page.reload();
    await expect.poll(() => page.getByTestId("mahjong-hand").locator('[data-tile-face]').evaluateAll(tiles => tiles.map(tile => tile.getAttribute("data-tile-face")))).toEqual(hand);
    await expect(page.locator('.mahjong-player')).toHaveCount(count);
    await checkNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`${variant}-solo.png`), fullPage: true, animations: "disabled" });
    await dissolve(page); roomId = undefined;
    await page.reload();
    await expect(page.locator(".mahjong-service-note")).toHaveCount(0);
  } finally { if (roomId) await command(page.context(), { action: "finish", roomId }); }
});

for (const variant of ["sanma", "yonma"] as const) test(`手机${variant}竖屏入口、横屏实桌与真实指示牌`, async ({page}, testInfo) => {
  const user = await userFixture("横屏牌友"); await addSession(page.context(), user.id);
  await page.setViewportSize({width: 390, height: 844});
  let roomId: string | undefined;
  try {
    const room = await create(page, variant); roomId = room.id;
    await page.getByRole("button", {name: "电脑补齐空位"}).click();
    await page.getByRole("button", {name: "准备好了"}).click();
    await page.getByRole("button", {name: "开始对局"}).click();
    await expect(page.getByLabel("请横屏打牌")).toBeVisible();
    await page.screenshot({path: testInfo.outputPath(`${variant}-portrait-gate.png`)});
    await page.setViewportSize({width: 844, height: 390});
    await expect(page.getByLabel("请横屏打牌")).toBeHidden();
    const board = page.getByTestId("mahjong-board"), dora = page.getByTestId("mahjong-dora");
    await expect(board).toBeVisible();
    const state = await (await page.request.get(new URL("/api/mahjong", origin()).toString())).json() as MahjongResponse;
    await expect(dora.locator("[data-tile-face]")).toHaveCount(state.room!.game!.doraIndicators.length);
    expect(await dora.locator("[data-tile-face]").evaluateAll(els => els.map(el => el.getAttribute("data-tile-face")))).toEqual(state.room!.game!.doraIndicators);
    expect(await dora.locator(".mahjong-indicator-back").count() + state.room!.game!.doraIndicators.length).toBe(5);
    const bounds = await board.boundingBox(), doraBounds = await dora.boundingBox();
    expect(doraBounds!.x).toBeLessThan(bounds!.x + bounds!.width / 3);
    expect(doraBounds!.y).toBeLessThan(bounds!.y + bounds!.height / 3);
    const hand = page.getByTestId("mahjong-hand");
    await expect(hand.locator(".mahjong-tile__art").first()).toBeVisible();
    for (const tile of await hand.locator("button").all()) {
      const rect = await tile.boundingBox();
      expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(844);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(390);
    }
    await checkNoOverflow(page);
    await expect.poll(async () => { await actHumans([page]); return page.locator('.mahjong-river:not(.mahjong-river--0) [data-tile]').count(); }, {timeout: 30_000}).toBeGreaterThan(0);
    await expect(page.locator("[data-choice-type]:enabled").first()).toBeVisible();
    await page.screenshot({path: testInfo.outputPath(`${variant}-landscape-table.png`), animations:"disabled"});
    await page.setViewportSize({width: 1365, height: 900});
    await page.screenshot({path: testInfo.outputPath(`${variant}-real-table-desktop.png`), animations:"disabled", fullPage:true});
    await dissolve(page); roomId = undefined;
  } finally {if (roomId) await command(page.context(), {action:"finish", roomId});}
});

// A display-only API fixture checks native dialog interaction; real tables are covered above.
test("横屏点击公开副露放大、ESC关闭，不发送出牌请求", async ({page}) => {
  const user = await userFixture("副露查看"); await addSession(page.context(), user.id);
  const room: NonNullable<MahjongResponse['room']> = {
    id:"public-display-fixture", code:"ABCDEFGH", hostUserId:user.id, mode:"east", variant:"sanma", status:"playing", version:1, mySeat:0,
    members:[0,1,2].map(seat => ({userId:seat ? `fixture-${seat}` : user.id,displayName:`牌友${seat}`,seat,kind:"human",connected:true,ready:true})),
    game:{decisionId:"display",phase:"dapai",roundWind:0,roundNumber:1,honba:0,riichiSticks:0,remainingTiles:30,doraIndicators:["p2"],turnSeat:2,
      hand:["p1","p2","p3","p4","p5","p6","p7","p8","p9","s1","s2","s3","z4"],drawnTile:null,choices:[],settlement:null,ranking:null,
      players:[0,1,2].map(seat => ({seat,wind:seat,score:35000,handCount:seat === 1 ? 6 : 13,discards:[],melds:seat === 1 ? ["p111+","s4444"] : [],riichi:false,nuki:0}))},
  };
  const posts:string[]=[];
  page.on('request', r => {if (r.url().endsWith('/api/mahjong') && r.method()==='POST') posts.push(r.url());});
  await page.route('**/api/mahjong', route => route.request().method()==='GET'
    ? route.fulfill({json:{room,serviceRunning:false} satisfies MahjongResponse}) : route.abort());
  await page.setViewportSize({width:844,height:390}); await page.goto('/mahjong');
  await page.getByRole('button',{name:'查看牌友1的公开副露'}).click();
  const dialog=page.getByRole('dialog',{name:'牌友1的公开副露'});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-tile-face="p1"]')).toHaveCount(3);
  await expect(dialog.locator('[data-tile-face="s4"]')).toHaveCount(0);
  await expect(dialog.locator('.mahjong-meld__back')).toHaveCount(4);
  const rect=await dialog.locator('[data-tile-face]').first().boundingBox();
  expect(rect!.width).toBeGreaterThanOrEqual(39);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  expect(posts).toEqual([]);
});
