import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

import { addSession, mutationHeaders, pairedFixture } from "./fixtures";

const VIDEO_PATH = "/art/stratum-vision.mp4";
const PREVIEW_DIR = path.resolve(".local/motion-preview");

function viewportFor(projectName: string) {
  return projectName === "webkit-mobile"
    ? { width: 390, height: 844 }
    : { width: 1280, height: 900 };
}

async function watchVideoRequests(page: Page) {
  const requests: string[] = [];
  await page.route(`**${VIDEO_PATH}`, async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  return requests;
}

async function createPhotoMoment(context: BrowserContext, title: string) {
  const created = await context.request.post("/api/moments", {
    headers: mutationHeaders(),
    data: { title, date: "2026-10-01", body: "测试数据库中的照片封面" },
  });
  expect(created.status(), await created.text()).toBe(201);
  const moment = await created.json() as { id: string; version: number };
  const photo = await context.request.post(`/api/moments/${moment.id}/photos`, {
    headers: { Origin: process.env.E2E_ORIGIN! },
    multipart: {
      file: {
        name: "home-motion-cover.jpg",
        mimeType: "image/jpeg",
        buffer: readFileSync(path.resolve("tests/fixtures/images/valid.jpg")),
      },
      version: String(moment.version),
    },
  });
  expect(photo.status(), await photo.text()).toBe(201);
  return { ...moment, title };
}

async function saveMotionPreview(page: Page, testInfo: TestInfo) {
  await mkdir(PREVIEW_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `home-motion-${testInfo.project.name}-${Date.now()}.png`),
    animations: "disabled",
  });
}

async function addPageSession(context: BrowserContext, pair: Awaited<ReturnType<typeof pairedFixture>>) {
  await addSession(context, pair.a.id);
}

test("首页 Stratum 首屏静音内联循环，离开视区暂停并返回续播，入口解码不改变控件宽度", async ({ browser }, testInfo) => {
  const pair = await pairedFixture(browser);
  const viewport = viewportFor(testInfo.project.name);
  await mkdir(PREVIEW_DIR, { recursive: true });
  const context = await browser.newContext({
    baseURL: process.env.E2E_ORIGIN!,
    viewport,
    timezoneId: "Asia/Shanghai",
    recordVideo: { dir: PREVIEW_DIR, size: viewport },
  });
  await addPageSession(context, pair);
  const page = await context.newPage();
  const videoArtifact = page.video();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto("/home");
    const scene = page.locator(".space-scene.home-motion-scene");
    const video = scene.locator("video.home-motion-scene__video");
    await expect(scene).toBeVisible();
    await expect.poll(() => video.getAttribute("src")).toBe(VIDEO_PATH);
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
    await expect.poll(() => video.evaluate((element) => {
      const media = element as HTMLVideoElement;
      return !media.paused && media.currentTime > 0.25;
    }), {
      timeout: 20_000,
      message: "本地 H.264 VISION 视频应真实解码并由静音自动播放",
    }).toBe(true);

    const media = await video.evaluate((element) => {
      const videoElement = element as HTMLVideoElement;
      return {
        muted: videoElement.muted,
        loop: videoElement.loop,
        playsInline: videoElement.playsInline,
        controls: videoElement.controls,
        width: videoElement.videoWidth,
        height: videoElement.videoHeight,
        currentTime: videoElement.currentTime,
        currentSrc: new URL(videoElement.currentSrc).pathname,
      };
    });
    expect(media).toMatchObject({ muted: true, loop: true, playsInline: true, controls: false, width: 1920, height: 1080, currentSrc: VIDEO_PATH });
    const initialTime = media.currentTime;
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime), {
      message: "应观察到解码视频的播放时间实际推进",
    }).toBeGreaterThan(initialTime + 0.35);

    const addPhoto = page.getByRole("link", { name: "添加照片", exact: true });
    const memories = page.getByRole("link", { name: "走进回忆", exact: true });
    await expect(addPhoto).toBeVisible();
    await expect(memories).toBeVisible();
    await addPhoto.hover();
    const addPhotoWidth = (await addPhoto.boundingBox())?.width;
    const memoriesWidth = (await memories.boundingBox())?.width;
    await expect.poll(() => addPhoto.locator(".home-decode__visual").textContent()).toBe("添加照片");
    await expect.poll(() => memories.locator(".home-decode__visual").textContent()).toBe("走进回忆");
    expect((await addPhoto.boundingBox())?.width).toBe(addPhotoWidth);
    expect((await memories.boundingBox())?.width).toBe(memoriesWidth);
    await expect(addPhoto).toHaveAccessibleName("添加照片");
    await expect(memories).toHaveAccessibleName("走进回忆");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "首页主视觉不产生横向溢出").toBe(true);

    if (testInfo.project.name === "chromium") {
      await expect(scene).toHaveAttribute("data-motion", "true");
      const stage = scene.locator(".home-motion-scene__stage");
      const beforePointerMove = await stage.evaluate((element) => getComputedStyle(element).transform);
      await page.mouse.move(viewport.width * 0.9, viewport.height * 0.8);
      await expect.poll(() => stage.evaluate((element) => getComputedStyle(element).transform), {
        message: "桌面鼠标移动应驱动舞台的实际视差变换",
      }).not.toBe(beforePointerMove);
    }

    await saveMotionPreview(page, testInfo);

    await page.evaluate(() => {
      const hero = document.querySelector<HTMLElement>(".space-home");
      window.scrollTo({ top: (hero?.offsetTop ?? 0) + (hero?.offsetHeight ?? window.innerHeight), behavior: "instant" });
    });
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).paused), {
      message: "首屏离开视区后应暂停解码视频",
    }).toBe(true);
    const pausedAt = await video.evaluate((element) => (element as HTMLVideoElement).currentTime);
    await page.waitForTimeout(350);
    expect(Math.abs((await video.evaluate((element) => (element as HTMLVideoElement).currentTime)) - pausedAt)).toBeLessThan(0.04);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect.poll(() => video.evaluate((element, stoppedAt) => {
      const media = element as HTMLVideoElement;
      return !media.paused && media.currentTime > stoppedAt + 0.2;
    }, pausedAt), {
      timeout: 12_000,
      message: "返回首屏后应从暂停位置恢复播放",
    }).toBe(true);

    await addPhoto.click();
    await expect(page).toHaveURL(/\/moments\/new$/);
    await page.goto("/home");
    await page.getByRole("link", { name: "走进回忆", exact: true }).click();
    await expect(page).toHaveURL(/\/moments$/);
    expect(pageErrors, "首页动效与入口流程不应产生浏览器运行时错误").toEqual([]);
  } finally {
    await context.close();
    if (videoArtifact) {
      await videoArtifact.saveAs(path.join(PREVIEW_DIR, `home-motion-${testInfo.project.name}-${Date.now()}.webm`));
    }
    await pair.cleanup();
  }
});

