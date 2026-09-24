import { expect, test, type Page } from "@playwright/test";

import { addSession, checkNoOverflow, mutationHeaders, pairedFixture } from "./fixtures";

async function stableGoto(page: Page, path: string) {
  try { await page.goto(path); } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("is interrupted by another navigation")) throw error;
  }
  if (new URL(page.url()).pathname !== path) await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

test("双会话经实时事件看见变化，409 保留草稿并可基于最新版本重试", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  const pageB = await pair.contextB.newPage();
  await pageB.setViewportSize({ width: 390, height: 844 });
  try {
    await stableGoto(page, "/todos");
    await stableGoto(pageB, "/todos");
    await expect(page.getByRole("heading", { name: "共同待办", level: 1 })).toBeVisible();
    await expect(pageB.locator(".connection-status:visible").getByText("另一方的更新会自动出现")).toBeVisible();

    await stableGoto(page, "/todos/new");
    await page.getByLabel("标题").fill("同步买花");
    await page.getByLabel("说明").fill("周五下班前");
    await page.getByRole("button", { name: "保存待办" }).click();
    await expect(page).toHaveURL(/\/todos\/[0-9a-f-]+$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    await expect(pageB.getByRole("heading", { name: "同步买花" })).toBeVisible({ timeout: 15_000 });

    await Promise.all([
      stableGoto(page, `/todos/${id}/edit`),
      stableGoto(pageB, `/todos/${id}/edit`),
    ]);
    await page.getByLabel("标题").fill("A 先保存的标题");
    await pageB.getByLabel("标题").fill("B 还没保存的标题");
    await page.getByRole("button", { name: "保存待办" }).click();
    await expect(page.getByRole("heading", { name: "A 先保存的标题", level: 1 })).toBeVisible();

    await pageB.getByRole("button", { name: "保存待办" }).click();
    await expect(pageB.getByRole("heading", { name: "内容有更新冲突" })).toBeVisible();
    await expect(pageB.getByLabel("标题")).toHaveValue("B 还没保存的标题");
    await expect(pageB.locator("dd").getByText("A 先保存的标题", { exact: true })).toBeVisible();
    await expect(pageB.locator("dd").getByText("B 还没保存的标题", { exact: true })).toBeVisible();
    await checkNoOverflow(pageB);

    await pageB.getByRole("button", { name: "基于最新内容重试" }).click();
    await expect(pageB.getByRole("heading", { name: "B 还没保存的标题", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "B 还没保存的标题", level: 1 })).toBeVisible({ timeout: 15_000 });
  } finally {
    await pair.cleanup();
  }
});

test("SSE 不可用时退回轮询，恢复在线会立即补齐变化", async ({ browser }) => {
  const pair = await pairedFixture(browser);
  await pair.contextB.route("**/api/events", (route) => route.abort("failed"));
  const pageB = await pair.contextB.newPage();
  try {
    await pageB.goto("/todos");
    await expect(pageB.locator(".connection-status:visible").getByText("实时连接暂时中断，仍会定时同步")).toBeVisible();

    const polled = await pair.contextA.request.post("/api/todos", {
      headers: mutationHeaders(),
      data: { title: "轮询补齐的待办", description: "SSE 已断开", assigneeId: null, dueDate: null, completed: false },
    });
    expect(polled.status(), await polled.text()).toBe(201);
    await expect(pageB.getByRole("heading", { name: "轮询补齐的待办" })).toBeVisible({ timeout: 25_000 });

    await pair.contextB.setOffline(true);
    await expect(pageB.locator(".connection-status:visible").getByText("当前离线，恢复网络后会自动刷新")).toBeVisible();
    const whileOffline = await pair.contextA.request.post("/api/todos", {
      headers: mutationHeaders(),
      data: { title: "联网后立即出现", description: "", assigneeId: null, dueDate: null, completed: false },
    });
    expect(whileOffline.status(), await whileOffline.text()).toBe(201);
    await pair.contextB.setOffline(false);
    await expect(pageB.getByRole("heading", { name: "联网后立即出现" })).toBeVisible({ timeout: 10_000 });
  } finally {
    await pair.cleanup();
  }
});

test("后台刷新失败不会卸载编辑器或丢失未保存草稿", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    const created = await page.context().request.post("/api/todos", {
      headers: mutationHeaders(),
      data: { title: "原始标题", description: "原始说明", assigneeId: null, dueDate: null, completed: false },
    });
    expect(created.status(), await created.text()).toBe(201);
    const todo = await created.json();
    await page.goto(`/todos/${todo.id}/edit`);
    await page.getByLabel("标题").fill("断线时尚未保存的标题");
    await page.getByLabel("说明").fill("这段草稿必须保留");

    await page.route("**/api/session", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "TEST_OFFLINE", message: "暂时无法同步" } }) }));
    await page.route(`**/api/todos/${todo.id}`, (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "TEST_OFFLINE", message: "暂时无法同步" } }) });
      }
      return route.continue();
    });
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect(page.getByText(/暂时无法同步/).first()).toBeVisible();
    await expect(page.getByLabel("标题")).toHaveValue("断线时尚未保存的标题");
    await expect(page.getByLabel("说明")).toHaveValue("这段草稿必须保留");

    await page.unroute("**/api/session");
    await page.unroute(`**/api/todos/${todo.id}`);
    await page.getByRole("button", { name: "保存待办" }).click();
    await expect(page.getByRole("heading", { name: "断线时尚未保存的标题", level: 1 })).toBeVisible();
  } finally {
    await pair.cleanup();
  }
});
