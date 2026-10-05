import { expect, test } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { addSession, pairedFixture, mutationHeaders, checkNoOverflow } from "./fixtures";

// Fixture photos are original generated art. They are uploaded to the isolated test
// database and attachment directory; no example records enter the user's space.
test("真实照片封面切换、私密内容路由与减少动态下的视觉验收", async ({ browser, page }, testInfo) => {
  const pair = await pairedFixture(browser);
  await addSession(page.context(), pair.a.id);
  try {
    const request = page.context().request;
    const create = async (route: string, data: object) => {
      const response = await request.post(`/api/${route}`, { headers: mutationHeaders(), data });
      expect(response.ok()).toBe(true);
      return await response.json() as { id: string; version: number };
    };
    const photos = await readFile("public/art/yougui-night-arch-v1.webp");
    const memories = [];
    for (const [index,title] of ["晚风与我们", "一起走过的路", "把这一刻收藏"].entries()) {
      const moment = await create("moments", { title, date: `2026-10-0${index+1}`, body:"普通的一天，也值得好好收藏。" });
      const upload = await request.post(`/api/moments/${moment.id}/photos`, { headers: { Origin: process.env.E2E_ORIGIN! }, multipart: {file:{name:"original-scene.webp",mimeType:"image/webp",buffer:photos},version:String(moment.version)} });
      expect(upload.ok(), await upload.text()).toBe(true);
      memories.push(moment);
    }
    await create("anniversaries", {title:"下一次，一起旅行",date:"2026-12-20",yearly:true,note:"给未来留一份期待。"});
    await create("todos", {title:"选一张照片，印出来", description:"把喜欢的瞬间放在桌边。",assigneeId:null,dueDate:null,completed:false});
    await create("calendar", {title:"周末一起散步",allDay:true,start:"2026-10-10",end:"2026-10-10",location:"沿着河边",description:"留一点时间给我们。"});
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.goto("/home");
    const chosen = page.getByRole("button", {name:"查看封面：晚风与我们"});
    await expect(chosen).toBeVisible();
    await chosen.click();
    await expect(page.getByRole("link", {name:"打开回忆：晚风与我们"})).toHaveAttribute("href", `/moments/${memories[0].id}`);
    await expect(page.locator(".space-scene__art")).toHaveCSS("animation-name", "none");
    await mkdir("docs/screenshots",{recursive:true});
    for (const route of ["home","moments","calendar","anniversaries","todos","settings"]) {
      if (route !== "home") await page.goto(`/${route}`);
      await expect(page.getByRole("heading",{level:1})).toBeVisible();
      await expect(page.locator(".state-card")).toHaveCount(0);
      await checkNoOverflow(page);
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:`docs/screenshots/cinematic-${route}-${testInfo.project.name}.png`,fullPage:testInfo.project.name === "chromium",animations:"disabled"});
    }
    await page.goto(`/moments/${memories[0].id}`);
    await expect(page.getByRole("heading",{level:1,name:"晚风与我们"})).toBeVisible();
    await page.screenshot({path:`docs/screenshots/cinematic-moment-detail-${testInfo.project.name}.png`,fullPage:testInfo.project.name === "chromium",animations:"disabled"});
    await page.goto("/settings");
    await page.getByRole("button",{name:"修改密码",exact:true}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({path:`docs/screenshots/cinematic-password-${testInfo.project.name}.png`,fullPage:testInfo.project.name === "chromium",animations:"disabled"});
  } finally {
    await pair.cleanup();
  }
});
