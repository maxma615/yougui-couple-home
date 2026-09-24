import { expect, test, type Page } from "@playwright/test";

import { addSession, checkNoOverflow, pairedFixture } from "./fixtures";

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

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除“准备周末湖边野餐”" }).click();
    await expect(page).toHaveURL(/\/todos$/);
    await expect(page.getByText("现在没有共同待办")).toBeVisible();

    await stableGoto(page, "/anniversaries");
    await page.getByRole("link", { name: "一起旅行的日子" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除“一起旅行的日子”" }).click();
    await expect(page).toHaveURL(/\/anniversaries$/);
    await expect(page.getByText("从第一个重要日子开始")).toBeVisible();
  } finally {
    await pair.cleanup();
  }
});
