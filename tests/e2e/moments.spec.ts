import path from "node:path";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { addSession, checkNoOverflow, pairedFixture } from "./fixtures";

async function openManagement(page: import("@playwright/test").Page, action: string) {
  await page.getByRole("button", { name: "管理回忆", exact: true }).click();
  await page.getByRole("dialog", { name: "管理回忆", exact: true }).getByRole("button", { name: action, exact: true }).click();
}
async function closeManagement(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) { await dialog.getByRole("button", { name: "关闭弹窗", exact: true }).click(); await expect(dialog).toBeHidden(); }
}

const mutation = () => ({ Origin: process.env.E2E_ORIGIN!, "Content-Type": "application/json" });

async function createMoment(context: import("@playwright/test").BrowserContext, data: { title: string; date: string; body?: string }) {
  const created = await context.request.post("/api/moments", { headers: mutation(), data: { body: "", ...data } });
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json()) as { id: string; version: number };
}

async function attachPhoto(context: import("@playwright/test").BrowserContext, momentId: string, version: number, filename: string) {
  const uploaded = await context.request.post(`/api/moments/${momentId}/photos`, {
    headers: { Origin: process.env.E2E_ORIGIN! },
    multipart: {
      file: { name: filename, mimeType: "image/jpeg", buffer: readFileSync(path.resolve("tests/fixtures/images/valid.jpg")) },
      version: String(version),
    },
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  return (await uploaded.json()) as { photo: { id: string }; version: number };
}

test("点滴文字和真实照片可新增、重载查看、编辑与删除", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    await page.goto("/home");
    await page.getByRole("link", { name: "添加照片", exact: true }).click();
    await expect(page).toHaveURL(/\/moments\/new$/);
    await page.getByLabel("标题").fill("秋日散步");
    await page.getByLabel("记录日期").fill("2026-09-22");
    await page.getByLabel("想说的话").fill("在晚风里慢慢走回家。\n路灯刚好亮起来。");
    await page.getByRole("button", { name: "保存并继续添加照片" }).click();
    await expect(page).toHaveURL(/\/moments\/[0-9a-f-]+$/);

    await openManagement(page, "添加照片");
    await page.getByLabel("选择照片").setInputFiles([
      path.resolve("tests/fixtures/images/valid.jpg"),
      path.resolve("tests/fixtures/images/valid.png"),
      path.resolve("tests/fixtures/images/valid.webp"),
    ]);
    await expect(page.getByText("3 张照片已上传。", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".space-memory__thumb img")).toHaveCount(3);
    await closeManagement(page);
    await page.locator(".space-memory__sequence").scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator(".space-memory__thumb img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await checkNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("moment-with-photos.png"), fullPage: true, animations: "disabled" });

    await page.reload();
    await expect(page.getByText("在晚风里慢慢走回家。", { exact: false })).toBeVisible();
    await expect(page.locator(".space-memory__thumb img")).toHaveCount(3);
    await expect(page.locator(".space-memory__thumb img").first()).toHaveJSProperty("complete", true);

    await page.getByRole("link", { name: "返回", exact: true }).click();
    await expect(page.getByRole("heading", { name: "相册与点滴" })).toBeVisible();
    await expect(page.locator(".space-gallery__tile-image")).toHaveCount(3);
    await page.getByRole("button", { name: "查看照片：秋日散步，第 1 张照片", exact: true }).click();
    await page.getByRole("link", { name: "查看这段回忆", exact: true }).click();
    await openManagement(page, "管理照片");

    await page.getByRole("button", { name: "删除第 1 张照片", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "删除照片" })).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.locator(".space-memory__thumb img")).toHaveCount(3);
    await page.getByRole("button", { name: "删除第 1 张照片", exact: true }).click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await expect(page.getByText("照片已删除。", { exact: true })).toBeVisible();
    await expect(page.locator(".space-memory__thumb img")).toHaveCount(2);

    await closeManagement(page);
    await openManagement(page, "编辑回忆");
    await page.getByLabel("标题").fill("秋日晚风散步");
    await page.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByRole("heading", { name: "秋日晚风散步", level: 1 })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
    await openManagement(page, "删除这段回忆");
    await expect(page.getByRole("dialog", { name: "删除回忆", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByRole("heading", { name: "秋日晚风散步", level: 1 })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
    await openManagement(page, "删除这段回忆");
    await page.getByRole("button", { name: "确认删除" }).click();
    await expect(page).toHaveURL(/\/moments$/);
    await expect(page.getByText("这里还没有你们的照片。")).toBeVisible();
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
    await openManagement(page, "添加照片");
    await page.getByLabel("选择照片").setInputFiles([
      path.resolve("tests/fixtures/images/valid.jpg"),
      path.resolve("tests/fixtures/images/valid.png"),
      path.resolve("tests/fixtures/images/valid.webp"),
    ]);
    await expect(page.getByText(/测试中的临时上传失败/)).toBeVisible();
    await expect(page.locator(".space-memory__lead-photo")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "重试剩余 2 张" })).toBeVisible();
    await checkNoOverflow(page);

    await page.unroute(`**/api/moments/${moment.id}/photos`);
    await page.getByRole("button", { name: "重试剩余 2 张" }).click();
    await expect(page.getByText("2 张照片已上传。", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".space-memory__thumb img")).toHaveCount(3);
    await closeManagement(page);
    await expect(page.getByRole("button", { name: "放大查看：上传重试记录，第 1 张照片" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "查看照片：上传重试记录，第 2 张照片" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "查看照片：上传重试记录，第 3 张照片" })).toHaveCount(1);
  } finally {
    await pair.cleanup();
  }
});

