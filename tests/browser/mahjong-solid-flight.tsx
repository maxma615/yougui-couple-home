// Pause the actual discard animations at each endpoint and at 50%. This keeps
// midpoint thickness evidence tied to rendered Chromium/WebKit pixels.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { build } from "esbuild";
import sharp from "sharp";
import { chromium, webkit, type Page } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { GameVariant, RoomView } from "../../src/modules/mahjong/types";
import { projectedSampleScript } from "./projected-samples";

type Scenario = "red-five" | "tsumogiri" | "riichi";
const encodedTiles = (value: string) => [...value.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(number => match[1] + number));

function scene(variant: GameVariant, actor: number, scenario: Scenario) {
  const capacity = variant === "sanma" ? 3 : 4;
  const hand = scenario === "riichi" ? "p123456789s123z2"
    : scenario === "red-five" ? "p0123456789s12z1"
    : "p112233s456789z1";
  const draw = scenario === "riichi" ? "z3" : "z7";
  const allocate = (available: string[]) => {
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `physical fixture missing ${tile}`);
      return available.splice(index, 1)[0];
    };
    const hands = Array.from({ length: capacity }, () => [] as string[]);
    hands[actor] = encodedTiles(hand).map(take);
    take(draw);
    for (let seat = 0; seat < capacity; seat++) if (seat !== actor) hands[seat] = available.splice(0, 13);
    return Array.from({ length: capacity }, (_, wind) => hands[(actor + wind) % capacity]).flat();
  };
  const game = variant === "sanma"
    ? new SanmaGame("east", ["玩家", "电脑甲", "电脑乙"], { dealer: actor, wallFactory: () => {
      const available = sanmaTiles(), dealt = allocate(available);
      const reserve = available.splice(0, 4), indicators = available.splice(0, 10);
      return new SanmaWall([...dealt, draw, ...available, ...reserve, ...indicators]);
    } })
    : new RiichiGame("east", ["玩家", "电脑甲", "电脑乙", "电脑丙"], { dealer: actor, wallFactory: rule => {
      const wall = new Majiang.Shan(rule), available = wall._pai.slice(), dealt = allocate(available);
      wall._pai = [...available, ...[...dealt, draw].reverse()];
      wall._baopai = [wall._pai[4]]; wall._fubaopai = [wall._pai[9]]; return wall;
    } });

  const beforeGame = game.view(0);
  const acting = game.view(actor);
  const choiceType = scenario === "riichi" ? "riichi" : "discard";
  const choiceValue = scenario === "red-five" ? "p0"
    : scenario === "tsumogiri" ? `${draw}_`
    : scenario === "riichi" ? `${draw}_` : "p1";
  const choice = acting.choices.find(candidate => candidate.type === choiceType && candidate.value === choiceValue);
  assert.ok(choice, `real ${variant} engine must offer ${choiceType}:${choiceValue} to seat ${actor}`);
  game.respond(actor, acting.decisionId, choice.id);
  const room: RoomView = {
    id: `solid-${variant}-${actor}-${scenario}`, code: "ABCDEFGH", hostUserId: "display-user-0", variant,
    mode: "east", status: "playing", version: 1, mySeat: 0, game: beforeGame,
    members: Array.from({ length: capacity }, (_, seat) => ({ userId: `display-user-${seat}`, seat,
      displayName: seat === 0 ? "玩家" : `电脑${seat}`, kind: seat === 0 ? "human" : "bot", ready: true, connected: true })),
  };
  return { room, after: { ...room, version: 2, game: game.view(0) } };
}

