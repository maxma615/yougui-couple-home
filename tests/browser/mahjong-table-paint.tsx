// Checks painted pixels as well as DOM geometry. Synthetic colour patches are
// test instrumentation only; no reference/vendor pixels enter the product.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, webkit } from "@playwright/test";
import sharp from "sharp";
import { GameRoom } from "../../src/components/mahjong/mahjong-client";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { northReplacementFixture } from "../fixtures/mahjong-view-game";
import { projectedSampleScript } from "./projected-samples";
import type { RoomView } from "../../src/modules/mahjong/types";

const css = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css", "mahjong-table-center.css", "mahjong-table-edge.css", "mahjong-camera.css"]
  .map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");
const forcePerspective = process.argv.includes("--probe-perspective");
const colours = [[250, 30, 190], [20, 230, 230], [20, 40, 250], [70, 250, 35]];
const sizes = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1440, height: 810 }];
const fixtures: RoomView[] = ["sanma", "yonma"].map(variant => {
  const names = variant === "sanma" ? ["A", "B", "C"] : ["A", "B", "C", "D"];
  const game = variant === "sanma" ? northReplacementFixture() : new RiichiGame("east", names);
  if (variant === "sanma") {
    const initial = game.view(0), choice = initial.choices.find(item => item.type === "nuki");
    assert.ok(choice); game.respond(0, initial.decisionId, choice.id);
    for (let seat = 1; seat < 3; seat++) {
      const view = game.view(seat), pass = view.choices.find(item => item.type === "pass");
      if (pass) game.respond(seat, view.decisionId, pass.id);
    }
    assert.equal(game.view(0).players[0].nuki, 1);
  }
  return { id: `paint-${variant}`, code: "ABCDEFGH", hostUserId: "0", variant: variant as "sanma" | "yonma", mode: "east", status: "playing", version: 1, mySeat: 0,
    game: game.view(0), members: names.map((displayName, seat) => ({ userId: String(seat), displayName, seat, kind: "human", ready: true, connected: true })) };
});
mkdirSync(".local/audit", { recursive: true });
const results: unknown[] = [], failures: string[] = [];
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const room of fixtures) for (const size of sizes) {
      const label = `${engine.name()} ${room.variant} ${size.width}x${size.height}`;
      const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1,
        ...(engine === webkit ? { recordVideo: { dir: ".local/audit/table-paint-video", size: { width: size.width + size.width % 2, height: size.height + size.height % 2 } } } : {}) });
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.route("https://mahjong.local/images/**", async route => {
        const pathname = new URL(route.request().url()).pathname;
        await route.fulfill({ status: 200, contentType: pathname.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync(`public${pathname}`) });
      });
      const noop = () => {};
      const html = renderToStaticMarkup(<GameRoom room={room} ownSeat={0} host busy={false} connected onChoice={noop} onFinish={noop} onLeave={noop} onRematch={noop}/>);
      await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><main class="mahjong-page"><div class="mahjong-shell">${html}</div></main>`);
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
      await page.addScriptTag({ content: projectedSampleScript });
      if (forcePerspective) {
        await page.addStyleTag({ content: ".mahjong-page .mahjong-game .mahjong-table__surface{transform:perspective(150cqh) rotateX(28deg) scaleX(.94)!important;transition:none!important}" });
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      }
      const measured = await page.evaluate(colours => {
        const surface = document.querySelector<HTMLElement>(".mahjong-table__surface")!;
        const style = getComputedStyle(surface), left = parseFloat(style.borderLeftWidth), top = parseFloat(style.borderTopWidth);
        const width = parseFloat(style.width), height = parseFloat(style.height);
        const quad = (window as any).mahjongPhysicalSamples(surface, [[0,0],[1,0],[1,1],[0,1]]) as { x:number; y:number }[];
        const positions = [[.25,.29],[.75,.29],[.25,.64],[.75,.64]];
        const patches = positions.map(([u,v], index) => {
          const patch = document.createElement("span"); patch.dataset.paintPatch = String(index);
          patch.style.cssText = `position:absolute!important;left:${width*u-left-8}px!important;top:${height*v-top-8}px!important;width:16px!important;height:16px!important;background:rgb(${colours[index].join(",")})!important;border:0!important;border-radius:0!important;padding:0!important;margin:0!important;box-shadow:none!important;opacity:1!important;filter:none!important;z-index:10000!important;pointer-events:none!important;transition:none!important;animation:none!important;`;
          surface.append(patch);
          const point = (window as any).mahjongPhysicalSamples(patch, [[.5,.5]])[0];
          return { ...point, colour: colours[index], index };
        });
        const farWidth = Math.hypot(quad[1].x-quad[0].x, quad[1].y-quad[0].y);
        const nearWidth = Math.hypot(quad[2].x-quad[3].x, quad[2].y-quad[3].y);
        return { quad, farWidth, nearWidth, patches, transform: style.transform };
      }, colours);
      // WebKit Page.snapshotRect software-paints perspective incorrectly on this
      // host. Screencast/video uses an independent composited-frame path.
      await page.waitForTimeout(500);
      const stem = `.local/audit/table-paint-${forcePerspective ? "probe-" : ""}${engine.name()}-${room.variant}-${size.width}`;
      const snapshot = await page.screenshot({ path: `${stem}-snapshot.png` });
      const video = page.video();
      await context.close();
      let shot = snapshot, videoPath: string | null = null;
      if (video) {
        videoPath = await video.path();
        execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-sseof", "-0.05", "-i", videoPath, "-frames:v", "1", "-y", `${stem}.png`]);
        shot = readFileSync(`${stem}.png`);
      } else writeFileSync(`${stem}.png`, shot);
      const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, size.width + (video ? size.width % 2 : 0)); assert.equal(info.height, size.height + (video ? size.height % 2 : 0));
      const samples = measured.patches.map(point => {
        const x = Math.round(point.x), y = Math.round(point.y);
        assert.ok(x >= 0 && y >= 0 && x < info.width && y < info.height, `${label}: patch sample inside frame`);
        const offset = (y * info.width + x) * info.channels;
        const actual = Array.from(data.subarray(offset, offset+3));
        const matches = (r: number, g: number, b: number) => point.index === 0 ? r>170 && g<120 && b>120
          : point.index === 1 ? r<160 && g>170 && b>170 : point.index === 2 ? r<120 && g<140 && b>170 : r<170 && g>190 && b<130;
        let sx=0, sy=0, count=0;
        // Find only the colour component containing the measured centre.
        // Public tile glyphs can share a hue and must not contaminate its centroid.
        const pending = [[x,y]], visited = new Set<number>();
        while (pending.length) {
          const [px,py] = pending.pop()!;
          if (px<0 || py<0 || px>=info.width || py>=info.height || Math.abs(px-x)>50 || Math.abs(py-y)>50) continue;
          const key=py*info.width+px; if (visited.has(key)) continue; visited.add(key);
          const pos=key*info.channels;
          if (!matches(data[pos],data[pos+1],data[pos+2])) continue;
          sx+=px; sy+=py; count++;
          pending.push([px-1,py],[px+1,py],[px,py-1],[px,py+1]);
        }
        const centroid = count ? {x:sx/count,y:sy/count} : null;
        // VP8 chroma subsampling can move the hue mask by up to two CSS pixels.
        const centroidError = centroid ? Math.hypot(centroid.x-point.x,centroid.y-point.y) : Infinity;
        return { index: point.index, x, y, expected: point.colour, actual, count, centroid, centroidError,
          centreMatches: matches(actual[0],actual[1],actual[2]), error: Math.max(...actual.map((value,index) => Math.abs(value-point.colour[index]))) };
      });
      const issues: string[] = [];
      if (measured.nearWidth < measured.farWidth * 1.1) issues.push(`flat camera: near/far=${measured.nearWidth/measured.farWidth}`);
      for (const sample of samples) if (!sample.centreMatches || sample.count < 50 || sample.centroidError > (video ? 2 : 1.5) || (!video && sample.error > 10)) issues.push(`patch${sample.index}: DOM centre ${sample.x},${sample.y} paints ${sample.actual} instead of ${sample.expected}; component=${sample.count}, centroid error=${sample.centroidError.toFixed(3)}px`);
      results.push({ label, size, capture: video ? "Screencast compositor video frame" : "Page screenshot", videoPath, ...measured, samples, issues });
      if (issues.length) { failures.push(`${label}: ${issues.join("; ")}`); console.log(`FAIL ${failures.at(-1)}`); }
      else console.log(`PASS ${label}: projective depth and 4 DOM/paint centre samples agree`);
    }
  } finally { await browser.close(); }
}
writeFileSync(`.local/audit/mahjong-table-paint-${forcePerspective ? "probe" : "actual"}.json`, JSON.stringify({ forcePerspective, cssSha256: createHash("sha256").update(css).digest("hex"), results, failures }, null, 2)+"\n");
assert.deepEqual(failures, [], "projected DOM geometry must agree with actual painted pixels in both engines");
console.log(`PASS ${results.length} real-engine scenes with ${results.length*4} paint checks`);
