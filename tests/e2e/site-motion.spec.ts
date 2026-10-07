import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

import { addSession, mutationHeaders, pairedFixture } from "./fixtures";

type MotionCounter = "title" | "calendar" | "todoCheck" | "galleryTimeline" | "galleryViewer";
const PREVIEW_DIR = path.resolve(".local/motion-preview");

async function savePreview(page: Page, name: string, testInfo: TestInfo) {
  await mkdir(PREVIEW_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${name}-${testInfo.project.name}.png`),
    animations: "disabled",
  });
}

async function trackMotion(page: Page) {
  await page.addInitScript(() => {
    type MotionWindow = Window & { __siteMotionStarts?: Record<string, number> };
    const state = window as MotionWindow;
    state.__siteMotionStarts = { title: 0, calendar: 0, todoCheck: 0, galleryTimeline: 0, galleryViewer: 0 };
    document.addEventListener("animationstart", (event) => {
      if (!(event.target instanceof Element)) return;
      const counters = state.__siteMotionStarts!;
      if (event.target.matches(".motion-title__inner")) counters.title += 1;
      if (event.target.matches(".life-calendar-grid")) counters.calendar += 1;
      if (event.target.matches(".life-todo-check")) counters.todoCheck += 1;
      if (event.target.matches(".space-gallery__timeline")) counters.galleryTimeline += 1;
      if (event.target.matches(".space-photo-viewer")) counters.galleryViewer += 1;
    }, true);
  });
}

async function motionStarts(page: Page, counter: MotionCounter) {
  return page.evaluate((key) => {
    const state = window as Window & { __siteMotionStarts?: Record<string, number> };
    return state.__siteMotionStarts?.[key] ?? 0;
  }, counter);
}

async function createTodo(page: Page, title: string) {
  const response = await page.request.post("/api/todos", {
    headers: mutationHeaders(),
    data: { title, description: "", assigneeId: null, dueDate: null, completed: false },
  });
  expect(response.status(), await response.text()).toBe(201);
  return await response.json() as {
    id: string;
    title: string;
    description: string;
    assigneeId: string | null;
    dueDate: string | null;
    completed: boolean;
    version: number;
  };
}

async function uploadMomentPhoto(request: APIRequestContext, momentId: string, version: number, filename: string) {
  const response = await request.post(`/api/moments/${momentId}/photos`, {
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
  expect(response.status(), await response.text()).toBe(201);
  return await response.json() as { photo: { id: string; filename: string }; version: number };
}

async function createPhotoMoment(page: Page, title: string) {
  const created = await page.request.post("/api/moments", {
    headers: mutationHeaders(),
    data: { title, date: "2026-10-04", body: "相册转场和大图开合使用隔离测试照片。" },
  });
  expect(created.status(), await created.text()).toBe(201);
  const moment = await created.json() as { id: string; version: number };
  await uploadMomentPhoto(page.request, moment.id, moment.version, "motion-check.jpg");
  return moment.id;
}

test("页面标题进入后只播放一次，SSE刷新保留编辑草稿且不重播标题", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  await trackMotion(page);
  const todo = await createTodo(page, "同步动画验收");

  try {
    await page.goto("/home");
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "待办", exact: true }).click();
    await expect(page.getByRole("heading", { name: "共同待办", level: 1 })).toBeVisible();
    await expect.poll(() => motionStarts(page, "title")).toBeGreaterThan(0);

    await page.getByRole("link", { name: "同步动画验收", exact: true }).click();
    await expect(page.getByRole("heading", { name: "同步动画验收", level: 1 })).toBeVisible();
    const titleStartsBeforeEdit = await motionStarts(page, "title");
    await page.getByRole("link", { name: "编辑", exact: true }).click();
    const title = page.locator(".page-header--motion .motion-title__inner");
    await expect(title).toHaveText("编辑 同步动画验收");
    await expect.poll(() => motionStarts(page, "title")).toBeGreaterThan(titleStartsBeforeEdit);
    await expect(page.locator(".connection-status:visible").first()).toHaveAttribute("title", "另一方的更新会自动出现");
    await expect.poll(() => title.evaluate((element) => element.getAnimations().every((animation) => animation.playState === "finished"))).toBe(true);

    const titleNode = await title.elementHandle();
    const titleStartsBeforeRefresh = await motionStarts(page, "title");
    const titleDraft = page.getByLabel("标题", { exact: true });
    const descriptionDraft = page.getByLabel("说明", { exact: true });
    await titleDraft.fill("我正在写但还没保存的标题");
    await descriptionDraft.fill("这段内容要留在草稿里。");

    const currentResponse = await pair.contextB.request.get(`/api/todos/${todo.id}`);
    expect(currentResponse.status()).toBe(200);
    const current = await currentResponse.json() as typeof todo;
    const sessionRefresh = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/session" && response.request().method() === "GET";
    });
    const editorRefresh = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === `/api/todos/${todo.id}` && response.request().method() === "GET";
    });
    const update = await pair.contextB.request.patch(`/api/todos/${todo.id}`, {
      headers: mutationHeaders(),
      data: {
        title: "另一位成员刚刚改过",
        description: current.description,
        assigneeId: current.assigneeId,
        dueDate: current.dueDate,
        completed: current.completed,
        version: current.version,
      },
    });
    expect(update.status(), await update.text()).toBe(200);
    await Promise.all([sessionRefresh, editorRefresh]);

    await expect(titleDraft).toHaveValue("我正在写但还没保存的标题");
    await expect(descriptionDraft).toHaveValue("这段内容要留在草稿里。");
    expect(titleNode).not.toBeNull();
    expect(await titleNode!.evaluate((element) => element.isConnected)).toBe(true);
    expect(await motionStarts(page, "title")).toBe(titleStartsBeforeRefresh);
  } finally {
    await pair.cleanup();
  }
});

test("相册切换到照片墙会揭示内容，大图关闭保留 Escape 和焦点返回", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  await trackMotion(page);
  const momentId = await createPhotoMoment(page, "夜航相册动效验收");

  try {
    await page.goto("/home");
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "相册", exact: true }).click();
    const gallery = page.locator(".space-gallery[data-gallery-view]");
    await expect(gallery).toHaveAttribute("data-gallery-view", "wall");
    await page.getByRole("button", { name: "封面", exact: true }).click();
    await page.getByRole("button", { name: "照片墙", exact: true }).click();
    await expect(gallery).toHaveAttribute("data-gallery-view", "wall");
    await expect(page.locator(".space-gallery__group")).toHaveCount(1);
    await expect.poll(() => motionStarts(page, "galleryTimeline")).toBeGreaterThan(0);
    await savePreview(page, "site-motion-gallery-wall", testInfo);

    await page.goto(`/moments/${momentId}`);
    await expect(page).toHaveURL(new RegExp(`/moments/${momentId}$`));
    const opener = page.getByRole("button", { name: "放大查看：夜航相册动效验收，第 1 张照片" });
    await opener.click();
    const viewer = page.getByRole("dialog", { name: "大图查看：夜航相册动效验收" });
    await expect(viewer).toBeVisible();
    await expect(viewer).toHaveAttribute("data-gallery-motion", "open");
    await expect.poll(() => motionStarts(page, "galleryViewer")).toBeGreaterThan(0);

    const viewerStartsBeforeClose = await motionStarts(page, "galleryViewer");
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveAttribute("data-gallery-motion", "closing");
    await expect.poll(() => motionStarts(page, "galleryViewer")).toBeGreaterThan(viewerStartsBeforeClose);
    await expect(viewer).toBeHidden();
    await expect(opener).toBeFocused();
  } finally {
    await pair.cleanup();
  }
});

test("日历月份和选日动效不妨碍选择日期", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  await trackMotion(page);

  try {
    await page.clock.setFixedTime(new Date("2026-10-06T04:00:00Z"));
    await page.goto("/home");
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "日历", exact: true }).click();
    await expect(page.getByRole("heading", { name: "共同日历", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "下个月" }).click();
    await expect(page.getByRole("heading", { name: "2026年11月", level: 2 })).toBeVisible();
    await expect(page.locator(".life-calendar-grid")).toHaveAttribute("data-direction", "forward");
    await expect.poll(() => motionStarts(page, "calendar")).toBeGreaterThan(0);

    const day = page.locator('[data-date="2026-11-11"]');
    await day.click();
    await expect(day).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#selected-day-title")).toContainText("11月11日");
    await savePreview(page, "site-motion-calendar", testInfo);
  } finally {
    await pair.cleanup();
  }
});

test("减少动态效果时待办筛选、完成和失败回退仍能即时操作", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  await trackMotion(page);
  const todo = await createTodo(page, "减少动态下的共同待办");

  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/home");
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "待办", exact: true }).click();
    const filters = page.getByRole("group", { name: "筛选待办" });
    await filters.getByRole("button", { name: "已完成", exact: true }).click();
    await expect(page.locator(".life-todo-empty--filter")).toBeVisible();
    await filters.getByRole("button", { name: "未完成", exact: true }).click();
    await filters.getByRole("button", { name: "全部", exact: true }).click();

    const row = page.locator(".life-todo-row").filter({ has: page.getByRole("link", { name: todo.title, exact: true }) });
    const check = row.getByRole("button");
    await expect(check).toHaveAttribute("aria-pressed", "false");
    await check.click();
    await expect(page.getByText(`已完成「${todo.title}」`, { exact: true })).toBeVisible();
    await expect(check).toHaveAttribute("aria-pressed", "true");

    const successfulConfirmation = await check.getAttribute("data-confirmation");
    expect(successfulConfirmation).toMatch(/^(odd|even)$/);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect.poll(() => check.evaluate((element) => element.getAnimations().every((animation) => animation.playState === "finished"))).toBe(true);
    const startsBeforeFailure = await motionStarts(page, "todoCheck");

    await page.route(`**/api/todos/${todo.id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "TEST_TODO_FAILED", message: "测试中的保存失败" } }),
        });
      }
      return route.continue();
    });
    await check.click();
    await expect(page.getByText("测试中的保存失败", { exact: true })).toBeVisible();
    await expect(check).toHaveAttribute("aria-pressed", "true");
    await expect(check).not.toHaveAttribute("data-confirmation", /.+/);
    await expect.poll(() => motionStarts(page, "todoCheck")).toBe(startsBeforeFailure);
    await savePreview(page, "site-motion-todos-reduced", testInfo);
  } finally {
    await pair.cleanup();
  }
});

