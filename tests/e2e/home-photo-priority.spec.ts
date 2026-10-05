import path from "node:path";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { addSession, pairedFixture } from "./fixtures";

const mutation = () => ({ Origin: process.env.E2E_ORIGIN!, "Content-Type": "application/json" });

async function createPhotoMoment(context: import("@playwright/test").BrowserContext, title: string) {
  const created = await context.request.post("/api/moments", {
    headers: mutation(),
    data: { title, date: "2026-10-02", body: "首页照片加载优先级回归" },
  });
  expect(created.status(), await created.text()).toBe(201);
  const moment = (await created.json()) as { id: string; version: number };
  const uploaded = await context.request.post(`/api/moments/${moment.id}/photos`, {
    headers: { Origin: process.env.E2E_ORIGIN! },
    multipart: {
      file: {
        name: "home-priority.jpg",
        mimeType: "image/jpeg",
        buffer: readFileSync(path.resolve("tests/fixtures/images/valid.jpg")),
      },
      version: String(moment.version),
    },
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  return (await uploaded.json()) as { photo: { id: string }; version: number };
}

test("慢速 3G 首页保留照片与纪念日，跳过背景视频", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  try {
    await addSession(page.context(), pair.a.id);
    const uploaded = await createPhotoMoment(page.context(), "慢网仍可读取的照片");
    await page.addInitScript(() => {
      const connection = new EventTarget() as EventTarget & {
        effectiveType: string;
        downlink: number;
        saveData: boolean;
      };
      Object.assign(connection, { effectiveType: "3g", downlink: 1, saveData: false });
      Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
    });
    const videoRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/art/stratum-vision.mp4") videoRequests.push(request.url());
    });

    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/home");
    const photo = page.locator(".space-home__featured img");
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const photoUrl = new URL((await photo.getAttribute("src"))!, process.env.E2E_ORIGIN!);
    expect(photoUrl.pathname).toBe(`/api/photos/${uploaded.photo.id}`);
    expect(photoUrl.searchParams.get("variant")).toBe("preview");
    await page.waitForTimeout(1500);
    expect(videoRequests).toHaveLength(0);

    const nav = page.getByRole("navigation", { name: "主要导航" });
    await nav.getByRole("link", { name: "纪念日", exact: true }).click();
    await expect(page).toHaveURL(/\/anniversaries$/);
    await expect(page.getByRole("heading", { level: 1, name: "纪念日" })).toBeVisible();
    await expect(page.getByRole("link", { name: "新增纪念日" }).first()).toBeVisible();
  } finally {
    await pair.cleanup();
  }
});

test("正常网络先完成被延迟的高优先级封面，再请求首页视频", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  try {
    await addSession(page.context(), pair.a.id);
    const uploaded = await createPhotoMoment(page.context(), "先加载完的首页封面");
    const orderedEvents: string[] = [];
    await page.route((url) => url.pathname === `/api/photos/${uploaded.photo.id}` && url.searchParams.get("variant") === "preview", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    page.on("requestfinished", (request) => {
      const url = new URL(request.url());
      if (url.pathname === `/api/photos/${uploaded.photo.id}` && url.searchParams.get("variant") === "preview") {
        orderedEvents.push("cover-finished");
      }
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/art/stratum-vision.mp4") orderedEvents.push("video-request");
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/home");
    const photo = page.locator(".space-home__featured img");
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect.poll(() => orderedEvents.includes("video-request"), { timeout: 8_000 }).toBe(true);
    expect(orderedEvents.indexOf("cover-finished")).toBeGreaterThanOrEqual(0);
    expect(orderedEvents.indexOf("cover-finished")).toBeLessThan(orderedEvents.indexOf("video-request"));
  } finally {
    await pair.cleanup();
  }
});
