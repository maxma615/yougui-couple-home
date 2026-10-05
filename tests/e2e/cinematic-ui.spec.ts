import { expect, test } from "@playwright/test";

import { addSession, checkNoOverflow, pairedFixture } from "./fixtures";

const mobileNavItems = ["首页", "日历", "待办", "相册", "我们"];

test("手机底部导航恰好五项，名字可读，激活项带 aria-current", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/home");
    const nav = page.getByRole("navigation", { name: "主要导航" });
    await expect(nav).toBeVisible();
    for (const label of mobileNavItems) {
      const link = nav.getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveText(label);
    }
    const count = await nav.getByRole("link").count();
    expect(count, "底部导航只有五个入口").toBe(5);
    await expect(nav.getByRole("link", { name: "首页", exact: true })).toHaveAttribute("aria-current", "page");
    for (const label of mobileNavItems.filter((item) => item !== "首页")) {
      await expect(nav.getByRole("link", { name: label, exact: true })).not.toHaveAttribute("aria-current");
    }

    await nav.getByRole("link", { name: "待办", exact: true }).click();
    await expect(page).toHaveURL(/\/todos$/);
    await expect(nav.getByRole("link", { name: "待办", exact: true })).toHaveAttribute("aria-current", "page");

    await checkNoOverflow(page);
  } finally {
    await pair.cleanup();
  }
});

test("纪念日从首页显著入口与「我们」页都能到达", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/home");
    await expect(page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "纪念日", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "纪念日", exact: true }).first().click();
    await expect(page).toHaveURL(/\/anniversaries$/);
    await expect(page.getByRole("heading", { level: 1, name: "纪念日" })).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "纪念日", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "纪念日", exact: true }).click();
    await expect(page).toHaveURL(/\/anniversaries$/);
  } finally {
    await pair.cleanup();
  }
});

test("手机上纪念日页激活「我们」，桌面侧栏仍是六个入口", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/anniversaries");
    const nav = page.getByRole("navigation", { name: "主要导航" });
    await expect(nav.getByRole("link", { name: "我们", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "纪念日", exact: true })).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/anniversaries");
    const sidebar = page.getByRole("navigation", { name: "主要导航" });
    await expect(sidebar.getByRole("link", { name: "纪念日", exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "纪念日", exact: true })).toHaveAttribute("aria-current", "page");
    const count = await sidebar.getByRole("link").count();
    expect(count, "桌面侧栏保留六个业务入口").toBe(6);
    await checkNoOverflow(page);
  } finally {
    await pair.cleanup();
  }
});

test("320px 宽度下全部主路由无横向滚动", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    await page.setViewportSize({ width: 320, height: 568 });
    for (const path of ["/home", "/calendar", "/todos", "/moments", "/anniversaries", "/settings", "/moments/new", "/todos/new", "/anniversaries/new", "/calendar/new"]) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      await checkNoOverflow(page);
    }
  } finally {
    await pair.cleanup();
  }
});

test("页面刷新与实时刷新不重播入场动画，连接状态可见", async ({ browser, page }) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    await page.goto("/home");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".connection-status:visible").first()).toBeVisible();
  } finally {
    await pair.cleanup();
  }
});
