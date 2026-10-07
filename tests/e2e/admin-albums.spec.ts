import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { addSession, checkNoOverflow, userFixture } from "./fixtures";
import { pool } from "../../src/lib/db";
import { createHome } from "../../src/modules/home/service";
import { createMomentService } from "../../src/modules/moments/service";
import { createPhotoService } from "../../src/modules/photos/store";

test("管理员浏览不同空间的相册和大图，普通成员继续受空间隔离限制", async ({ browser, page }) => {
  const admin = await userFixture("相册管理员");
  await pool.query("UPDATE users SET role='admin' WHERE id=$1", [admin.id]);
  const suffix = randomUUID().slice(0, 6);
  const photos = [];
  for (const [index, name] of ["星河", "山海", "空相册"].entries()) {
    const member = await userFixture(name);
    const home = await createHome(member.id, { name: name + suffix, startDate: "2020-01-01", displayName: name });
    if (index < 2) {
      const ctx = { userId: member.id, homeId: home.id };
      const moment = await createMomentService(pool).create(ctx, { title: name + "回忆", date: "2026-10-07", body: "私人正文不应由相册接口提供" });
      const photo = await createPhotoService(pool).upload(ctx, moment.id, {
        data: await readFile(path.resolve("tests/fixtures/images/valid.jpg")),
        filename: "编号-不要显示.jpg", claimedMime: "image/jpeg", version: 1,
      });
      photos.push({ home, member, id: photo.photo.id });
    }
  }
  await addSession(page.context(), admin.id);
  const listing = await page.request.get("/api/admin/albums");
  expect(listing.status()).toBe(200);
  await page.goto("/admin");
  const section = page.getByRole("region", { name: "空间相册", exact: true });
  for (const photo of photos) {
    await section.getByRole("button", { name: `查看${photo.home.name}相册`, exact: true }).click();
    const tile = section.getByRole("button", { name: /打开.*照片/ }).first();
    await expect(tile).toBeVisible();
    await expect(tile.locator("img")).toHaveAttribute("src", new RegExp(`/api/admin/photos/${photo.id}\\?variant=thumbnail`));
    await tile.click();
    const viewer = page.getByRole("dialog", { name: /大图查看/ });
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("img")).toHaveAttribute("src", `/api/admin/photos/${photo.id}`);
    await expect.poll(() => viewer.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(viewer.getByRole("button", { name: "删除照片" })).toHaveCount(0);
    await viewer.getByRole("button", { name: "关闭大图查看" }).click();
    await expect(viewer).toHaveCount(0);
    await expect(section.getByText("编号-不要显示.jpg", { exact: true })).toHaveCount(0);
  }
  expect((await page.request.delete(`/api/admin/photos/${photos[0].id}`)).status()).toBe(405);
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve(".local/e2e", "admin-albums-" + test.info().project.name + ".png"), animations: "disabled" });
  await section.getByRole("button", { name: `查看空相册${suffix}相册`, exact: true }).click();
  await expect(section.getByText("这个空间还没有照片。", { exact: true })).toBeVisible();
  await checkNoOverflow(page);
  const memberContext = await browser.newContext();
  try {
    await addSession(memberContext, photos[0].member.id);
    expect((await memberContext.request.get("/api/admin/albums")).status()).toBe(403);
    expect((await memberContext.request.get(`/api/admin/photos/${photos[1].id}`)).status()).toBe(403);
    expect((await memberContext.request.get(`/api/photos/${photos[1].id}`)).status()).toBe(404);
    expect((await memberContext.request.get(`/api/photos/${photos[0].id}`)).status()).toBe(200);
  } finally {
    await memberContext.close();
  }
});

test("管理员相册分页加载更多照片，快速切换空间不会显示上一空间的照片", async ({ page }) => {
  const admin = await userFixture("分页管理员");
  await pool.query("UPDATE users SET role='admin' WHERE id=$1", [admin.id]);
  const homes = [];
  const bytes = await readFile(path.resolve("tests/fixtures/images/valid.jpg"));
  for (const [count, name] of [[63, "分页空间"], [1, "切换空间"]] as const) {
    const member = await userFixture(name);
    const home = await createHome(member.id, { name: name + randomUUID().slice(0, 6), startDate: "2020-01-01", displayName: name });
    const ctx = { userId: member.id, homeId: home.id };
    const moment = await createMomentService(pool).create(ctx, { title: name + "照片", date: "2026-10-07", body: "" });
    let version = 1;
    for (let index = 0; index < count; index++) {
      version = (await createPhotoService(pool).upload(ctx, moment.id, { data: bytes, filename: "test.jpg", claimedMime: "image/jpeg", version })).version;
    }
    homes.push(home);
  }
  await addSession(page.context(), admin.id);
  await page.goto("/admin");
  const section = page.getByRole("region", { name: "空间相册", exact: true });
  const first = section.getByRole("button", { name: `查看${homes[0].name}相册`, exact: true });
  await first.click();
  await expect(section.locator(".admin-album-card")).toHaveCount(60);
  await section.getByRole("button", { name: "加载更多照片", exact: true }).click();
  await expect(section.locator(".admin-album-card")).toHaveCount(63);
  await expect(section.getByRole("button", { name: "加载更多照片", exact: true })).toHaveCount(0);

  let delayedResponseFinished: Promise<void> | undefined;
  await page.route(`**/api/admin/albums/${homes[0].id}?*`, route => {
    delayedResponseFinished = (async () => {
      const response = await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 400));
      await route.fulfill({ response }).catch(() => { /* aborted by the space switch */ });
    })();
    return delayedResponseFinished;
  });
  await first.click();
  await expect.poll(() => Boolean(delayedResponseFinished)).toBe(true);
  await section.getByRole("button", { name: `查看${homes[1].name}相册`, exact: true }).click();
  await expect(section.locator(".admin-album-card")).toHaveCount(1);
  await delayedResponseFinished;
  await expect(section.locator(".admin-album-card")).toHaveCount(1);
  await expect(section.locator(".admin-album-card")).toContainText("切换空间照片");
  await checkNoOverflow(page);
});
