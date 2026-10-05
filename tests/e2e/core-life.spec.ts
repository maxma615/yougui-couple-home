import { expect, test, type Page } from "@playwright/test";

import { addSession, checkNoOverflow, mutationHeaders, pairedFixture } from "./fixtures";

async function stableGoto(page: Page, path: string) {
  try { await page.goto(path); } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("is interrupted by another navigation")) throw error;
  }
  if (new URL(page.url()).pathname !== path) await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

test("手机与桌面均可完成纪念日和待办的新增、查看、修改与删除", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    await stableGoto(page, "/anniversaries");
    await page.getByRole("link", { name: "新增纪念日" }).first().click();
    await page.getByLabel("标题").fill("第一次旅行");
    await page.getByLabel("日期", { exact: true }).fill("2024-02-29");
    await page.getByLabel("备注").fill("每次都要一起庆祝");
    await page.getByRole("button", { name: "保存纪念日" }).click();
    await expect(page).toHaveURL(/\/anniversaries\/[0-9a-f-]+$/);
    await expect(page.getByText("2 月 29 日在非闰年按 2 月 28 日显示和倒数。")).toBeVisible();
    await expect(page.getByText(/小满 创建于/)).toBeVisible();

    await page.getByRole("link", { name: "编辑" }).first().click();
    await page.getByLabel("标题").fill("一起旅行的日子");
    await page.getByRole("button", { name: "保存纪念日" }).click();
    await expect(page.getByRole("heading", { name: "一起旅行的日子", level: 1 })).toBeVisible();

    await stableGoto(page, "/home");
    await expect(page.getByText("一起旅行的日子", { exact: true })).toBeVisible();
    await checkNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("home-with-anniversary.png"), fullPage: true });

    await stableGoto(page, "/todos/new");
    await page.getByLabel("标题").fill("准备周末野餐");
    await page.getByLabel("说明").fill("带上野餐垫和水果");
    await page.getByLabel("负责人").selectOption({ label: "阿夏" });
    await page.getByLabel("截止日期（可选）").fill("2026-10-01");
    await page.getByRole("button", { name: "保存待办" }).click();
    await expect(page).toHaveURL(/\/todos\/[0-9a-f-]+$/);
    await expect(page.getByText("阿夏", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "标记完成" }).click();
    await expect(page.getByText("已经完成", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "恢复未完成" }).click();
    await expect(page.getByText("等待完成", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "编辑" }).first().click();
    await page.getByLabel("标题").fill("准备周末湖边野餐");
    await page.getByRole("button", { name: "保存待办" }).click();
    await expect(page.getByRole("heading", { name: "准备周末湖边野餐", level: 1 })).toBeVisible();

    const todoDeleteButton = page.getByRole("button", { name: "删除“准备周末湖边野餐”" });
    await todoDeleteButton.click();
    const todoDeleteDialog = page.getByRole("dialog", { name: "删除待办" });
    await expect(todoDeleteDialog).toBeVisible();
    await expect(todoDeleteDialog.getByText(/准备周末湖边野餐/)).toBeVisible();
    await todoDeleteDialog.getByRole("button", { name: "取消" }).click();
    await expect(todoDeleteDialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "准备周末湖边野餐", level: 1 })).toBeVisible();
    await todoDeleteButton.click();
    await todoDeleteDialog.getByRole("button", { name: "确认删除" }).click();
    await expect(page).toHaveURL(/\/todos$/);
    await expect(page.getByText("现在没有共同待办")).toBeVisible();

    await stableGoto(page, "/anniversaries");
    await page.getByRole("link", { name: "一起旅行的日子" }).click();
    const anniversaryDeleteButton = page.getByRole("button", { name: "删除“一起旅行的日子”" });
    await anniversaryDeleteButton.click();
    const anniversaryDeleteDialog = page.getByRole("dialog", { name: "删除纪念日" });
    await expect(anniversaryDeleteDialog).toBeVisible();
    await expect(anniversaryDeleteDialog.getByText(/一起旅行的日子/)).toBeVisible();
    await anniversaryDeleteDialog.getByRole("button", { name: "确认删除" }).click();
    await expect(page).toHaveURL(/\/anniversaries$/);
    await expect(page.getByText("从第一个重要日子开始")).toBeVisible();
  } finally {
    await pair.cleanup();
  }
});

test("两条待办同时保存时，较晚的响应保留另一条已经完成的状态", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  const releases = new Map<string, () => void>();
  try {
    const todos = [];
    for (const title of ["准备相机", "准备野餐垫"]) {
      const response = await page.context().request.post("/api/todos", {
        headers: mutationHeaders(),
        data: { title, description: "", assigneeId: null, dueDate: null, completed: false },
      });
      expect(response.status(), await response.text()).toBe(201);
      todos.push(await response.json());
    }
    await stableGoto(page, "/todos");
    await page.getByRole("button", { name: "全部", exact: true }).click();
    const first = page.locator(".life-todo-row").filter({ has: page.getByRole("link", { name: "准备相机", exact: true }) }).getByRole("button");
    const second = page.locator(".life-todo-row").filter({ has: page.getByRole("link", { name: "准备野餐垫", exact: true }) }).getByRole("button");
    await expect(first).toBeEnabled();
    await expect(second).toBeEnabled();

    // Keep the loaded list stable while real PATCH writes finish, then deliver
    // the two responses separately to exercise the local merge deterministically.
    await page.route("**/api/todos", (route) => route.fulfill({
      status: 503, contentType: "application/json",
      body: JSON.stringify({ error: { code: "TEST_DELAY", message: "列表同步暂时延迟" } }),
    }));
    await page.route("**/api/todos/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const id = new URL(route.request().url()).pathname.split("/").pop()!;
      await new Promise<void>((resolve) => releases.set(id, resolve));
      await route.fulfill({ response });
    });
    await first.click();
    await second.click();
    await expect.poll(() => releases.size).toBe(2);
    releases.get(todos[0].id)!();
    await expect(first).toBeEnabled();
    releases.get(todos[1].id)!();
    await expect(second).toBeEnabled();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(second).toHaveAttribute("aria-pressed", "true");
    const persisted = await page.context().request.get("/api/todos");
    expect((await persisted.json()).items.every((todo: { completed: boolean }) => todo.completed)).toBe(true);
  } finally {
    releases.forEach((release) => release());
    await pair.cleanup();
  }
});