const harness = `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
import {GameRoom} from './src/components/mahjong/mahjong-client';
let setRoom; window.solidFlightApi={};
function Scene(){const [room,roomSetter]=useState(window.solidFlightFixture.room);setRoom=roomSetter;return React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,host:true,busy:false,ownSeat:0,connected:true,motionCanAnimate:true,onChoice:()=>{},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))}
const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(React.createElement(Scene)));window.solidFlightApi.dispose=()=>root.unmount();window.solidFlightApi.update=room=>flushSync(()=>setRoom(room));`;
const bundle = await build({ stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" }, bundle: true,
  platform: "browser", format: "iife", write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
const css = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css",
  "mahjong-table-center.css", "mahjong-table-edge.css", "mahjong-camera.css", "mahjong-call-announcement.css", "mahjong-standing-tile.css"]
  .map(file => readFileSync(path.join("src/app/mahjong", file), "utf8")).join("\n");
const script = "globalThis.__name=(target,value)=>Object.defineProperty(target,\"name\",{value,configurable:true});globalThis.process={env:{NODE_ENV:\"development\"}};\n" + bundle.outputFiles[0].text;
const evidenceDir = ".local/audit";
mkdirSync(evidenceDir, { recursive: true });

async function mount(page: Page, fixture: ReturnType<typeof scene>, width: number) {
  await page.evaluate(() => (window as any).solidFlightApi?.dispose?.());
  await page.goto("about:blank");
  await page.setViewportSize({ width, height: width === 667 ? 375 : width === 844 ? 390 : 810 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*{box-sizing:border-box}${css}</style><div id="root"></div>`);
  await page.evaluate(value => { (window as any).solidFlightFixture = value; }, fixture);
  await page.addScriptTag({ content: script });
  await page.addScriptTag({ content: projectedSampleScript });
  await page.getByTestId("mahjong-board").waitFor({ state: "visible", timeout: 2000 });
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300));
  await page.waitForTimeout(260);
  assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "the initial public snapshot must not replay a discard");
}

async function sampleFlight(page: Page, actor: number, scenario: Scenario) {
  return page.evaluate(async ({ actor, scenario }) => {
    const sourceDrawn = scenario === "riichi" || scenario === "tsumogiri";
    const sourceTile = [...document.querySelectorAll<HTMLElement>(`[data-motion-rack-seat="${actor}"] > i`)]
      .filter(tile => sourceDrawn === (tile.dataset.motionDrawn === "true"))
      .at(-1);
    const sourceBack = sourceTile?.querySelector<HTMLElement>("[data-motion-surface]");
    if (!sourceBack) throw new Error("the previous public back tile must be present before acceptance");
    const material = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return { backgroundColor:style.backgroundColor, borderTopColor:style.borderTopColor,
        borderTopWidth:style.borderTopWidth, borderRadius:style.borderTopLeftRadius };
    };
    const sourceBackMaterial = material(sourceBack);
    const sourceCorners = (window as any).mahjongPhysicalSamples(sourceBack, [[0,0],[1,0],[1,1],[0,1]]);
    const fixture = (window as any).solidFlightFixture;
    (window as any).solidFlightApi.update(fixture.after);
    let flight: HTMLElement | null = null, card: HTMLElement | null = null, movement: Animation | null = null, flip: Animation | null = null;
    for (let frame = 0; frame < 12; frame++) {
      await new Promise(requestAnimationFrame);
      flight = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]');
      card = flight?.querySelector<HTMLElement>(".mahjong-discard-flight__card") ?? null;
      movement = flight?.getAnimations().find(animation => animation.effect?.target === flight) ?? null;
      flip = card?.getAnimations().find(animation => animation.effect?.target === card) ?? null;
      if (flight && card && movement && flip) break;
    }
    if (!flight || !card || !movement || !flip) throw new Error("expected both finite browser animations");
    movement.pause(); flip.pause();
    const duration = Number(movement.effect!.getComputedTiming().duration);
    const corners = (element: HTMLElement) => (window as any).mahjongPhysicalSamples(element, [[0,0],[1,0],[1,1],[0,1]]) as {x:number;y:number}[];
    const box = (element: Element) => { const rect = element.getBoundingClientRect(); return { x:rect.x,y:rect.y,width:rect.width,height:rect.height }; };
    const targetEvent = [...document.querySelectorAll<HTMLElement>("[data-discard-event-id]")].find(element => element.dataset.discardEventId === flight!.dataset.motionEvent);
    const targetFace = targetEvent?.querySelector<HTMLElement>("[data-tile-face]");
    const back = flight.querySelector<HTMLElement>('[data-flight-face="back"]') ?? flight.querySelector<HTMLElement>(".mahjong-discard-flight__back");
    const front = flight.querySelector<HTMLElement>('[data-flight-face="front"]') ?? flight.querySelector<HTMLElement>(".mahjong-discard-flight__face");
    if (!targetEvent || !targetFace || !back || !front) throw new Error("flight must retain the public discard and both tile planes");
    const frontPaint = front.querySelector<HTMLElement>(".mahjong-discard-flight__face") ?? front;
    const frontTile = front.querySelector<HTMLElement>("[data-tile-face]");
    const backMaterial = material(back);
    movement.currentTime = 0; flip.currentTime = 0; await new Promise(requestAnimationFrame);
    const sourceError = Math.max(...corners(back).map((point,index) => Math.hypot(point.x-sourceCorners[index].x,point.y-sourceCorners[index].y)));
    movement.currentTime = duration * .5; flip.currentTime = duration * .5; await new Promise(requestAnimationFrame);
    const middle = box(card);
    const middleSides = [...flight.querySelectorAll<HTMLElement>("[data-flight-side]")]
      .map(element => {
        const rect = box(element), style = getComputedStyle(element);
        return { face:element.dataset.flightSide, ...rect, background:style.backgroundColor,
          backface:style.backfaceVisibility, visibility:style.visibility, opacity:style.opacity,
          hit:document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.className ?? null };
      });
    const middleTransform = getComputedStyle(card).transform;
    const screenshotTarget = flight.dataset.motionEvent;
    movement.currentTime = duration - .01; flip.currentTime = duration - .01; await new Promise(requestAnimationFrame);
    const targetError = Math.max(...corners(front).map((point,index) => Math.hypot(point.x-corners(targetFace)[index].x,point.y-corners(targetFace)[index].y)));
    const result = {
      sourceError, targetError, middle, cardPaintFaceCount: flight.querySelectorAll("[data-flight-face]").length,
      sideFaces: middleSides,
      scenario, eventTile: targetEvent.dataset.tile, eventClasses: targetEvent.className,
      hiddenTarget: getComputedStyle(targetFace).opacity === "0" || getComputedStyle(targetEvent).opacity === "0",
      flightVisibility:getComputedStyle(flight).visibility, flightOpacity:getComputedStyle(flight).opacity, flightDisplay:getComputedStyle(flight).display,
      sourceTileText: sourceTile?.textContent ?? "", flightLabel: flight.getAttribute("aria-label"), duration, screenshotTarget,
      flightDepth: getComputedStyle(flight).getPropertyValue("--flight-depth"), cardTransform:middleTransform,
      backMaterial, sourceBackMaterial, frontTile:frontTile?.dataset.tileFace ?? null,
      targetTile:targetFace.dataset.tileFace,
      frontMaterial: { backgroundImage:getComputedStyle(frontPaint).backgroundImage, borderColor:getComputedStyle(frontPaint).borderColor,
        borderRadius:getComputedStyle(frontPaint).borderRadius, padding:getComputedStyle(frontPaint).padding },
      targetMaterial: { backgroundImage:getComputedStyle(targetFace).backgroundImage, borderColor:getComputedStyle(targetFace).borderColor,
        borderRadius:getComputedStyle(targetFace).borderRadius, padding:getComputedStyle(targetFace).padding },
    };
    movement.currentTime = duration * .5; flip.currentTime = duration * .5; await new Promise(requestAnimationFrame);
    return result;
  }, { actor, scenario });
}

async function changedPixelsWithFlight(page: Page) {
  await page.evaluate(async () => {
    document.getAnimations().forEach(animation => animation.pause());
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const visible = await page.screenshot();
  await page.evaluate(() => { const flight = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]'); if (!flight) throw new Error("missing midpoint flight"); flight.style.visibility = "hidden"; });
  const hidden = await page.screenshot();
  await page.evaluate(() => { const flight = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]'); if (flight) flight.style.removeProperty("visibility"); });
  const first = await sharp(visible).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const second = await sharp(hidden).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(first.info.width, second.info.width);
  const mid = await page.evaluate(() => {
    const rect = document.querySelector<HTMLElement>(".mahjong-discard-flight__card")!.getBoundingClientRect();
    return { x:rect.x+rect.width/2,y:rect.y+rect.height/2,radiusX:Math.max(22,rect.width/2+22),radiusY:Math.max(22,rect.height/2+22) };
  });
  let pixels = 0, fullPixels = 0;
  let minX = first.info.width, minY = first.info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < first.info.height; y++) for (let x = 0; x < first.info.width; x++) {
    const index = (y * first.info.width + x) * first.info.channels;
    const delta = Math.abs(first.data[index] - second.data[index]) + Math.abs(first.data[index + 1] - second.data[index + 1]) + Math.abs(first.data[index + 2] - second.data[index + 2]);
    if (delta > 28) { fullPixels++; minX = Math.min(minX,x); maxX = Math.max(maxX,x); minY = Math.min(minY,y); maxY = Math.max(maxY,y); }
  }
  for (let y = Math.max(0, Math.floor(mid.y-mid.radiusY)); y < Math.min(first.info.height, Math.ceil(mid.y+mid.radiusY)); y++) {
    for (let x = Math.max(0, Math.floor(mid.x-mid.radiusX)); x < Math.min(first.info.width, Math.ceil(mid.x+mid.radiusX)); x++) {
      const index = (y * first.info.width + x) * first.info.channels;
      if (Math.abs(first.data[index] - second.data[index]) + Math.abs(first.data[index + 1] - second.data[index + 1]) + Math.abs(first.data[index + 2] - second.data[index + 2]) > 28) pixels++;
    }
  }
  await page.evaluate(() => {
    const sentinel = document.createElement("div");
    sentinel.dataset.screenshotSentinel = "true";
    sentinel.style.cssText = "position:fixed;left:3px;top:3px;width:9px;height:9px;background:#ff00ff;z-index:99999;pointer-events:none";
    document.body.append(sentinel);
  });
  const sentinelVisible = await page.screenshot();
  await page.evaluate(async () => {
    document.querySelector("[data-screenshot-sentinel]")?.remove();
    await new Promise(requestAnimationFrame);
  });
  const sentinelHidden = await page.screenshot();
  const sentinelRaw = await sharp(sentinelVisible).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const noSentinelRaw = await sharp(sentinelHidden).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sentinelPixels = 0;
  for (let index = 0; index < sentinelRaw.data.length; index += 3) {
    if (Math.abs(sentinelRaw.data[index] - noSentinelRaw.data[index]) + Math.abs(sentinelRaw.data[index + 1] - noSentinelRaw.data[index + 1]) + Math.abs(sentinelRaw.data[index + 2] - noSentinelRaw.data[index + 2]) > 28) sentinelPixels++;
  }
  return { pixels, fullPixels, diffBounds:fullPixels ? {minX,minY,maxX,maxY} : null, sentinelPixels, visible, hidden };
}

async function captureVideoPaint(page: Page) {
  const bounds = await page.evaluate(async () => {
    const flight = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]');
    if (!flight) throw new Error("missing midpoint flight for compositor recording");
    document.getAnimations().forEach(animation => animation.pause());
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const sideRects = [...flight.querySelectorAll<HTMLElement>("[data-flight-side]")].map(element => element.getBoundingClientRect());
    if (!sideRects.length) throw new Error("the midpoint cuboid must expose its four real side planes");
    const minX = Math.min(...sideRects.map(rect => rect.left)), minY = Math.min(...sideRects.map(rect => rect.top));
    const maxX = Math.max(...sideRects.map(rect => rect.right)), maxY = Math.max(...sideRects.map(rect => rect.bottom));
    const marker = document.createElement("div");
    marker.dataset.videoState = "visible";
    marker.style.cssText = "position:fixed;left:0;top:0;width:14px;height:14px;z-index:2147483647;pointer-events:none;background:#00ff00";
    document.body.append(marker);
    const wait = () => new Promise(resolve => setTimeout(resolve, 260));
    const state = async (visible: boolean) => {
      flight.style.visibility = visible ? "visible" : "hidden";
      marker.dataset.videoState = visible ? "visible" : "hidden";
      marker.style.background = visible ? "#00ff00" : "#ff00ff";
      await wait();
    };
    await state(true);
    await state(false);
    await state(true);
    return { left:Math.max(0,Math.floor(minX-2)), top:Math.max(0,Math.floor(minY-2)),
      width:Math.ceil(maxX-minX+4), height:Math.ceil(maxY-minY+4) };
  });
  return bounds;
}

async function analyzeVideoPaint(videoPath: string, bounds: { left:number; top:number; width:number; height:number }) {
  const captureId = Date.now();
  const framePattern = `${evidenceDir}/mahjong-solid-flight-webkit-compositor-${captureId}-%04d.png`;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", videoPath, "-fps_mode", "passthrough", framePattern]);
  const framePrefix = `mahjong-solid-flight-webkit-compositor-${captureId}-`;
  const frames = readdirSync(evidenceDir).filter(file => file.startsWith(framePrefix) && file.endsWith(".png")).sort();
  const stateFrames: { file:string; state:"visible"|"hidden"; index:number }[] = [];
  for (let index = 0; index < frames.length; index++) {
    const file = frames[index];
    const { data } = await sharp(path.join(evidenceDir,file)).extract({ left:3, top:3, width:8, height:8 }).removeAlpha().raw().toBuffer({ resolveWithObject:true });
    let red = 0, green = 0, blue = 0;
    for (let pixel = 0; pixel < data.length; pixel += 3) { red += data[pixel]; green += data[pixel+1]; blue += data[pixel+2]; }
    red /= 64; green /= 64; blue /= 64;
    if (green > red * 1.5 && green > blue * 1.5) stateFrames.push({ file, state:"visible", index });
    if (red > green * 1.5 && blue > green * 1.5) stateFrames.push({ file, state:"hidden", index });
  }
  const triples = stateFrames.filter(frame => frame.state === "hidden").flatMap(hidden => {
    const before = stateFrames.filter(frame => frame.state === "visible" && frame.index < hidden.index).at(-1);
    const after = stateFrames.find(frame => frame.state === "visible" && frame.index > hidden.index);
    return before && after ? [{ before, hidden, after, nearestGap:Math.min(hidden.index-before.index,after.index-hidden.index) }] : [];
  }).sort((a,b) => a.nearestGap-b.nearestGap);
  const selected = triples[0];
  assert.ok(selected, `recorded WebKit video must include adjacent visible/hidden/visible midpoint frames (${JSON.stringify(stateFrames)})`);
  const { before:visibleBefore, hidden, after:visibleAfter } = selected;
  const metadata = await sharp(path.join(evidenceDir, visibleBefore.file)).metadata();
  const left = Math.max(0,bounds.left), top = Math.max(0,bounds.top);
  const width = Math.min(metadata.width! - left,bounds.width);
  const height = Math.min(metadata.height! - top,bounds.height);
  const crop = { left, top, width, height };
  const a = await sharp(path.join(evidenceDir, visibleBefore.file)).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject:true });
  const b = await sharp(path.join(evidenceDir, hidden.file)).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject:true });
  let paintedPixels = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    if (Math.abs(a.data[i]-b.data[i]) + Math.abs(a.data[i+1]-b.data[i+1]) + Math.abs(a.data[i+2]-b.data[i+2]) > 28) {
      paintedPixels++; minX = Math.min(minX,x); minY = Math.min(minY,y); maxX = Math.max(maxX,x); maxY = Math.max(maxY,y);
    }
  }
  const visiblePath = `${evidenceDir}/mahjong-solid-flight-webkit-midpoint-visible.png`;
  const hiddenPath = `${evidenceDir}/mahjong-solid-flight-webkit-midpoint-hidden.png`;
  const afterPath = `${evidenceDir}/mahjong-solid-flight-webkit-midpoint-visible-after.png`;
  renameSync(path.join(evidenceDir, visibleBefore.file), visiblePath);
  renameSync(path.join(evidenceDir, hidden.file), hiddenPath);
  renameSync(path.join(evidenceDir, visibleAfter.file), afterPath);
  for (const file of frames) {
    if (![visibleBefore.file, hidden.file, visibleAfter.file].includes(file)) unlinkSync(path.join(evidenceDir,file));
  }
  assert.ok(paintedPixels > 100, `the WebKit compositor frame must paint the solid flight, got ${paintedPixels} changed pixels`);
  const diffBounds = { left:left+minX, top:top+minY, right:left+maxX, bottom:top+maxY };
  assert.ok(diffBounds.right-diffBounds.left+1 >= 20 && diffBounds.right-diffBounds.left+1 <= 40,
    `the compositor contribution must span the tile long edge: ${JSON.stringify(diffBounds)}`);
  assert.ok(diffBounds.bottom-diffBounds.top+1 >= 5 && diffBounds.bottom-diffBounds.top+1 <= 14,
    `the compositor contribution must show physical thickness: ${JSON.stringify(diffBounds)}`);
  const result = { framePattern, frameCount:frames.length, visibleFrame:visiblePath, hiddenFrame:hiddenPath, visibleFrameAfter:afterPath,
    paintedPixels, crop, diffBounds, selectedFrames:{ visibleBefore:visibleBefore.index, hidden:hidden.index, visibleAfter:visibleAfter.index,
      nearestGap:selected.nearestGap } };
  writeFileSync(`${evidenceDir}/mahjong-solid-flight-webkit-compositor.json`, JSON.stringify({ videoPath, ...result }, null, 2) + "\n");
  return result;
}

const probeOnly = process.argv.includes("--probe");
const videoProbe = process.argv.includes("--video-probe");
const variants: GameVariant[] = probeOnly || videoProbe ? ["sanma"] : ["sanma", "yonma"];
const widths = probeOnly || videoProbe ? [844] : [667, 844, 1440];
const scenarios: Scenario[] = probeOnly || videoProbe ? ["tsumogiri"] : ["red-five", "tsumogiri", "riichi"];
const rows: Record<string, unknown>[] = [];
  for (const engine of videoProbe ? [webkit] : [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
    const context = videoProbe ? await browser.newContext({
      viewport:{ width:844, height:390 }, deviceScaleFactor:1,
      recordVideo:{ dir:evidenceDir, size:{ width:844, height:390 } },
    }) : null;
    const page = context ? await context.newPage() : await browser.newPage({ deviceScaleFactor: 1 });
    const video = videoProbe ? page.video() : null;
    page.on("pageerror", error => console.error("BROWSER_RUNTIME", error.message));
    await page.route("https://mahjong.local/images/**", route => {
      const file = new URL(route.request().url()).pathname;
      return route.fulfill({ status: 200, contentType: file.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync("public" + file) });
    });
    let compositorBounds: { x:number; y:number; radiusX:number; radiusY:number } | null = null;
    for (const variant of variants) {
      const actors = probeOnly || videoProbe ? [2] : Array.from({ length: variant === "sanma" ? 3 : 4 }, (_, seat) => seat).filter(seat => seat !== 0);
      for (const width of widths) for (const actor of actors) for (const scenario of scenarios) {
        const fixture = scene(variant, actor, scenario);
        await mount(page, fixture, width);
        const sampled = await sampleFlight(page, actor, scenario);
        const changed = videoProbe || engine.name() === "webkit" ? null : await changedPixelsWithFlight(page);
        if (videoProbe) compositorBounds = await captureVideoPaint(page);
        const evidencePath = `${evidenceDir}/mahjong-solid-flight-${engine.name()}-${variant}-seat-${actor}-${scenario}-${width}.png`;
        if (probeOnly && changed) {
          writeFileSync(evidencePath, changed.visible);
          writeFileSync(evidencePath.replace(/\.png$/, "-hidden.png"), changed.hidden);
        }
        const row = { engine: engine.name(), variant, width, actor, ...sampled, midpointChangedPixels: changed?.pixels ?? null,
          fullChangedPixels:changed?.fullPixels ?? null, diffBounds:changed?.diffBounds ?? null, sentinelPixels:changed?.sentinelPixels ?? null,
          ...(probeOnly ? { evidencePath } : {}) };
        rows.push(row);
        console.log(JSON.stringify(row));
        assert.ok(sampled.duration > 0 && sampled.duration <= 1000, "the opponent flip must stay finite");
        assert.equal(sampled.hiddenTarget, true, "the public target stays hidden until the flight finishes");
        assert.ok(sampled.sourceError < 1, `the orange back must coincide with the cached source quadrilateral: ${sampled.sourceError}px`);
        assert.ok(sampled.targetError < 1, `the ivory face must land on the actual river quadrilateral: ${sampled.targetError}px`);
        assert.deepEqual(sampled.backMaterial, sampled.sourceBackMaterial, "the zero-time portal back must keep the cached standing-tile orange material");
        assert.deepEqual(sampled.frontMaterial, sampled.targetMaterial, "the public flight face must use the accepted river tile paint");
        assert.equal(sampled.frontTile, sampled.targetTile, "the flight front must carry the exact accepted public tile identity");
        assert.equal(sampled.cardPaintFaceCount, 6, "the flight body must expose exactly six connected planes");
        assert.ok(Number.parseFloat(sampled.flightDepth) > 2, "the opponent body depth must remain nonzero throughout the flip");
        assert.ok(sampled.sideFaces.some(face => face.width * face.height > 16), "the mid-flip body must retain a visible side-plane projection");
        if (scenario === "red-five") assert.equal(sampled.eventTile, "p0", "the accepted red five stays the displayed public tile");
        if (scenario === "tsumogiri") assert.match(sampled.eventClasses, /is-tsumogiri/, "the accepted drawn-tile marker stays on the public discard");
        if (scenario === "riichi") assert.match(sampled.eventClasses, /is-riichi/, "the accepted riichi marker stays on the public discard");
        if (changed && engine.name() === "chromium") assert.ok(changed.pixels > 100, `Chromium mid-flip cuboid must contribute visibly painted pixels, got ${changed.pixels}`);
        if (!videoProbe) {
          await page.evaluate(() => { document.querySelector('[data-testid="mahjong-discard-flight"]')?.getAnimations().forEach(animation => animation.finish()); });
          await page.waitForTimeout(20);
          assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "the flight must finish and remove itself");
          await page.evaluate(after => (window as any).solidFlightApi.update(structuredClone(after)), fixture.after);
          assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "a duplicate confirmed snapshot must not replay the discard");
          await page.evaluate(() => (window as any).solidFlightApi.dispose());
        }
      }
    }
    if (videoProbe && video && compositorBounds) {
      await page.close();
      const videoPath = await video.path();
      const savedVideoPath = `${evidenceDir}/mahjong-solid-flight-webkit-compositor.webm`;
      renameSync(videoPath, savedVideoPath);
      const analyzed = await analyzeVideoPaint(savedVideoPath, compositorBounds);
      console.log(JSON.stringify({ compositorVideo:savedVideoPath, ...analyzed }));
    }
    if (context) await context.close();
  } finally {
    await browser.close();
  }
}
const resultsPath = `${evidenceDir}/${videoProbe ? "mahjong-solid-flight-video-probe-results.json" : "mahjong-solid-flight-results.json"}`;
writeFileSync(resultsPath, JSON.stringify(rows, null, 2) + "\n");
console.log(`${videoProbe ? "PASS WebKit compositor capture" : `PASS ${rows.length} solid-flight cases across Chromium and WebKit`}; ${resultsPath}`);