test("另一位成员的较新待办状态先经SSE到达时，晚到PATCH不显示旧完成动效", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  await trackMotion(page);
  const todo = await createTodo(page, "并发更新保留较新状态");
  let releaseHeldResponse: () => void = () => undefined;
  try {
    await page.goto("/home");
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "待办", exact: true }).click();
    await page.getByRole("group", { name: "筛选待办" }).getByRole("button", { name: "全部", exact: true }).click();
    const row = page.locator(".life-todo-row").filter({ has: page.getByRole("link", { name: todo.title, exact: true }) });
    const check = row.getByRole("button");
    await expect(check).toHaveAttribute("aria-pressed", "false");

    let notifyHeldResponse!: () => void;
    const heldResponseReady = new Promise<void>((resolve) => { notifyHeldResponse = resolve; });
    const releaseGate = new Promise<void>((resolve) => { releaseHeldResponse = resolve; });
    let heldStatus = 0;
    await page.route(`**/api/todos/${todo.id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      const response = await route.fetch();
      heldStatus = response.status();
      notifyHeldResponse();
      await releaseGate;
      await route.fulfill({ response });
    });

    await check.click();
    await heldResponseReady;
    expect(heldStatus).toBe(200);

    const currentResponse = await pair.contextB.request.get(`/api/todos/${todo.id}`);
    expect(currentResponse.status()).toBe(200);
    const current = await currentResponse.json() as typeof todo;
    expect(current.completed).toBe(true);
    let refreshedTodo: typeof todo | undefined;
    const listRefresh = page.waitForResponse(async (response) => {
      const url = new URL(response.url());
      if (url.pathname !== "/api/todos" || response.request().method() !== "GET") return false;
      const snapshot = await response.json() as { items: typeof todo[] };
      const item = snapshot.items.find((candidate) => candidate.id === todo.id);
      if (!item || item.version !== current.version + 1 || item.completed) return false;
      refreshedTodo = item;
      return true;
    });
    const newerResponse = await pair.contextB.request.patch(`/api/todos/${todo.id}`, {
      headers: mutationHeaders(),
      data: {
        title: current.title,
        description: current.description,
        assigneeId: current.assigneeId,
        dueDate: current.dueDate,
        completed: false,
        version: current.version,
      },
    });
    expect(newerResponse.status(), await newerResponse.text()).toBe(200);
    const newer = await newerResponse.json() as typeof todo;
    expect(newer.completed).toBe(false);
    expect(newer.version).toBe(current.version + 1);

    await listRefresh;
    expect(refreshedTodo).toMatchObject({ version: newer.version, completed: false });

    releaseHeldResponse();
    await expect(check).toHaveAttribute("aria-pressed", "false");
    await expect(check).toHaveAttribute("aria-busy", "false");
    await expect(page.getByText(`已完成「${todo.title}」`, { exact: true })).toHaveCount(0);
    await expect(check).not.toHaveAttribute("data-confirmation", /.+/);
    expect(await motionStarts(page, "todoCheck")).toBe(0);
  } finally {
    releaseHeldResponse();
    await pair.cleanup();
  }
});

test("较新照片上传经SSE到达后，晚到删除响应保留最新照片", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  const momentId = await createPhotoMoment(page, "并发照片更新验收");
  let releaseHeldResponse: () => void = () => undefined;
  try {
    const initialResponse = await pair.contextB.request.get(`/api/moments/${momentId}`);
    expect(initialResponse.status()).toBe(200);
    const initial = await initialResponse.json() as { id: string; version: number; photos: { id: string; filename: string }[] };
    expect(initial.photos).toHaveLength(1);
    const oldPhoto = initial.photos[0];

    await page.goto(`/moments/${momentId}`);
    await expect(page.locator(".space-memory__lead-photo")).toHaveAttribute("src", `/api/photos/${oldPhoto.id}?variant=preview`);
    let notifyHeldResponse!: () => void;
    const heldResponseReady = new Promise<void>((resolve) => { notifyHeldResponse = resolve; });
    const releaseGate = new Promise<void>((resolve) => { releaseHeldResponse = resolve; });
    let heldStatus = 0;
    await page.route(`**/api/photos/${oldPhoto.id}`, async (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      const response = await route.fetch();
      heldStatus = response.status();
      notifyHeldResponse();
      await releaseGate;
      await route.fulfill({ response });
    });

    await page.getByRole("button", { name: "管理回忆", exact: true }).click();
    await page.getByRole("button", { name: "管理照片", exact: true }).click();
    await page.getByRole("button", { name: "删除第 1 张照片", exact: true }).click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await heldResponseReady;
    expect(heldStatus).toBe(200);

    const afterDeleteResponse = await pair.contextB.request.get(`/api/moments/${momentId}`);
    expect(afterDeleteResponse.status()).toBe(200);
    const afterDelete = await afterDeleteResponse.json() as typeof initial;
    expect(afterDelete.photos).toHaveLength(0);
    const expectedUploadedVersion = afterDelete.version + 1;
    let refreshedMoment: typeof initial | undefined;
    const momentRefresh = page.waitForResponse(async (response) => {
      const url = new URL(response.url());
      if (url.pathname !== `/api/moments/${momentId}` || response.request().method() !== "GET") return false;
      const snapshot = await response.json() as typeof initial;
      if (snapshot.version !== expectedUploadedVersion || snapshot.photos.length !== 1) return false;
      refreshedMoment = snapshot;
      return true;
    });
    const uploaded = await uploadMomentPhoto(pair.contextB.request, momentId, afterDelete.version, "新拍的一张.jpg");
    expect(uploaded.version).toBe(afterDelete.version + 1);

    // A refresh triggered by the committed upload event must return the newer
    // record before the held delete response is allowed to reach the client.
    await momentRefresh;
    expect(refreshedMoment?.version).toBe(uploaded.version);
    expect(refreshedMoment?.photos.map((photo) => photo.id)).toEqual([uploaded.photo.id]);
    await expect(page.locator(".space-memory__lead-photo")).toHaveAttribute("src", `/api/photos/${uploaded.photo.id}?variant=preview`);
    await expect(page.getByRole("dialog", { name: "删除照片", exact: true }).getByRole("button", { name: "正在删除…", exact: true })).toBeDisabled();

    releaseHeldResponse();
    await expect(page.getByText("照片已删除。", { exact: true })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "关闭弹窗", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator(".space-memory__lead-photo")).toHaveAttribute("src", `/api/photos/${uploaded.photo.id}?variant=preview`);
    await expect(page.getByRole("button", { name: "放大查看：并发照片更新验收，第 1 张照片" })).toBeVisible();
    expect((await page.locator(".space-memory__lead-photo").getAttribute("src"))).not.toContain(oldPhoto.id);
  } finally {
    releaseHeldResponse();
    await pair.cleanup();
  }
});

test("桌面和手机的非首页动效体验可录制并保持主要交互", async ({ browser }, testInfo) => {
  const pair = await pairedFixture(browser);
  const viewport = testInfo.project.name === "webkit-mobile"
    ? { width: 390, height: 844 }
    : { width: 1280, height: 900 };
  await mkdir(path.join(PREVIEW_DIR, "videos"), { recursive: true });
  const context = await browser.newContext({
    baseURL: process.env.E2E_ORIGIN!,
    viewport,
    timezoneId: testInfo.project.name === "webkit-mobile" ? "America/Los_Angeles" : "Asia/Shanghai",
    isMobile: testInfo.project.name === "webkit-mobile",
    hasTouch: testInfo.project.name === "webkit-mobile",
    deviceScaleFactor: testInfo.project.name === "webkit-mobile" ? 3 : 1,
    recordVideo: { dir: path.join(PREVIEW_DIR, "videos"), size: viewport },
  });
  await addSession(context, pair.a.id);
  const page = await context.newPage();
  const video = page.video();

  try {
    const momentId = await createPhotoMoment(page, "非首页动效体验片段");
    const todo = await createTodo(page, "体验片段里的待办");
    await page.clock.setFixedTime(new Date("2026-10-06T04:00:00Z"));
    await page.goto("/home");

    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "日历", exact: true }).click();
    await page.getByRole("button", { name: "下个月" }).click();
    await expect(page.getByRole("heading", { name: "2026年11月", level: 2 })).toBeVisible();
    await page.locator('[data-date="2026-11-11"]').click();

    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "相册", exact: true }).click();
    await page.getByRole("button", { name: "照片墙", exact: true }).click();
    await expect(page.locator(".space-gallery")).toHaveAttribute("data-gallery-view", "wall");
    await page.goto(`/moments/${momentId}`);
    await expect(page).toHaveURL(new RegExp(`/moments/${momentId}$`));
    await page.getByRole("button", { name: "放大查看：非首页动效体验片段，第 1 张照片" }).click();
    await expect(page.getByRole("dialog", { name: "大图查看：非首页动效体验片段" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "大图查看：非首页动效体验片段" })).toBeHidden();

    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "待办", exact: true }).click();
    await page.getByRole("group", { name: "筛选待办" }).getByRole("button", { name: "全部", exact: true }).click();
    const check = page.locator(".life-todo-row").filter({ has: page.getByRole("link", { name: todo.title, exact: true }) }).getByRole("button");
    await check.click();
    await expect(check).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(`已完成「${todo.title}」`, { exact: true })).toBeVisible();
    await savePreview(page, "site-motion-todos", testInfo);

    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "我们", exact: true }).click();
    const passwordTrigger = page.getByRole("button", { name: "修改密码", exact: true });
    await passwordTrigger.click();
    const passwordDialog = page.getByRole("dialog", { name: "修改密码", exact: true });
    await expect(passwordDialog).toBeVisible();
    await savePreview(page, "site-motion-settings-password", testInfo);
    await page.keyboard.press("Escape");
    await expect(passwordDialog).toHaveCount(0);
    await expect(passwordTrigger).toBeFocused();
  } finally {
    await context.close();
    if (video) {
      await video.saveAs(path.join(PREVIEW_DIR, "videos", `site-motion-experience-${testInfo.project.name}.webm`));
    }
    await pair.cleanup();
  }
});
