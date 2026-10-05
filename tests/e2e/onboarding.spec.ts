import { expect, test, type Page } from "@playwright/test";

import { addSession, checkNoOverflow, userFixture } from "./fixtures";
import { pool } from "../../src/lib/db";

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
    await page.getByLabel("登录账号（手机号或邮箱）", { exact: true }).fill(owner.email);
    await page.getByLabel("密码").fill(owner.password);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByRole("heading", { name: "开启你们的情侣空间" })).toBeVisible();
    await page.screenshot({path:`docs/screenshots/cinematic-setup-${testInfo.project.name}.png`,fullPage:true,animations:"disabled"});

    const nameInput = page.getByLabel("你的名字");
    await expect(nameInput).toHaveValue("小满");
    await nameInput.evaluate((input: HTMLInputElement) => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    await nameInput.press("Backspace");
    await nameInput.press("Backspace");
    await expect(nameInput).toHaveValue("");
    await page.getByLabel("空间名称").fill("风铃小屋");
    await page.getByLabel("恋爱开始日期").fill("2020-05-20");
    await page.getByRole("button", { name: "创建空间" }).click();
    await expect(nameInput).toHaveValue("");
    await expect(nameInput).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("空间名称").fill("风铃小屋");
    await page.getByLabel("你的名字").fill("小满");
    await page.getByLabel("恋爱开始日期").fill("2020-05-20");
    await page.getByRole("button", { name: "创建空间" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: /只属于我们。/ })).toBeVisible();
    await checkNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("onboarding-home.png"), fullPage: true, animations: "disabled" });

    await page.getByRole("link", { name: "邀请另一半", exact: true }).click();
    await expect(page).toHaveURL(/\/settings#pairing$/);
    await page.getByRole("button", { name: "编辑我的昵称" }).click();
    await page.getByLabel("我的昵称", { exact: true }).fill("   ");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(page.getByLabel("我的昵称", { exact: true })).toHaveValue("   ");
    await expect(page.getByText("显示名称不能为空且最多 60 个字符")).toBeVisible();
    await page.getByLabel("我的昵称", { exact: true }).fill("小满");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(page.getByText("资料已保存。")).toBeVisible();

    await page.getByRole("button", { name: "邀请另一半", exact: true }).click();
    await page.getByRole("button", { name: "生成邀请链接" }).click();
    const inviteLink = page.locator(".space-invite-linkbox__url");
    await expect(inviteLink).toBeVisible();
    await expect(page.getByText("当前是本机预览", { exact: false })).toBeVisible();
    const inviteUrl = await inviteLink.getAttribute("href");
    expect(inviteUrl).toBeTruthy();

    const invited = await invitedContext.newPage();
    await invited.goto(inviteUrl!);
    await expect(invited.getByRole("heading", { name: "加入「风铃小屋」" })).toBeVisible();
    await invited.screenshot({path:`docs/screenshots/cinematic-invite-${testInfo.project.name}.png`,fullPage:true,animations:"disabled"});
    await invited.getByLabel("你的名字").fill("阿夏");
    await invited.getByLabel("邮箱").fill(`invited-${Date.now()}@example.test`);
    await invited.getByLabel("设置密码").fill("Invited-test-password-2026!");
    await invited.getByRole("button", { name: "加入空间" }).click();
    await expect(invited).toHaveURL(/\/home$/);
    await expect(invited.locator(".space-home__top")).toContainText("风铃小屋");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator('.space-pairing__status.is-paired')).toContainText('已配对');
    await expect(page.locator('[data-member="partner"]')).toContainText('阿夏');
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
  await expect(page.getByRole("heading", { name: "开启你们的情侣空间" })).toBeVisible();
});

test("登录页说明成员账号由管理员配置并直接登录", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "账号使用说明" })).toBeVisible();
  await expect(page.getByText("成员的账号由管理员创建并绑定到同一个情侣空间", { exact: false })).toBeVisible();
  await expect(page.getByLabel("登录账号（手机号或邮箱）", { exact: true })).toHaveAttribute("inputmode", "tel");
  await checkNoOverflow(page);
});

