import path from "node:path";

import { expect, test } from "@playwright/test";

import { addSession, checkNoOverflow, pairedFixture } from "./fixtures";

test("点滴文字和真实照片可新增、重载查看、编辑与删除", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    await page.goto("/moments/new");
    await page.getByLabel("标题").fill("秋日散步");
    await page.getByLabel("记录日期").fill("2026-09-22");
    await page.getByLabel("想说的话").fill("在晚风里慢慢走回家。\n路灯刚好亮起来。");
    await page.getByRole("button", { name: "保存并继续添加照片" }).click();
    await expect(page).toHaveURL(/\/moments\/[0-9a-f-]+$/);

    await page.getByLabel("添加照片").setInputFiles([
      path.resolve("tests/fixtures/images/valid.jpg"),
      path.resolve("tests/fixtures/images/valid.png"),
      path.resolve("tests/fixtures/images/valid.webp"),
    ]);
    await expect(page.getByText("3 张照片已上传。")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".photo-card img")).toHaveCount(3);
    await expect.poll(() => page.locator(".photo-card img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await checkNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("moment-with-photos.png"), fullPage: true });

    await page.reload();
    await expect(page.getByText("在晚风里慢慢走回家。", { exact: false })).toBeVisible();
    await expect(page.locator(".photo-card img")).toHaveCount(3);
    await expect(page.locator(".photo-card img").first()).toHaveJSProperty("complete", true);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除照片：valid.jpg" }).click();
    await expect(page.getByText("照片“valid.jpg”已删除。")).toBeVisible();
    await expect(page.locator(".photo-card img")).toHaveCount(2);

    await page.getByRole("link", { name: "编辑文字" }).first().click();
    await page.getByLabel("标题").fill("秋日晚风散步");
    await page.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByRole("heading", { name: "秋日晚风散步", level: 1 })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除“秋日晚风散步”" }).click();
    await expect(page).toHaveURL(/\/moments$/);
    await expect(page.getByText("时间线还在等第一篇")).toBeVisible();
  } finally {
    await pair.cleanup();
  }
});

test("第二张照片上传失败后保留剩余队列且重试不重复", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    const created = await page.context().request.post("/api/moments", {
      headers: { Origin: process.env.E2E_ORIGIN!, "Content-Type": "application/json" },
      data: { title: "上传重试记录", date: "2026-09-23", body: "验证照片队列" },
    });
    expect(created.status(), await created.text()).toBe(201);
    const moment = await created.json();
    let uploadNumber = 0;
    await page.route(`**/api/moments/${moment.id}/photos`, (route) => {
      uploadNumber += 1;
      if (uploadNumber === 2) {
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "TEST_UPLOAD_FAILURE", message: "测试中的临时上传失败" } }) });
      }
      return route.continue();
    });

    await page.goto(`/moments/${moment.id}`);
    await page.getByLabel("添加照片").setInputFiles([
      path.resolve("tests/fixtures/images/valid.jpg"),
      path.resolve("tests/fixtures/images/valid.png"),
      path.resolve("tests/fixtures/images/valid.webp"),
    ]);
    await expect(page.getByText(/测试中的临时上传失败/)).toBeVisible();
    await expect(page.locator(".photo-card img")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "重试剩余 2 张" })).toBeVisible();
    await checkNoOverflow(page);

    await page.unroute(`**/api/moments/${moment.id}/photos`);
    await page.getByRole("button", { name: "重试剩余 2 张" }).click();
    await expect(page.getByText("2 张照片已上传。")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".photo-card img")).toHaveCount(3);
    await expect(page.getByAltText("上传重试记录：valid.jpg")).toHaveCount(1);
    await expect(page.getByAltText("上传重试记录：valid.png")).toHaveCount(1);
    await expect(page.getByAltText("上传重试记录：valid.webp")).toHaveCount(1);
  } finally {
    await pair.cleanup();
  }
});
