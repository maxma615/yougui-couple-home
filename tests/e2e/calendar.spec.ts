import { expect, test, type Page } from "@playwright/test";

import { addSession, checkNoOverflow, mutationHeaders, pairedFixture } from "./fixtures";

async function stableGoto(page: Page, path: string) {
  try { await page.goto(path); } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("is interrupted by another navigation")) throw error;
  }
  if (new URL(page.url()).pathname !== path) await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

test("跨月全天事项完成月视图、详情、编辑和删除", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    await page.clock.setFixedTime(new Date("2026-09-23T04:00:00Z"));
    await stableGoto(page, "/calendar");
    await expect(page.getByRole("heading", { name: "共同日历", level: 1 })).toBeVisible();
    await expect(page.locator(".calendar-day")).toHaveCount(42);
    await page.getByRole("link", { name: "新增日程" }).click();
    await page.getByLabel("标题").fill("国庆旅行");
    await page.getByLabel("全天事项").check();
    await page.getByLabel("开始日期").fill("2026-09-30");
    await page.getByLabel("结束日期（包含）").fill("2026-10-02");
    await page.getByLabel("地点").fill("杭州");
    await page.getByLabel("说明").fill("跨月住两晚");
    await page.getByRole("button", { name: "保存日程" }).click();
    await expect(page).toHaveURL(/\/calendar\/[0-9a-f-]+$/);
    await expect(page.getByText("2026-09-30 至 2026-10-02")).toBeVisible();
    await expect(page.getByText(/小满 创建于/)).toBeVisible();

    await page.getByRole("link", { name: "编辑" }).first().click();
    await page.getByLabel("标题").fill("国庆杭州旅行");
    await page.getByRole("button", { name: "保存日程" }).click();
    await expect(page.getByRole("heading", { name: "国庆杭州旅行", level: 1 })).toBeVisible();

    await stableGoto(page, "/home");
    await expect(page.getByRole("heading", { name: "近期日程" })).toBeVisible();
    await expect(page.getByRole("link", { name: /国庆杭州旅行/ })).toBeVisible();

    await stableGoto(page, "/calendar");
    await page.getByRole("button", { name: "下个月" }).click();
    await expect(page.getByRole("heading", { name: "2026年10月", level: 2 })).toBeVisible();
    await page.locator('[data-date="2026-10-01"]').click();
    await expect(page.getByRole("heading", { name: "国庆杭州旅行" })).toBeVisible();
    await checkNoOverflow(page);
    await page.screenshot({ path: `docs/screenshots/calendar-${testInfo.project.name}.png`, fullPage: true });

    await page.getByRole("link", { name: "国庆杭州旅行" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除“国庆杭州旅行”" }).click();
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.getByText("这一天还没有安排")).toBeVisible();
  } finally {
    await pair.cleanup();
  }
});

test("洛杉矶浏览器仍按北京时间编辑和显示带时刻事项", async ({ browser }) => {
  const pair = await pairedFixture(browser);
  const context = await browser.newContext({ timezoneId: "America/Los_Angeles", viewport: { width: 390, height: 844 } });
  await addSession(context, pair.a.id);
  const page = await context.newPage();
  try {
    await page.clock.setFixedTime(new Date("2026-09-23T04:00:00Z"));
    await stableGoto(page, "/calendar/new");
    await page.getByLabel("标题").fill("晚餐约会");
    await page.getByLabel("全天事项").uncheck();
    await page.getByLabel("开始时间（北京时间）").fill("2026-10-01T19:30");
    await page.getByLabel("结束时间（北京时间）").fill("2026-10-01T21:00");
    await page.getByLabel("地点").fill("江边餐厅");
    await page.getByRole("button", { name: "保存日程" }).click();
    await expect(page.getByText("2026年10月1日 19:30 至 21:00")).toBeVisible();
    await expect(page.getByText("北京时间", { exact: true })).toBeVisible();
    await checkNoOverflow(page);

    const precise = await page.evaluate(async () => {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "保留秒数", location: "", description: "", allDay: false, start: "2026-10-02T11:30:25.123Z", end: "2026-10-02T12:30:45.456Z" }),
      });
      return response.json();
    });
    await stableGoto(page, `/calendar/${precise.id}/edit`);
    await page.getByLabel("标题").fill("只修改标题");
    await page.getByRole("button", { name: "保存日程" }).click();
    const reread = await page.evaluate(async (id) => (await fetch(`/api/calendar/${id}`)).json(), precise.id);
    expect(reread.start).toBe("2026-10-02T11:30:25.123Z");
    expect(reread.end).toBe("2026-10-02T12:30:45.456Z");
  } finally {
    await context.close();
    await pair.cleanup();
  }
});