test("过期邀请显示原因，不出现加入表单也不泄露小屋内容", async ({ browser, page }) => {
  const owner = await userFixture("小满");
  const { createHome } = await import("../../src/modules/home/service");
  const home = await createHome(owner.id, { name: "溪山小屋", startDate: "2021-06-01", displayName: owner.displayName });
  await addSession(page.context(), owner.id);
  const invited = await page.context().request.post("/api/invites", {
    headers: { Origin: process.env.E2E_ORIGIN!, "Content-Type": "application/json" },
    data: {},
  });
  expect(invited.status()).toBe(201);
  const invite = (await invited.json()) as { token: string };
  await pool.query("UPDATE invitations SET expires_at = now() - interval '1 hour' WHERE home_id=$1", [home.id]);
  await page.goto(`/invite/${invite.token}`);
  await expect(page.getByRole("heading", { name: "这个邀请无法加入" })).toBeVisible();
  await expect(page.getByText(/失效/)).toBeVisible();
  await expect(page.getByRole("link", { name: "去登录" })).toBeVisible();
  await expect(page.getByLabel("邮箱")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "加入空间" })).toHaveCount(0);
  await expect(page.getByText("溪山小屋")).toHaveCount(0);
  await checkNoOverflow(page);
});

test("满员小屋的邀请在提交后显示满员原因且没有有效加入按钮", async ({ browser }) => {
  const owner = await userFixture("小满");
  const { createHome } = await import("../../src/modules/home/service");
  const home = await createHome(owner.id, { name: "晴天小屋", startDate: "2020-05-20", displayName: owner.displayName });
  const ownerContext = await browser.newContext();
  await addSession(ownerContext, owner.id);
  const issue = () =>
    ownerContext.request.post("/api/invites", {
      headers: { Origin: process.env.E2E_ORIGIN!, "Content-Type": "application/json" },
      data: {},
    });
  const first = await issue();
  const second = await issue();
  expect(first.status()).toBe(201);
  expect(second.status()).toBe(201);
  const firstInvite = (await first.json()) as { token: string };
  const secondInvite = (await second.json()) as { token: string };

  const partnerContext = await browser.newContext();
  const partnerPage = await partnerContext.newPage();
  const lateContext = await browser.newContext();
  const latePage = await lateContext.newPage();
  try {
    await partnerPage.goto(`/invite/${firstInvite.token}`);
    await partnerPage.getByLabel("你的名字").fill("阿夏");
    await partnerPage.getByLabel("邮箱").fill(`partner-${Date.now()}@example.test`);
    await partnerPage.getByLabel("设置密码").fill("Partner-invite-password-2026!");
    await partnerPage.getByRole("button", { name: "加入空间" }).click();
    await expect(partnerPage).toHaveURL(/\/home$/);

    await latePage.goto(`/invite/${secondInvite.token}`);
    await expect(latePage.getByRole("heading", { name: "加入「晴天小屋」" })).toBeVisible();
    await latePage.getByLabel("你的名字").fill("后来的人");
    await latePage.getByLabel("邮箱").fill(`late-${Date.now()}@example.test`);
    await latePage.getByLabel("设置密码").fill("Late-invite-password-2026!");
    await latePage.getByRole("button", { name: "加入空间" }).click();
    await expect(latePage.getByRole("heading", { name: "空间已经满员" })).toBeVisible();
    await expect(latePage.getByText("已有两位成员")).toBeVisible();
    await expect(latePage.getByRole("link", { name: "去登录" })).toBeVisible();
    await expect(latePage.getByLabel("邮箱")).toHaveCount(0);
    await expect(latePage.getByRole("button", { name: "加入空间" })).toHaveCount(0);
    await checkNoOverflow(latePage);
  } finally {
    await partnerContext.close();
    await lateContext.close();
    await ownerContext.close();
  }
});