test("减少动态效果时保留照片封面和导航，且从不请求首屏视频", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  const moment = await createPhotoMoment(page.context(), `减少动态封面-${randomUUID().slice(0, 8)}`);
  await page.setViewportSize(viewportFor(testInfo.project.name));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const videoRequests = await watchVideoRequests(page);

  try {
    await page.goto("/home");
    const video = page.locator(".home-motion-scene__video");
    const poster = page.locator(".home-motion-scene__poster");
    const cover = page.locator(".space-home__featured");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("在这里");
    await expect(poster).toBeVisible();
    await expect.poll(() => poster.evaluate((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(cover).toBeVisible();
    await expect(cover).toHaveAttribute("href", `/moments/${moment.id}`);
    await expect.poll(() => cover.locator("img").evaluate((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(video).not.toHaveAttribute("src", /.*/);
    await page.waitForTimeout(1_200);
    expect(videoRequests).toEqual([]);

    await cover.click();
    await expect(page).toHaveURL(new RegExp(`/moments/${moment.id}$`));
    await expect(page.getByRole("heading", { name: moment.title, exact: true, level: 1 })).toBeVisible();
    await page.goto("/home");
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "相册", exact: true }).click();
    await expect(page).toHaveURL(/\/moments$/);
    expect(videoRequests).toEqual([]);
  } finally {
    await pair.cleanup();
  }
});

test("saveData 开启时不请求首屏视频，首页标题、照片入口和导航立即可读", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  await page.setViewportSize(viewportFor(testInfo.project.name));
  await page.addInitScript(() => {
    const connection = new EventTarget();
    Object.defineProperty(connection, "saveData", { configurable: false, value: true });
    Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
  });
  const videoRequests = await watchVideoRequests(page);

  try {
    await page.goto("/home");
    await expect.poll(() => page.evaluate(() => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)).toBe(true);
    const video = page.locator(".home-motion-scene__video");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("在这里");
    await expect(page.getByRole("link", { name: "添加照片", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "走进回忆", exact: true })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "主要导航" });
    await expect(nav.getByRole("link", { name: "相册", exact: true })).toBeVisible();
    await expect.poll(() => video.getAttribute("src")).toBe(null);
    await page.waitForTimeout(1_200);
    expect(videoRequests).toEqual([]);
    await page.screenshot({
      path: path.join(PREVIEW_DIR, `home-motion-save-data-${testInfo.project.name}-${Date.now()}.png`),
      animations: "disabled",
    });
  } finally {
    await pair.cleanup();
  }
});
