import { randomInt, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { addSession, checkNoOverflow, userFixture } from "./fixtures";
import { pool } from "../../src/lib/db";
import { hashPassword } from "../../src/modules/auth/password";
import { createHome } from "../../src/modules/home/service";

async function administratorFixture() {
  const id = randomUUID();
  const phone = newTestPhone();
  const password = `Test-admin-${randomUUID()}!`;
  await pool.query(
    "INSERT INTO users(id,email,phone,display_name,password_hash,role) VALUES($1,NULL,$2,$3,$4,'admin')",
    [id, phone, "空间管理员", await hashPassword(password)],
  );
  return { id, phone, password };
}

function newTestPhone() {
  return `199${randomInt(0, 100_000_000).toString().padStart(8, "0")}`;
}

test("管理员可用手机号登录、创建并绑定成员账号，成员操作会更新状态", async ({ browser, page }, testInfo) => {
  const admin = await administratorFixture();
  const existingMember = await userFixture("林间成员");
  const homeName = `松林之间-${randomUUID().slice(0, 8)}`;
  const home = await createHome(existingMember.id, {
    name: homeName,
    startDate: "2022-08-18",
    displayName: existingMember.displayName,
  });
  const memberContext = await browser.newContext();
  const initialPassword = "Test-member-initial-2026!";
  const resetPassword = "Test-member-reset-2026!";

  try {
    const isMobile = testInfo.project.name === "webkit-mobile";
    await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await page.goto("/login");
    await page.getByLabel("登录账号（手机号或邮箱）", { exact: true }).fill(admin.phone);
    await page.getByLabel("密码", { exact: true }).fill(admin.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "账号与空间", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "成员账号", exact: true })).toBeVisible();
    await expect(page.locator(".admin-space").filter({ hasText: homeName })).toContainText(homeName);
    await checkNoOverflow(page);
    const search = page.getByPlaceholder("搜索姓名、手机号或空间", { exact: true });
    await search.fill(existingMember.email);
    await expect(page.locator(".admin-member")).toHaveCount(1);
    const screenshotPath = path.resolve(".local/ecs-deploy", isMobile ? "admin-mobile.png" : "admin-desktop.png");
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, animations: "disabled" });
    await search.clear();

    const newPhone = newTestPhone();
    await page.getByRole("button", { name: "新增成员", exact: true }).click();
    const createDialog = page.getByRole("dialog", { name: "新增成员账号", exact: true });
    await page.getByLabel("手机号", { exact: true }).fill(newPhone);
    await page.getByLabel("成员姓名", { exact: true }).fill("山茶");
    const initialPasswordInput = createDialog.getByLabel("初始密码");
    await expect(initialPasswordInput).toHaveAttribute("required", "");
    await expect(initialPasswordInput).toHaveAttribute("minlength", "12");
    await page.locator("#admin-create-home").selectOption(home.id);
    await expect(page.locator("#admin-create-slot")).toHaveValue("2");
    await createDialog.getByRole("button", { name: "创建成员账号", exact: true }).click();
    await expect(createDialog).toBeVisible();
    await expect(initialPasswordInput).toHaveAttribute("aria-invalid", "true");
    await expect(createDialog.getByText("密码长度必须为 12–128 个字符", { exact: true })).toBeVisible();
    await initialPasswordInput.fill(initialPassword);
    await createDialog.getByRole("button", { name: "创建成员账号", exact: true }).click();
    await expect(createDialog).toHaveCount(0);
    const createdMember = page.locator(".admin-member").filter({ hasText: newPhone });
    await expect(createdMember).toContainText(`手机号 · ${newPhone}`);
    await expect(createdMember).toContainText("松林之间");
    await expect(createdMember).toContainText("位置 2 / 2");

    await search.fill(newPhone);
    await expect(page.locator(".admin-member")).toHaveCount(1);
    await search.fill("不存在的成员");
    await expect(page.getByText("没有符合条件的成员。", { exact: true })).toBeVisible();
    await search.clear();

    const memberPage = await memberContext.newPage();
    await memberPage.goto("/login");
    await memberPage.getByLabel("登录账号（手机号或邮箱）", { exact: true }).fill(newPhone);
    await memberPage.getByLabel("密码", { exact: true }).fill(initialPassword);
    await memberPage.getByRole("button", { name: "登录", exact: true }).click();
    await expect(memberPage).toHaveURL(/\/home$/);
    const forbidden = await memberPage.request.get("/api/admin/overview");
    expect(forbidden.status()).toBe(403);
    await memberPage.goto("/admin");
    await expect(memberPage).toHaveURL(/\/home$/);

    await createdMember.getByRole("button", { name: "重置密码", exact: true }).click();
    const resetDialog = page.getByRole("dialog", { name: "重置成员密码", exact: true });
    await resetDialog.getByLabel("新密码", { exact: true }).fill(resetPassword);
    await resetDialog.getByRole("button", { name: "更新密码", exact: true }).click();
    await expect(resetDialog).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("成员密码已重置");
    await memberPage.goto("/home");
    await expect(memberPage).toHaveURL(/\/login$/);
    await memberPage.getByLabel("登录账号（手机号或邮箱）", { exact: true }).fill(newPhone);
    await memberPage.getByLabel("密码", { exact: true }).fill(resetPassword);
    await memberPage.getByRole("button", { name: "登录", exact: true }).click();
    await expect(memberPage).toHaveURL(/\/home$/);

    await createdMember.getByRole("button", { name: "停用账号", exact: true }).click();
    const disableDialog = page.getByRole("dialog", { name: "停用这个账号？", exact: true });
    await disableDialog.getByRole("button", { name: "确认停用", exact: true }).click();
    await expect(disableDialog).toHaveCount(0);
    await expect(createdMember.locator(".admin-status")).toHaveText("已停用");
    await memberPage.goto("/home");
    await expect(memberPage).toHaveURL(/\/login$/);
    await createdMember.getByRole("button", { name: "启用账号", exact: true }).click();
    const enableDialog = page.getByRole("dialog", { name: "重新启用账号？", exact: true });
    await enableDialog.getByRole("button", { name: "确认启用", exact: true }).click();
    await expect(enableDialog).toHaveCount(0);
    await expect(createdMember.locator(".admin-status")).toHaveText("正常");
    await memberPage.getByLabel("登录账号（手机号或邮箱）", { exact: true }).fill(newPhone);
    await memberPage.getByLabel("密码", { exact: true }).fill(resetPassword);
    await memberPage.getByRole("button", { name: "登录", exact: true }).click();
    await expect(memberPage).toHaveURL(/\/home$/);
  } finally {
    await memberContext.close();
  }
});

