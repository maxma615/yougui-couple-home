import path from "node:path";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { addSession, pairedFixture } from "./fixtures";

const mutation = () => ({ Origin: process.env.E2E_ORIGIN!, "Content-Type": "application/json" });

async function createMoment(
  context: import("@playwright/test").BrowserContext,
  title: string,
  date: string,
) {
  const created = await context.request.post("/api/moments", {
    headers: mutation(),
    data: { title, date, body: "照片尺寸加载回归" },
  });
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json()) as { id: string; version: number };
}

async function attachPhoto(
  context: import("@playwright/test").BrowserContext,
  momentId: string,
  version: number,
  filename: string,
) {
  const uploaded = await context.request.post(`/api/moments/${momentId}/photos`, {
    headers: { Origin: process.env.E2E_ORIGIN! },
    multipart: {
      file: {
        name: filename,
        mimeType: "image/jpeg",
        buffer: readFileSync(path.resolve("tests/fixtures/images/valid.jpg")),
      },
      version: String(version),
    },
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  return (await uploaded.json()) as { photo: { id: string }; version: number };
}

test("相册封面用预览、照片墙用懒加载缩略图，只有打开大图才请求原片", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  const older = await createMoment(page.context(), "旧照片", "2026-10-01");
  await attachPhoto(page.context(), older.id, older.version, "older.jpg");
  const latest = await createMoment(page.context(), "手机相册性能回归", "2026-10-02");
  const latestPhoto = await attachPhoto(page.context(), latest.id, latest.version, "latest.jpg");
  const photoRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/photos/")) photoRequests.push(request.url());
  });

  try {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/moments");
    await page.getByRole("button", { name: "封面", exact: true }).click();
    const cover = page.locator(".space-cover__image");
    await expect(cover).toBeVisible();
    await expect.poll(() => cover.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(new URL((await cover.getAttribute("src"))!, process.env.E2E_ORIGIN!).searchParams.get("variant")).toBe("preview");
    expect(photoRequests.some((url) => url.includes(`/api/photos/${latestPhoto.photo.id}?variant=preview`))).toBe(true);

    await page.getByRole("button", { name: "照片墙" }).click();
    const tile = page.locator(".space-gallery__tile").filter({ hasText: "手机相册性能回归" });
    const thumbnail = tile.locator(".space-gallery__tile-image");
    await expect(thumbnail).toHaveAttribute("loading", "lazy");
    expect(new URL((await thumbnail.getAttribute("src"))!, process.env.E2E_ORIGIN!).searchParams.get("variant")).toBe("thumbnail");
    await tile.scrollIntoViewIfNeeded();
    await expect.poll(() => thumbnail.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(photoRequests.some((url) => url.includes(`/api/photos/${latestPhoto.photo.id}?variant=thumbnail`))).toBe(true);

    await page.goto(`/moments/${latest.id}`);
    const detail = page.locator(".space-memory__lead-photo");
    await expect(detail).toBeVisible();
    await expect.poll(() => detail.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(new URL((await detail.getAttribute("src"))!, process.env.E2E_ORIGIN!).searchParams.get("variant")).toBe("preview");
    expect(photoRequests.some((url) => new URL(url).pathname === `/api/photos/${latestPhoto.photo.id}` && !new URL(url).searchParams.has("variant"))).toBe(false);

    await page.getByRole("button", { name: "放大查看：手机相册性能回归，第 1 张照片" }).click();
    const viewer = page.getByRole("dialog", { name: "大图查看：手机相册性能回归" });
    const original = viewer.getByRole("img");
    await expect(viewer).toBeVisible();
    await expect(original).toHaveAttribute("src", `/api/photos/${latestPhoto.photo.id}`);
    await expect.poll(() => original.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(photoRequests.some((url) => new URL(url).pathname === `/api/photos/${latestPhoto.photo.id}` && !new URL(url).searchParams.has("variant"))).toBe(true);
  } finally {
    await pair.cleanup();
  }
});

test("封面预览加载失败后重试仍使用预览尺寸并成功恢复", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  const moment = await createMoment(page.context(), "预览失败重试", "2026-10-02");
  const uploaded = await attachPhoto(page.context(), moment.id, moment.version, "retry.jpg");
  let attempts = 0;
  await page.route((url) => url.pathname === `/api/photos/${uploaded.photo.id}` && url.searchParams.get("variant") === "preview", async (route) => {
    attempts += 1;
    if (attempts === 1) await route.abort("failed");
    else await route.continue();
  });

  try {
    await page.goto("/moments");
    await page.getByRole("button", { name: "封面", exact: true }).click();
    await expect(page.getByRole("button", { name: "重试封面" })).toBeVisible();
    await page.getByRole("button", { name: "重试封面" }).click();
    const cover = page.locator(".space-cover__image");
    await expect(cover).toBeVisible();
    await expect.poll(() => cover.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const retriedUrl = new URL((await cover.getAttribute("src"))!, process.env.E2E_ORIGIN!);
    expect(retriedUrl.searchParams.get("variant")).toBe("preview");
    expect(retriedUrl.searchParams.get("retry")).toBe("1");
    expect(attempts).toBe(2);
  } finally {
    await pair.cleanup();
  }
});
