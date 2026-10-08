// Checks painted pixels as well as DOM geometry. Synthetic colour patches are
// test instrumentation only; no reference/vendor pixels enter the product.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import sharp from "sharp";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { northReplacementFixture } from "../fixtures/mahjong-view-game";
import { projectedSampleScript } from "./projected-samples";
import type { RoomView } from "../../src/modules/mahjong/types";

const css = [...readFileSync("src/app/mahjong/page.tsx", "utf8").matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)]
  .map(match => readFileSync(`src/app/mahjong/${match[1]}`, "utf8")).join("\n");
const bundle = await build({ stdin: { contents: `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { flushSync } from 'react-dom';
  import { GameRoom } from './src/components/mahjong/mahjong-client';
  const root = createRoot(document.getElementById('root'));
  window.cameraChoices = [];
  window.showCameraRoom = room => flushSync(() => root.render(
    React.createElement('main', {className:'mahjong-page'},
      React.createElement('div', {className:'mahjong-shell'},
        React.createElement(GameRoom, {room, ownSeat:room.mySeat, host:true,
          busy:false, connected:true, motionCanAnimate:false,
          onChoice:choice => window.cameraChoices.push(choice),
          onFinish:()=>{}, onLeave:()=>{}, onRematch:()=>{}})))));
`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false,
  platform: "browser", format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' } });
const output = `.local/audit/mahjong-camera-symmetry-${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
mkdirSync(output, { recursive: false });
const colours = [[250, 30, 190], [20, 230, 230], [20, 40, 250], [70, 250, 35]];
const sizes = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1440, height: 810 }];
const fixtures: RoomView[] = ["sanma", "yonma"].flatMap(variant => {
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
  return names.map((_, ownSeat) => ({ id: `paint-${variant}-${ownSeat}`, code: "ABCDEFGH", hostUserId: "0", variant: variant as "sanma" | "yonma", mode: "east", status: "playing", version: 1, mySeat: ownSeat,
    game: game.view(ownSeat), members: names.map((displayName, seat) => ({ userId: String(seat), displayName, seat, kind: "human", ready: true, connected: true })) }));
});
mkdirSync(".local/audit", { recursive: true });
const results: unknown[] = [], failures: string[] = [];
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const room of fixtures) for (const size of sizes) {
      const label = `${engine.name()} ${room.variant} seat=${room.mySeat} ${size.width}x${size.height}`;
      const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1,
        ...(engine === webkit ? { recordVideo: { dir: `${output}/video`, size: { width: size.width + size.width % 2, height: size.height + size.height % 2 } } } : {}) });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.route("https://mahjong.local/images/**", async route => {
        const pathname = new URL(route.request().url()).pathname;
        await route.fulfill({ status: 200, contentType: pathname.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync(`public${pathname}`) });
      });
      await page.route("https://mahjong.local/fonts/**", route => route.fulfill({contentType:"font/woff2",body:readFileSync("public"+new URL(route.request().url()).pathname)}));
      await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><div id="root"></div>`);
      await page.addScriptTag({ content: `globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};\n${bundle.outputFiles[0].text}` });
      assert.deepEqual(pageErrors, [], `${label}: browser bundle must initialize`);
      await page.evaluate(room => (window as any).showCameraRoom(room), room);
      if (process.env.CAMERA_PROBE_CSS) await page.addStyleTag({ content: process.env.CAMERA_PROBE_CSS });
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ content: `globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});\n${projectedSampleScript}` });
      assert.equal(await page.locator(".mahjong-table__own-public [data-seat]").getAttribute("data-seat"),String(room.mySeat));
      assert.equal(await page.getByTestId("mahjong-hand").locator("[data-tile-face]").count(),room.game!.hand.length);
      for(const player of room.game!.players)if(player.seat!==room.mySeat)assert.equal(await page.locator(`[data-motion-rack-seat="${player.seat}"] > i`).count(),player.handCount);
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
        // Measure z=0 contact baselines, not the axis-aligned bounding box
        // of raised backs. Both endpoints share the table camera and must
        // lie on the appropriate six-pixel-offset local floor line.
        const sample=(el:HTMLElement,points:number[][])=> (window as any).mahjongPhysicalSamples(el,points) as {x:number;y:number}[];
        const lane=document.querySelector<HTMLElement>(".mahjong-table__lane")!,laneQuad=sample(lane,[[0,0],[1,0],[1,1],[0,1]]);
        const seams={north:[laneQuad[0],laneQuad[1]],west:[laneQuad[0],laneQuad[3]],east:[laneQuad[1],laneQuad[2]]};
        const cw=width-left-parseFloat(style.borderRightWidth),ch=height-top-parseFloat(style.borderBottomWidth);
        const xy=(x:number,y:number)=>[(left+x)/width,(top+y)/height];
        const distance=(p:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number})=>Math.abs((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))/Math.hypot(b.x-a.x,b.y-a.y);
        const angle=(a:{x:number;y:number},b:{x:number;y:number})=>Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
        const racks=[...surface.querySelectorAll<HTMLElement>(".mahjong-opponent-rack")].map(rack=>{
          const position=rack.closest(".mahjong-table__position")!.className.match(/--(north|west|east)/)![1] as keyof typeof seams;
          const bodies=[...rack.querySelectorAll<HTMLElement>(".mahjong-standing-tile__body")],depth=parseFloat(getComputedStyle(bodies[0]).height);
          const feet=bodies.map(body=>sample(body,[[0,0],[1,0],[1,1],[0,1]]));
          const floor=(offset:number)=>position==='north'?sample(surface,[xy(cw*.2,ch*.09-offset),xy(cw*.8,ch*.09-offset)]):sample(surface,[xy(cw*(position==='west'?.12:.88)+(position==='west'?-offset:offset),ch*.2),xy(cw*(position==='west'?.12:.88)+(position==='west'?-offset:offset),ch*.8)]);
          const rear=floor(6),front=floor(6+depth),rearLine=[feet[0][0],feet.at(-1)![1]],frontLine=[feet[0][3],feet.at(-1)![2]];
          const a=angle(rearLine[0],rearLine[1]),b=angle(seams[position][0],seams[position][1]),diff=Math.abs(a-b)%180;
          return {seat:Number(rack.closest<HTMLElement>('[data-seat]')!.dataset.seat),position,count:bodies.length,depth,feet,rear,front,rearResiduals:rearLine.map(p=>distance(p,rear[0],rear[1])),frontResiduals:frontLine.map(p=>distance(p,front[0],front[1])),angleDifference:Math.min(diff,180-diff)};
        });
        return { quad, farWidth, nearWidth, patches, racks, transform: style.transform };
      }, colours);
      // WebKit Page.snapshotRect software-paints perspective incorrectly on this
      // host. Screencast/video uses an independent composited-frame path.
      await page.waitForTimeout(500);
      const stem = `${output}/${engine.name()}-${room.variant}-seat${room.mySeat}-${size.width}`;
      const snapshot = await page.screenshot({ path: `${stem}-snapshot.png` });
      assert.deepEqual(pageErrors, [], `${label}: mounted component must not throw`);
      assert.deepEqual(await page.evaluate(() => (window as any).cameraChoices), [], `${label}: rendering must not submit a choice`);
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
      const [tl, tr, br, bl] = measured.quad;
      const farCenter = (tl.x + tr.x) / 2, nearCenter = (bl.x + br.x) / 2;
      if (Math.abs(farCenter - nearCenter) > .5 || Math.abs(farCenter - size.width / 2) > .5) issues.push(`camera axis shifted: ${farCenter},${nearCenter}`);
      if (Math.abs(tl.y-tr.y) > .5 || Math.abs(bl.y-br.y) > .5) issues.push("table edges are tilted");
      if (!(bl.x < tl.x && br.x > tr.x)) issues.push("table sides must diverge symmetrically toward the viewer");
      for (const [index, point] of measured.quad.entries()) if (point.x < 2 || point.x > size.width - 2 || point.y < 2 || point.y > size.height - 2) issues.push(`table corner ${index} outside visible viewport: ${point.x},${point.y}`);
      if (measured.nearWidth < measured.farWidth * 1.1) issues.push(`flat camera: near/far=${measured.nearWidth/measured.farWidth}`);
      for(const rack of measured.racks) {
        if(rack.angleDifference>.4)issues.push(`seat${rack.seat} ${rack.position} rack/line angle ${rack.angleDifference}`);
        if([...rack.rearResiduals,...rack.frontResiduals].some(d=>d>.6))issues.push(`seat${rack.seat} ${rack.position} feet miss floor: ${JSON.stringify([rack.rearResiduals,rack.frontResiduals])}`);
      }
      for (const sample of samples) if (!sample.centreMatches || sample.count < 50 || sample.centroidError > (video ? 2 : 1.5) || (!video && sample.error > 10)) issues.push(`patch${sample.index}: DOM centre ${sample.x},${sample.y} paints ${sample.actual} instead of ${sample.expected}; component=${sample.count}, centroid error=${sample.centroidError.toFixed(3)}px`);
      results.push({ label, size, rendering: "React createRoot mounted GameRoom", pageErrors, capture: video ? "Screencast compositor video frame" : "Page screenshot", videoPath, ...measured, samples, issues });
      if (issues.length) { failures.push(`${label}: ${issues.join("; ")}`); console.log(`FAIL ${failures.at(-1)}`); }
      else console.log(`PASS ${label}: rack floor/seam alignment, projective depth and 4 DOM/paint centre samples agree`);
    }
  } finally { await browser.close(); }
}
writeFileSync(`${output}/summary.json`, JSON.stringify({ probeCss: process.env.CAMERA_PROBE_CSS ?? null, baseHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), rendering: "React createRoot mounted GameRoom", bundleSha256: createHash("sha256").update(bundle.outputFiles[0].text).digest("hex"), clientSha256: createHash("sha256").update(readFileSync("src/components/mahjong/mahjong-client.tsx")).digest("hex"), testSha256: createHash("sha256").update(readFileSync("tests/browser/mahjong-camera-symmetry-20261007.tsx")).digest("hex"), cssSha256: createHash("sha256").update(css).digest("hex"), results, failures }, null, 2)+"\n");
assert.deepEqual(failures, [], "projected DOM geometry must be symmetric, fit the viewport, and agree with composited pixels in both engines");
console.log(`PASS ${results.length} real-engine scenes from every seat with ${results.length*4} paint checks; full tabletop fits symmetrically in ${output}`);
