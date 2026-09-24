import { expect, test, type Page } from "@playwright/test";

import { addSession, checkNoOverflow, userFixture } from "./fixtures";

async function stableGoto(page: Page, path: string) {
  try { await page.goto(path); } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("is interrupted by another navigation")) throw error;
  }
  if (new URL(page.url()).pathname !== path) await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

test("首位成员登录建屋、邀请第二人，并拒绝第三人重复加入", async ({ browser, page }, testInfo) => {
  const owner = await userFixture("小满");
  const invitedContext = await browser.newContext();
  const thirdContext = await browser.newContext();
  try {
    await stableGoto(page, "/login");
    await page.getByLabel("邮箱").fill(owner.email);
    await page.getByLabel("密码").fill(owner.password);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByRole("heading", { name: "为你们建一间小屋" })).toBeVisible();

    await page.getByLabel("小屋名称").fill("风铃小屋");
    await page.getByLabel("你的名字").fill("小满");
    await page.getByLabel("恋爱开始日期").fill("2020-05-20");
    await page.getByRole("button", { name: "创建小屋" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "相爱的第", exact: false })).toBeVisible();
    await checkNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("onboarding-home.png"), fullPage: true });

    await stableGoto(page, "/settings");
    await page.getByLabel("第一位成员").fill("   ");
    await page.getByRole("button", { name: "保存小屋资料" }).click();
    await expect(page.getByLabel("第一位成员")).toHaveValue("   ");
    await expect(page.getByText("显示名称不能为空且最多 60 个字符")).toBeVisible();
    await page.getByLabel("第一位成员").fill("小满");
    await page.getByRole("button", { name: "保存小屋资料" }).click();
    await expect(page.getByText("小屋资料已保存。")).toBeVisible();

    await page.getByRole("button", { name: "生成邀请链接" }).click();
    const inviteLink = page.locator(".invite-link");
    await expect(inviteLink).toBeVisible();
    const inviteUrl = await inviteLink.getAttribute("href");
    expect(inviteUrl).toBeTruthy();

    const invited = await invitedContext.newPage();
    await invited.goto(inviteUrl!);
    await expect(invited.getByRole("heading", { name: "加入「风铃小屋」" })).toBeVisible();
    await invited.getByLabel("你的名字").fill("阿夏");
    await invited.getByLabel("邮箱").fill(`invited-${Date.now()}@example.test`);
    await invited.getByLabel("设置密码").fill("Invited-test-password-2026!");
    await invited.getByRole("button", { name: "加入小屋" }).click();
    await expect(invited).toHaveURL(/\/home$/);
    await expect(invited.locator(".side-brand:visible strong, .mobile-topbar__title:visible strong").filter({ hasText: "风铃小屋" })).toBeVisible();

    const third = await thirdContext.newPage();
    await third.goto(inviteUrl!);
    await expect(third.getByText(/邀请不存在|邀请.*失效|无法使用/)).toBeVisible();
    await expect(third.getByLabel("邮箱")).toHaveCount(0);
  } finally {
    await invitedContext.close();
    await thirdContext.close();
  }
});

test("已登录但尚未建屋的账号访问内容页会前往设置流程", async ({ page }) => {
  const user = await userFixture("新成员");
  await addSession(page.context(), user.id);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: "为你们建一间小屋" })).toBeVisible();
});