test("封面可切换，照片墙按日期展示每张照片和文字记录", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    const withPhotos = await createMoment(page.context(), { title: "午后的植物园", date: "2026-09-20" });
    const first = await attachPhoto(page.context(), withPhotos.id, withPhotos.version, "plant-a.jpg");
    await attachPhoto(page.context(), withPhotos.id, first.version, "plant-b.jpg");
    await createMoment(page.context(), { title: "只有文字的傍晚", date: "2026-09-20", body: "我们聊了很久，没有拍照。" });
    const nextDay = await createMoment(page.context(), { title: "一夜好眠", date: "2026-09-21" });
    await attachPhoto(page.context(), nextDay.id, nextDay.version, "morning.jpg");

    await page.goto("/moments");
    await page.getByRole("button", { name: "封面", exact: true }).click();
    await expect(page.getByRole("heading", { name: "一夜好眠" })).toBeVisible();
    await page.getByRole("button", { name: "下一张封面" }).click();
    await expect(page.getByRole("heading", { name: "午后的植物园" })).toBeVisible();
    await page.getByRole("button", { name: "照片墙" }).click();

    await expect(page.getByRole("heading", { name: "2026 . 09 . 20", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "2026 . 09 . 21", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /查看照片：午后的植物园/ })).toHaveCount(2);
    await expect(page.getByRole("button", { name: /查看照片：一夜好眠/ })).toHaveCount(1);
    await expect(page.getByRole("link", { name: /只有文字的傍晚/ })).toHaveCount(1);
    await expect(page.getByText("文字记录", { exact: true })).toBeVisible();
    await checkNoOverflow(page);

    await page.getByRole("link", { name: /只有文字的傍晚/ }).click();
    await expect(page).toHaveURL(/\/moments\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "只有文字的傍晚", level: 1 })).toBeVisible();
    await expect(page.getByText("我们聊了很久，没有拍照。")).toBeVisible();
  } finally {
    await pair.cleanup();
  }
});

test("照片可放大并用方向键切换，关闭后焦点回到触发照片", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    const moment = await createMoment(page.context(), { title: "夜航归来", date: "2026-09-22" });
    const first = await attachPhoto(page.context(), moment.id, moment.version, "harbor-a.jpg");
    await attachPhoto(page.context(), moment.id, first.version, "harbor-b.jpg");
    await page.goto(`/moments/${moment.id}`);

    const opener = page.getByRole("button", { name: "放大查看：夜航归来，第 1 张照片" });
    await opener.click();
    const viewer = page.getByRole("dialog", { name: "大图查看：夜航归来" });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("img")).toHaveAttribute("alt", "夜航归来，第 1 张照片");
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByRole("img")).toHaveAttribute("alt", "夜航归来，第 2 张照片");
    await page.keyboard.press("ArrowLeft");
    await expect(viewer.getByRole("img")).toHaveAttribute("alt", "夜航归来，第 1 张照片");
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(opener).toBeFocused();
  } finally {
    await pair.cleanup();
  }
});

test("照片加载失败提供重试入口，恢复后可重新加载", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    const moment = await createMoment(page.context(), { title: "加载失败的下午", date: "2026-09-22", body: "" });
    await attachPhoto(page.context(), moment.id, moment.version, "broken.jpg");

    await page.route("**/api/photos/**", (route) => route.abort());
    await page.goto(`/moments/${moment.id}`);
    const retry = page.getByRole("button", { name: "重试加载" });
    await expect(retry).toBeVisible();
    await expect(page.getByText("这张照片暂时无法显示。")).toBeVisible();
    await checkNoOverflow(page);

    await page.unroute("**/api/photos/**");
    await retry.click();
    await expect.poll(() => page.locator(".space-memory__lead-photo").evaluate((img) => (img as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "重试加载" })).toHaveCount(0);
  } finally {
    await pair.cleanup();
  }
});

test("另一成员删除当前末张照片后，剩余照片与大图仍可浏览", async ({browser,page}) => {
  const pair=await pairedFixture(browser);await addSession(page.context(),pair.a.id);
  try {
    const moment=await createMoment(page.context(),{title:"同步删除的照片",date:"2026-10-01"});
    const first=await attachPhoto(page.context(),moment.id,moment.version,"first.jpg");
    const last=await attachPhoto(page.context(),moment.id,first.version,"last.jpg");
    await page.goto(`/moments/${moment.id}`);
    await page.getByRole("button",{name:"查看照片：同步删除的照片，第 2 张照片"}).click();
    await page.getByRole("button",{name:"放大查看：同步删除的照片，第 2 张照片"}).click();
    const removed=await pair.contextB.request.delete(`/api/photos/${last.photo.id}`,{headers:mutation(),data:{version:last.version}});
    expect(removed.status(),await removed.text()).toBe(200);
    await expect(page.getByRole("button",{name:"放大查看：同步删除的照片，第 1 张照片"})).toBeVisible();
    await expect(page.locator(".space-memory__lead-photo")).toHaveCount(1);
    const viewer=page.getByRole("dialog",{name:"大图查看：同步删除的照片"});
    if(await viewer.count()) {
      await expect(viewer.getByRole("img")).toHaveAttribute("src", `/api/photos/${first.photo.id}`);
      await page.getByRole("button",{name:"关闭大图查看"}).click();
    }
    await expect(page.getByRole("button",{name:"放大查看：同步删除的照片，第 1 张照片"})).toBeVisible();
  } finally {await pair.cleanup();}
});
