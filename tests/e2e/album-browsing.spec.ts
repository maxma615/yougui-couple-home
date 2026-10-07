import path from "node:path";
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { addSession, checkNoOverflow, pairedFixture } from "./fixtures";

const headers = () => ({ Origin: process.env.E2E_ORIGIN!, "Content-Type": "application/json" });
async function memory(context: BrowserContext, title: string, date = "2026-10-06") {
  const response = await context.request.post("/api/moments", { headers: headers(), data: { title, date, body: "海风和夕阳，都值得留下。" } });
  expect(response.status(), await response.text()).toBe(201);
  return await response.json() as { id: string; version: number };
}
async function photo(context: BrowserContext, id: string, version: number, filename: string) {
  const response = await context.request.post(`/api/moments/${id}/photos`, {
    headers: { Origin: process.env.E2E_ORIGIN! },
    multipart: { file: { name: filename, mimeType: "image/jpeg", buffer: readFileSync(path.resolve("tests/fixtures/images/valid.jpg")) }, version: String(version) },
  });
  expect(response.status(), await response.text()).toBe(201);
  return await response.json() as { photo: { id: string }; version: number };
}

test("浏览详情隐藏管理操作，编辑弹窗取消不保存且保存后留在原页", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser); await addSession(page.context(), pair.a.id);
  try {
    const item = await memory(page.context(), "海边散步");
    await photo(page.context(), item.id, item.version, "IMG_984752_1.jpg");
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/moments/${item.id}`);
    await expect(page.getByRole("heading", { name: "海边散步", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "管理回忆", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "编辑文字" })).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.locator(".space-photo-delete")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain("IMG_984752_1.jpg");
    await checkNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("album-detail.png"), fullPage: true, animations: "disabled" });

    await page.getByRole("button", { name: "管理回忆", exact: true }).click();
    await page.getByRole("dialog", { name: "管理回忆", exact: true }).getByRole("button", { name: "编辑回忆", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "编辑回忆", exact: true });
    await expect(editor).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("album-editor.png"), animations: "disabled" });
    await editor.getByLabel("标题", { exact: true }).fill("还没有保存的标题");
    await editor.getByRole("button", { name: "取消", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByRole("heading", { name: "海边散步", level: 1 })).toBeVisible();
    const afterCancel = await page.context().request.get(`/api/moments/${item.id}`);
    expect((await afterCancel.json()).title).toBe("海边散步");

    await page.getByRole("button", { name: "管理回忆", exact: true }).click();
    await page.getByRole("button", { name: "编辑回忆", exact: true }).click();
    await editor.getByLabel("标题", { exact: true }).fill("海边散步的傍晚");
    await editor.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/moments/${item.id}$`));
    await expect(page.getByRole("heading", { name: "海边散步的傍晚", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "管理回忆", exact: true })).toBeFocused();
    for (const route of ["home", "calendar", "anniversaries", "settings"]) {
      await page.goto(`/${route}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`material-${route}.png`), fullPage: true, animations: "disabled" });
    }
  } finally { await pair.cleanup(); }
});

test("照片墙展示所有照片并直接打开点中的照片，文件编号退出展示", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser); await addSession(page.context(), pair.a.id);
  await page.setViewportSize({ width: 320, height: 740 });
  try {
    const first = await memory(page.context(), "沿着海岸走", "2026-10-05");
    const a = await photo(page.context(), first.id, first.version, "IMG_667788_1.jpg");
    const b = await photo(page.context(), first.id, a.version, "IMG_667788_2.jpg");
    const second = await memory(page.context(), "夜里的灯", "2026-10-06");
    await photo(page.context(), second.id, second.version, "IMG_667788_3.jpg");
    await memory(page.context(), "只写了几句话", "2026-10-04");
    const originalRequests: string[] = [];
    page.on("request", request => { const u = new URL(request.url()); if (u.pathname.startsWith("/api/photos/") && !u.searchParams.has("variant")) originalRequests.push(u.pathname); });
    await page.goto("/moments");
    await expect(page.locator(".space-gallery")).toHaveAttribute("data-gallery-view", "wall");
    await expect(page.locator(".space-gallery__tile-image")).toHaveCount(3);
    await expect(page.getByRole("link", { name: /只写了几句话/ })).toHaveCount(1);
    expect(originalRequests).toHaveLength(0);
    expect(await page.locator("body").innerText()).not.toContain("IMG_667788");
    await page.screenshot({ path: testInfo.outputPath("album-wall.png"), fullPage: true, animations: "disabled" });
    const opener = page.getByRole("button", { name: "查看照片：沿着海岸走，第 2 张照片", exact: true });
    await opener.click();
    const viewer = page.getByRole("dialog", { name: "大图查看：沿着海岸走" });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("img")).toHaveAttribute("src", `/api/photos/${b.photo.id}`);
    await expect(viewer.getByRole("img")).toHaveAttribute("alt", "沿着海岸走，第 2 张照片");
    await expect(viewer.getByRole("link", { name: "查看这段回忆", exact: true })).toHaveAttribute("href", `/moments/${first.id}`);
    await viewer.getByRole("button", { name: "关闭大图查看" }).click();
    await expect(viewer).toBeHidden(); await expect(opener).toBeFocused();
    await page.getByRole("button", { name: "封面", exact: true }).click();
    await expect(page.locator(".space-cover__image")).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain("IMG_667788");
    await checkNoOverflow(page);
  } finally { await pair.cleanup(); }
});

test("编辑弹窗在另一成员更新后保留草稿，版本冲突可比较并重试", async ({ browser, page }) => {
  const pair = await pairedFixture(browser); await addSession(page.context(), pair.a.id);
  try {
    const item = await memory(page.context(), "我们一起写的回忆");
    await page.goto(`/moments/${item.id}`);
    await page.getByRole("button", { name: "管理回忆", exact: true }).click();
    await page.getByRole("button", { name: "编辑回忆", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "编辑回忆", exact: true });
    await editor.getByLabel("标题", { exact: true }).fill("我还没有保存的标题");
    const refreshed = page.waitForResponse(async response => {
      if (new URL(response.url()).pathname !== `/api/moments/${item.id}` || response.request().method() !== "GET") return false;
      return (await response.json()).version === item.version + 1;
    });
    const savedByB = await pair.contextB.request.patch(`/api/moments/${item.id}`, { headers: headers(), data: { title: "另一位成员先保存的标题", date: "2026-10-06", body: "另一位写下的内容", version: item.version } });
    expect(savedByB.status(), await savedByB.text()).toBe(200);
    await refreshed;
    await expect(editor.getByLabel("标题", { exact: true })).toHaveValue("我还没有保存的标题");
    await editor.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(editor.getByRole("heading", { name: "内容有更新冲突" })).toBeVisible();
    await expect(editor.locator("dd").getByText("另一位成员先保存的标题", { exact: true })).toBeVisible();
    await expect(editor.getByLabel("标题", { exact: true })).toHaveValue("我还没有保存的标题");
    await editor.getByRole("button", { name: "基于最新内容重试", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByRole("heading", { name: "我还没有保存的标题", level: 1 })).toBeVisible();
    const latest = await page.context().request.get(`/api/moments/${item.id}`);
    expect((await latest.json()).version).toBe(item.version + 2);
  } finally { await pair.cleanup(); }
});

test("大图横向触摸切图，纵向与多指触摸不误切，关闭恢复焦点", async ({ browser, page }) => {
  const pair = await pairedFixture(browser); await addSession(page.context(), pair.a.id);
  try {
    const item = await memory(page.context(), "两张海边照片");
    const a = await photo(page.context(), item.id, item.version, "IMG_224466_1.jpg");
    const b = await photo(page.context(), item.id, a.version, "IMG_224466_2.jpg");
    await page.goto(`/moments/${item.id}`);
    const opener = page.getByRole("button", { name: "放大查看：两张海边照片，第 1 张照片", exact: true });
    await opener.click(); const viewer = page.getByRole("dialog", { name: "大图查看：两张海边照片" });
    const stage = viewer.locator(".space-photo-viewer__image-wrap");
    const event = (pointerId: number, clientX: number, clientY: number, isPrimary = true) => ({ pointerType: "touch", pointerId, clientX, clientY, isPrimary, bubbles: true });
    await stage.dispatchEvent("pointerdown", event(1, 240, 210));
    await stage.dispatchEvent("pointerup", event(1, 60, 215));
    await expect(viewer.getByRole("img")).toHaveAttribute("src", `/api/photos/${b.photo.id}`);
    await stage.dispatchEvent("pointerdown", event(2, 150, 170));
    await stage.dispatchEvent("pointerup", event(2, 150, 420));
    await expect(viewer.getByRole("img")).toHaveAttribute("src", `/api/photos/${b.photo.id}`);
    await stage.dispatchEvent("pointerdown", event(3, 230, 210));
    await stage.dispatchEvent("pointerdown", event(4, 190, 230, false));
    await stage.dispatchEvent("pointerup", event(3, 50, 215));
    await stage.dispatchEvent("pointerup", event(4, 190, 230, false));
    await expect(viewer.getByRole("img")).toHaveAttribute("src", `/api/photos/${b.photo.id}`);
    await page.keyboard.press("ArrowLeft");
    await expect(viewer.getByRole("img")).toHaveAttribute("src", `/api/photos/${a.photo.id}`);
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden(); await expect(opener).toBeFocused();
  } finally { await pair.cleanup(); }
});

test("照片删除仅在管理中出现，确认预览可取消且删除后其他原片保留", async ({ browser, page }) => {
  const pair = await pairedFixture(browser); await addSession(page.context(), pair.a.id);
  try {
    const item = await memory(page.context(), "值得留下的两张");
    const a = await photo(page.context(), item.id, item.version, "IMG_113355_1.jpg");
    const b = await photo(page.context(), item.id, a.version, "IMG_113355_2.jpg");
    await page.goto(`/moments/${item.id}`);
    await page.getByRole("button", { name: "管理回忆", exact: true }).click();
    await page.getByRole("button", { name: "管理照片", exact: true }).click();
    await page.getByRole("button", { name: "删除第 2 张照片", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "删除照片", exact: true });
    await expect(confirmation.locator("img")).toHaveAttribute("src", `/api/photos/${b.photo.id}?variant=thumbnail`);
    expect(await confirmation.innerText()).not.toContain("IMG_113355");
    await confirmation.getByRole("button", { name: "取消", exact: true }).click();
    const before = await page.context().request.get(`/api/moments/${item.id}`);
    expect((await before.json()).photos).toHaveLength(2);
    await page.getByRole("button", { name: "删除第 2 张照片", exact: true }).click();
    await page.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect.poll(async () => (await (await page.context().request.get(`/api/moments/${item.id}`)).json()).photos.map((p: { id: string }) => p.id)).toEqual([a.photo.id]);
    expect((await page.context().request.get(`/api/photos/${a.photo.id}`)).status()).toBe(200);
    expect((await page.context().request.get(`/api/photos/${b.photo.id}`)).status()).toBe(404);
  } finally { await pair.cleanup(); }
});

test("照片上传中不能关闭或切换管理，完成后可返回管理并恢复焦点", async ({ browser, page }) => {
  const pair = await pairedFixture(browser); await addSession(page.context(), pair.a.id);
  let release: (() => void) | undefined;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  try {
    const item = await memory(page.context(), "等照片到达");
    await photo(page.context(), item.id, item.version, "IMG_existing.jpg");
    await page.goto(`/moments/${item.id}`);
    await page.getByRole("button", { name: "管理回忆", exact: true }).click();
    await page.getByRole("button", { name: "添加照片", exact: true }).click();
    await page.route(`**/api/moments/${item.id}/photos`, async route => {
      await blocked;
      await route.continue();
    });
    const manager = page.getByRole("dialog", { name: "管理照片", exact: true });
    await manager.locator('input[type="file"]').setInputFiles(path.resolve("tests/fixtures/images/valid.png"));
    await expect(manager.getByRole("button", { name: "关闭弹窗" })).toBeDisabled();
    await expect(manager.getByRole("button", { name: "返回管理回忆" })).toBeDisabled();
    await expect(manager.getByRole("button", { name: "删除第 1 张照片" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(manager).toBeVisible();
    release!();
    await expect(manager.getByText("1 张照片已上传。", { exact: true })).toBeVisible();
    await manager.getByRole("button", { name: "返回管理回忆" }).click();
    await expect(page.getByRole("button", { name: "编辑回忆", exact: true })).toBeFocused();
  } finally { release?.(); await pair.cleanup(); }
});