test("管理员可修改自己的密码并从面板退出", async ({ browser, page }) => {
  const admin = await administratorFixture();
  const context = await browser.newContext();
  try {
    await addSession(context, admin.id);
    const adminPage = await context.newPage();
    await adminPage.goto("/admin");
    await expect(adminPage.getByRole("heading", { name: "账号与空间", exact: true })).toBeVisible();

    await adminPage.getByRole("button", { name: "修改我的密码", exact: true }).click();
    const dialog = adminPage.getByRole("dialog", { name: "修改管理员密码", exact: true });
    await adminPage.getByLabel("当前密码", { exact: true }).fill(admin.password);
    await adminPage.getByLabel("新密码", { exact: true }).fill("Test-admin-password-rotated-2026!");
    await adminPage.getByLabel("确认新密码", { exact: true }).fill("Test-admin-password-rotated-2026!");
    await dialog.getByRole("button", { name: "保存新密码", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(adminPage.getByRole("status")).toContainText("管理员密码已更新");
    expect((await adminPage.request.get("/api/session")).status()).toBe(200);

    await adminPage.getByRole("button", { name: "退出", exact: true }).click();
    await expect(adminPage).toHaveURL(/\/login$/);
  } finally {
    await context.close();
  }
});

test("未配对成员可从面板加入存在空位的情侣空间", async ({ browser }) => {
  const admin = await administratorFixture();
  const existingMember = await userFixture("现有成员");
  const home = await createHome(existingMember.id, {
    name: "月光花园",
    startDate: "2021-03-14",
    displayName: existingMember.displayName,
  });
  const unpaired = await userFixture("等待加入");
  const context = await browser.newContext();
  try {
    await addSession(context, admin.id);
    const page = await context.newPage();
    await page.goto("/admin");
    const member = page.locator(".admin-member").filter({ hasText: unpaired.email });
    await expect(member).toContainText("尚未配对");
    await member.getByRole("button", { name: "绑定空间", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "绑定到情侣空间", exact: true });
    await page.locator("#admin-bind-home").selectOption(home.id);
    await expect(page.locator("#admin-bind-slot")).toHaveValue("2");
    await dialog.getByRole("button", { name: "确认绑定", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(member).toContainText("月光花园");
    await expect(member).toContainText("位置 2 / 2");
  } finally {
    await context.close();
  }
});