test("双会话实时看到日程且409保留手机草稿并可重试", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  const pageB = await pair.contextB.newPage();
  await pageB.setViewportSize({ width: 390, height: 844 });
  try {
    await page.clock.setFixedTime(new Date("2026-09-23T04:00:00Z"));
    await pageB.clock.setFixedTime(new Date("2026-09-23T04:00:00Z"));
    await stableGoto(page, "/calendar");
    await stableGoto(pageB, "/calendar");
    await page.getByRole("link", { name: "新增日程" }).click();
    await page.getByLabel("标题").fill("周末散步");
    await page.getByLabel("全天事项").check();
    await page.getByLabel("开始日期").fill("2026-09-26");
    await page.getByLabel("结束日期（包含）").fill("2026-09-26");
    await page.getByRole("button", { name: "保存日程" }).click();
    await expect(page).toHaveURL(/\/calendar\/[0-9a-f-]+$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;

    await pageB.locator('[data-date="2026-09-26"]').click();
    await expect(pageB.getByRole("heading", { name: "周末散步" })).toBeVisible({ timeout: 15_000 });
    await Promise.all([
      stableGoto(page, `/calendar/${id}/edit`),
      stableGoto(pageB, `/calendar/${id}/edit`),
    ]);
    await page.getByLabel("标题").fill("A先保存的散步");
    await pageB.getByLabel("标题").fill("B未保存的散步草稿");
    await page.getByRole("button", { name: "保存日程" }).click();
    await pageB.getByRole("button", { name: "保存日程" }).click();
    await expect(pageB.getByRole("heading", { name: "内容有更新冲突" })).toBeVisible();
    await expect(pageB.getByLabel("标题")).toHaveValue("B未保存的散步草稿");
    await expect(pageB.locator("dd").getByText("A先保存的散步", { exact: true })).toBeVisible();
    await checkNoOverflow(pageB);
    await pageB.getByRole("button", { name: "基于最新内容重试" }).click();
    await expect(pageB.getByRole("heading", { name: "B未保存的散步草稿", level: 1 })).toBeVisible();
  } finally {
    await pair.cleanup();
  }
});

test("日历后台刷新失败不丢失编辑草稿", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    await page.clock.setFixedTime(new Date("2026-09-23T04:00:00Z"));
    const created = await page.context().request.post("/api/calendar", {
      headers: mutationHeaders(),
      data: { title: "原日程", location: "", description: "原说明", allDay: true, start: "2026-09-25", end: "2026-09-25" },
    });
    expect(created.status(), await created.text()).toBe(201);
    const event = await created.json();
    await stableGoto(page, `/calendar/${event.id}/edit`);
    await page.getByLabel("标题").fill("断线时的日程草稿");
    await page.getByLabel("说明").fill("这段日历草稿不能丢");
    await page.route("**/api/session", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "TEST_OFFLINE", message: "暂时无法同步" } }) }));
    await page.route(`**/api/calendar/${event.id}`, (route) => route.request().method() === "GET"
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "TEST_OFFLINE", message: "暂时无法同步" } }) })
      : route.continue());
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByText(/暂时无法同步/).first()).toBeVisible();
    await expect(page.getByLabel("标题")).toHaveValue("断线时的日程草稿");
    await expect(page.getByLabel("说明")).toHaveValue("这段日历草稿不能丢");
  } finally {
    await pair.cleanup();
  }
});
