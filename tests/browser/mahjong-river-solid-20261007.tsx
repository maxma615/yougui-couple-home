// Bounded real-engine/browser proof for the raised river caps and their
// source-to-target six-face flight geometry. No room service or ECS is used.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { chromium, webkit, type Browser, type Page } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { GameVariant, RoomView } from "../../src/modules/mahjong/types";
import { measureDiscardElement } from "../../src/components/mahjong/use-discard-motion";
import { projectedSampleScript } from "./projected-samples";

type Scenario = "ordinary" | "tsumogiri" | "riichi";
type EngineGame = RiichiGame | SanmaGame;
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
const output = `.local/audit/mahjong-river-solid-${stamp}`;
mkdirSync(output, { recursive: false });
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const encode = (value: string) => [...value.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));
const seats = ["玩家", "电脑甲", "电脑乙", "电脑丙"];

type DiscardFixture = { variant: GameVariant; actor: number; scenario: Scenario; room: RoomView; after: RoomView; tile: string };

function roomFor(variant: GameVariant, game: ReturnType<EngineGame["view"]>, version: number): RoomView {
  const count = variant === "sanma" ? 3 : 4;
  return {
    // A live room keeps its identity across accepted snapshots; changing this
    // would correctly make DiscardMotionTracker treat the update as a reset.
    id: `river-${variant}`, code: "ABCDEFGH", hostUserId: "fixture-0", variant, mode: "east",
    status: "playing", version, mySeat: 0, game,
    members: seats.slice(0, count).map((displayName, seat) => ({
      userId: `fixture-${seat}`, displayName, seat, kind: "human", ready: true, connected: true,
    })),
  };
}

function discardFixture(variant: GameVariant, actor: number, scenario: Scenario): DiscardFixture {
  const count = variant === "sanma" ? 3 : 4;
  assert.ok(actor < count);
  const hand = scenario === "riichi" ? "p123456789s123z2" : "p112233s456789z1";
  const draw = scenario === "riichi" ? "z3" : "z7";
  const allocate = (available: string[]) => {
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `actual fixture wall has ${tile}`);
      return available.splice(index, 1)[0];
    };
    const hands = Array.from({ length: count }, () => [] as string[]);
    hands[actor] = encode(hand).map(take);
    take(draw);
    for (let seat = 0; seat < count; seat++) if (seat !== actor) hands[seat] = available.splice(0, 13);
    return Array.from({ length: count }, (_, wind) => hands[(actor + wind) % count]).flat();
  };
  const game: EngineGame = variant === "sanma"
    ? new SanmaGame("east", seats.slice(0, count), { dealer: actor, wallFactory: () => {
      const available = sanmaTiles(), dealt = allocate(available);
      const reserve = available.splice(0, 4), indicators = available.splice(0, 10);
      return new SanmaWall([...dealt, draw, ...available, ...reserve, ...indicators]);
    } })
    : new RiichiGame("east", seats.slice(0, count), { dealer: actor, wallFactory: rule => {
      const wall = new Majiang.Shan(rule), available = wall._pai.slice(), dealt = allocate(available);
      wall._pai = [...available, ...[...dealt, draw].reverse()];
      wall._baopai = [wall._pai[4]]; wall._fubaopai = [wall._pai[9]];
      return wall;
    } });
  const before = roomFor(variant, game.view(0), 1);
  const acting = game.view(actor);
  const type = scenario === "riichi" ? "riichi" : "discard";
  const value = scenario === "ordinary" ? "p1" : `${draw}_`;
  const choice = acting.choices.find(candidate => candidate.type === type && candidate.value === value);
  assert.ok(choice, `engine offers legal ${type}:${value} for ${variant} seat ${actor}; available ${acting.choices.map(candidate => `${candidate.type}:${candidate.value}`).join(",")}`);
  game.respond(actor, acting.decisionId, choice.id);
  const after = roomFor(variant, game.view(0), 2);
  const tile = after.game!.players.find(player => player.seat === actor)!.discards.at(-1)!;
  return { variant, actor, scenario, room: before, after, tile };
}

function publicCallFixture(variant: GameVariant) {
  const count = variant === "sanma" ? 3 : 4;
  const called = "p0";
  const allocate = (available: string[]) => {
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `actual fixture wall has ${tile}`);
      return available.splice(index, 1)[0];
    };
    const hands = Array.from({ length: count }, () => [] as string[]);
    hands[1] = encode("p55s123789z12345").map(take);
    hands[0] = encode(variant === "sanma" ? "p123456789s123z1" : "m123p678s456789z4").map(take);
    const draw = take(called);
    for (let seat = 2; seat < count; seat++) hands[seat] = available.splice(0, 13);
    return { hands, draw, available };
  };
  const game: EngineGame = variant === "sanma"
    ? new SanmaGame("east", seats.slice(0, count), { dealer: 0, wallFactory: () => {
      const available = sanmaTiles(), { hands, draw } = allocate(available);
      const reserve = available.splice(0, 4), indicators = available.splice(0, 10);
      return new SanmaWall([...hands.flat(), draw, ...available, ...reserve, ...indicators]);
    } })
    : new RiichiGame("east", seats.slice(0, count), { dealer: 0, wallFactory: rule => {
      const wall = new Majiang.Shan(rule), { hands, draw, available } = allocate(wall._pai.slice());
      wall._pai = [...available, ...[...hands.flat(), draw].reverse()];
      wall._baopai = [wall._pai[4]]; wall._fubaopai = [wall._pai[9]];
      return wall;
    } });
  const room = (version: number) => roomFor(variant, game.view(0), version);
  const initial = game.view(0), discard = initial.choices.find(candidate => candidate.type === "discard" && candidate.value === `${called}_`);
  assert.ok(discard, `${variant} real engine lets the dealer discard the red five draw`);
  game.respond(0, initial.decisionId, discard.id);
  const before = room(1), caller = game.view(1), pon = caller.choices.find(candidate => candidate.type === "pon");
  assert.ok(pon, `${variant} real engine offers pon against the red five`);
  game.respond(1, caller.decisionId, pon.id);
  const after = room(2);
  assert.equal(after.game!.players.find(player => player.seat === 1)!.melds.length, 1);
  return { before, after, variant };
}

const harness = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';import{measureDiscardElement}from'./src/components/mahjong/use-discard-motion';
let setRoom,setIntent;window.riverApi={lastChoice:null,lastIntent:null,measureDiscardElement};
function Scene(){const[room,changeRoom]=useState(window.riverFixture.room);const[intent,changeIntent]=useState(null);setRoom=changeRoom;setIntent=changeIntent;return React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,host:true,busy:false,ownSeat:0,connected:true,motionCanAnimate:true,motionIntent:intent,onChoice:(choice,next)=>{window.riverApi.lastChoice=choice;window.riverApi.lastIntent=next;changeIntent(next)},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))}
const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(React.createElement(Scene)));window.riverApi.update=room=>flushSync(()=>setRoom(room));window.riverApi.dispose=()=>root.unmount();`;
const bundle = await build({
  stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const cssFiles = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css",
  "mahjong-table-center.css", "mahjong-table-edge.css", "mahjong-camera.css", "mahjong-call-announcement.css", "mahjong-standing-tile.css"];
const css = cssFiles.map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");
const script = `globalThis.__name=(t,v)=>Object.defineProperty(t,"name",{value:v,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}`;
const sourceFiles = [
  "src/components/mahjong/mahjong-river.tsx", "src/app/mahjong/mahjong-river.css",
  "src/components/mahjong/use-discard-motion.tsx", "src/components/mahjong/discard-motion.ts",
  "src/components/mahjong/mahjong-solid-flight-tile.tsx", "src/app/mahjong/mahjong-discard-motion.css",
  "tests/component/mahjong-river-solid.test.tsx", "tests/browser/mahjong-river-solid-20261007.tsx",
  "src/components/mahjong/projected-geometry.ts",
];
writeFileSync(`${output}/source-manifest.json`, JSON.stringify({
  baseHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sources: Object.fromEntries(sourceFiles.map(file => [file, digest(readFileSync(file))])),
  styles: Object.fromEntries(cssFiles.map(file => [file, digest(readFileSync(`src/app/mahjong/${file}`))])),
  bundle: digest(bundle.outputFiles[0].text),
}, null, 2) + "\n");

async function mount(browser: Browser, room: RoomView, viewport: { width: number; height: number }) {
  const page = await browser.newPage({ viewport, reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://mahjong.local/images/**", route => {
    const file = new URL(route.request().url()).pathname;
    return route.fulfill({ status: 200, contentType: file.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync(`public${file}`) });
  });
  await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*{box-sizing:border-box}${css}</style><div id="root"></div>`);
  await page.evaluate(value => { (window as any).riverFixture = { room: value }; }, room);
  await page.addScriptTag({ content: script });
  await page.addScriptTag({ content: projectedSampleScript });
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300));
  await page.waitForTimeout(260);
  return { page, errors };
}

async function render(page: Page, room: RoomView) {
  await page.evaluate(value => (window as any).riverApi.update(value), room);
}

async function sampleFlight(page: Page, kind: "discard" | "call", targetSelector: string, source?: { surface: string; normal: unknown; quad: unknown; paint: unknown; sides?: unknown }, screenshotPath?: string) {
  const selector = `[data-testid="mahjong-${kind}-flight"]`;
  await page.waitForFunction(query => Boolean(document.querySelector(query)), selector, { timeout: 2500 });
  const sampled = await page.evaluate(async ({ selector, targetSelector, source, kind }) => {
    const node = document.querySelector<HTMLElement>(selector);
    if (!node) throw new Error("server-accepted action created a flight layer");
    const nested = [node, ...node.querySelectorAll<HTMLElement>("*")];
    const animations = nested.flatMap(element => element.getAnimations());
    const movement = animations.find(animation => animation.effect instanceof KeyframeEffect && animation.effect.target === node);
    if (!movement) throw new Error("flight has a finite browser-native pose animation");
    animations.forEach(animation => animation.pause());
    const duration = Number(movement.effect!.getComputedTiming().duration);
    const target = document.querySelector<HTMLElement>(targetSelector);
    const calledTile = kind === "call"
      ? target?.querySelector<HTMLElement>('[data-called] .mahjong-tile, [data-layer="added"] .mahjong-tile') ?? null
      : null;
    const targetFace = calledTile ?? target?.querySelector<HTMLElement>("[data-tile-face]") ?? null;
    const targetVolume = targetFace?.closest<HTMLElement>("[data-river-volume], [data-meld-volume]") ?? null;
    if (!target || !targetFace) throw new Error("the accepted river or meld destination is mounted");
    const face = node.querySelector<HTMLElement>(".mahjong-discard-flight__face-up-cap .mahjong-tile, .mahjong-discard-flight__front .mahjong-tile");
    const back = node.querySelector<HTMLElement>(".mahjong-discard-flight__back");
    const card = node.querySelector<HTMLElement>(".mahjong-discard-flight__card");
    const front = node.querySelector<HTMLElement>(".mahjong-discard-flight__front");
    const stage = node.querySelector<HTMLElement>(".mahjong-discard-flight__stage");
    const solid = node.querySelector<HTMLElement>(".mahjong-discard-flight__solid");
    const endpointSurface = node.dataset.motionSource === "opponent" ? back : face;
    if (!endpointSurface) throw new Error("the flight retains its visible source face");
    const sample = (element: HTMLElement) => (window as any).mahjongPhysicalSamples(element, [[0,0],[1,0],[1,1],[0,1]]) as { x: number; y: number }[];
    const rect = (element: HTMLElement) => { const value = element.getBoundingClientRect(); return { x:value.x,y:value.y,width:value.width,height:value.height }; };
    const paint = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return { background:style.background,border:style.borderTop,borderRadius:style.borderTopLeftRadius,padding:style.padding,
        boxShadow:style.boxShadow,outline:style.outlineStyle === "none" ? "none" : style.outline,outlineOffset:style.outlineOffset,filter:style.filter };
    };
    const sidePoints = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>("[data-flight-side]")].map(element => ({
      side: element.dataset.flightSide, box: rect(element), points: sample(element),
      width: getComputedStyle(element).width, height: getComputedStyle(element).height,
    }));
    const staticSides = [...(targetVolume ?? target).querySelectorAll<HTMLElement>("[data-river-side], [data-meld-side]")].map(element => ({
      side: element.dataset.riverSide ?? element.className.toString().match(/mahjong-meld__side--([a-z]+)/)?.[1],
      points: sample(element),
    }));
    const positions = [0, duration * .5, duration - .01];
    const frames = [] as Array<Record<string, unknown>>;
    for (const time of positions) {
      for (const animation of animations) animation.currentTime = time;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      frames.push({
        time, box:rect(node), cap:face ? sample(face) : null,
        facePaint:face ? paint(face) : null,
        visiblePlane:sample(endpointSurface), back:back ? sample(back) : null,
        frontPlane:front ? sample(front) : null,
        sideFaces:sidePoints(node), targetCap:sample(targetFace), targetSides:staticSides,
        targetDepth:targetVolume
          ? getComputedStyle(targetVolume).height
          : null,
        sourcePaint:source?.paint, sourceNormal:source?.normal, sourceQuad:source?.quad,
        flightTransform:getComputedStyle(node).transform, cardTransform:card?getComputedStyle(card).transform:null,
        frontTransform:front?getComputedStyle(front).transform:null, faceTransform:face?getComputedStyle(face).transform:null,
        chain:[node,stage,card,solid,front,back].filter(Boolean).map(element=>({name:element!.className.toString(),ts:getComputedStyle(element!).transformStyle,perspective:getComputedStyle(element!).perspective,origin:getComputedStyle(element!).transformOrigin,transform:getComputedStyle(element!).transform,box:rect(element!)})),
      });
    }
    const fields = {
      source:node.dataset.motionSource, seat:node.dataset.motionSeat, duration,
      faceTile:face?.dataset.tileFace, event:node.dataset.motionEvent,
      orientation:document.querySelector<HTMLElement>(".mahjong-discard-flight__stage")
        ? getComputedStyle(document.querySelector<HTMLElement>(".mahjong-discard-flight__stage")!).perspective : "face-up",
      flightDepth:getComputedStyle(node).getPropertyValue("--flight-depth"),
      targetHidden:getComputedStyle(target).visibility === "hidden" || getComputedStyle(targetFace).visibility === "hidden"
        || getComputedStyle(target).opacity === "0" || getComputedStyle(targetFace).opacity === "0",
      geometry:(()=>{let fiber=(node as any)[Object.keys(node).find(key=>key.startsWith("__reactFiber$"))!];for(;fiber;fiber=fiber.return)if(fiber.memoizedProps?.flight)return fiber.memoizedProps.flight;return null;})(),
      movementKeyframes:(movement.effect as KeyframeEffect).getKeyframes(),
      sourceSides:source?.sides,
    };
    return { ...fields, frames };
  }, { selector, targetSelector, source, kind });
  if (screenshotPath) {
    for (const [pose,progress] of [["source",0],["mid",.5],["arrival",.85]] as const) {
      await page.evaluate(async progress => {
        const node = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]');
        if (!node) return;
        const animations = [node, ...node.querySelectorAll<HTMLElement>("*")].flatMap(element => element.getAnimations());
        const movement = animations.find(animation => animation.effect instanceof KeyframeEffect && animation.effect.target === node);
        if (!movement) return;
        const duration = Number(movement.effect!.getComputedTiming().duration);
        animations.forEach(animation => { animation.pause(); animation.currentTime = duration * progress; });
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      },progress);
      await page.locator(selector).screenshot({ path: screenshotPath.replace(/\.png$/, `-${pose}.png`) });
    }
    await page.screenshot({ path: screenshotPath });
  }
  return sampled;
}

function pointSetError(left: Array<{x:number;y:number}>, right: Array<{x:number;y:number}>) {
  assert.equal(left.length, right.length);
  return Math.max(...left.map(point => Math.min(...right.map(other => Math.hypot(point.x-other.x,point.y-other.y)))));
}

function unionSidePoints(sides: Array<{points:Array<{x:number;y:number}>}>) {
  return sides.flatMap(side => side.points);
}

function proveEndpoint(flight: Awaited<ReturnType<typeof sampleFlight>>, sourceQuad?: Array<{x:number;y:number}>, label = "unknown") {
  const start = flight.frames[0] as any, middle = flight.frames[1] as any, end = flight.frames[2] as any;
  assert.equal(flight.targetHidden, true, "the settled public tile stays covered while its flight occupies the exact endpoint");
  assert.ok(middle.sideFaces.every((side:any) => Number.parseFloat(side.width)>0 && Number.parseFloat(side.height)>0), "the visible midpoint contains all four non-flat side planes");
  if (sourceQuad && flight.source === "opponent") assert.ok(pointSetError(start.back, sourceQuad)<1.25, "the public back face starts on its exact measured source plane");
  if (sourceQuad && flight.source !== "opponent") assert.ok(pointSetError(start.cap, sourceQuad)<1.25, "the face-up first frame retains its exact selected/public source plane");
  if (flight.source === "opponent") {
    const sourceSides = flight.sourceSides as Array<{side:string;points:Array<{x:number;y:number}>}> | undefined;
    assert.ok(sourceSides?.length === 4, "the public source supplies all four actual standing-tile walls");
    const unused = [...start.sideFaces] as Array<{side:string;points:Array<{x:number;y:number}>}>;
    const sourceWallMatches = sourceSides!.map(sourceSide => {
      const candidate = unused.map(side => ({ side, residual:pointSetError(side.points,sourceSide.points) }))
        .sort((left,right) => left.residual-right.residual)[0];
      assert.ok(candidate && candidate.residual<1.25,
        `the opponent's ${sourceSide.side} wall starts on an exact physical flight-wall plane (residual ${candidate?.residual.toFixed(3) ?? "missing"})`);
      unused.splice(unused.indexOf(candidate.side),1);
      return {source:sourceSide.side,flight:candidate.side.side,residual:candidate.residual};
    });
    assert.equal(unused.length,0,"all four opponent walls map one-to-one onto the flight cuboid");
    (flight as any).sourceWallMatches = sourceWallMatches;
  }
  if (flight.source === "own") {
    const sourcePaint = flight.geometry.sourcePaint;
    assert.ok(sourcePaint, "the selected real hand tile keeps its captured source paint");
    for (const property of ["background","border","borderRadius","padding","boxShadow","outline","outlineOffset","filter"] as const) {
      assert.equal((start.facePaint as any)[property],sourcePaint[property],`native flight starts with selected-tile ${property} paint`);
    }
  }
  assert.ok(pointSetError(end.cap, end.targetCap)<1.25, `${label}: raised cap lands on actual river or meld tile face (residual ${pointSetError(end.cap,end.targetCap).toFixed(3)} px; flight ${JSON.stringify(end.cap)}; target ${JSON.stringify(end.targetCap)})`);
  const flightEnds = unionSidePoints(end.sideFaces);
  const targetEnds = end.targetSides.flatMap((side:any) => side.points) as Array<{x:number;y:number}>;
  assert.ok(targetEnds.length >= 16, "the endpoint exposes all four physical target walls");
  assert.ok(pointSetError(flightEnds, targetEnds)<1.5, "all four flight-wall endpoint corner sets agree with the destination volume");
  return { startPlaneResidual:sourceQuad ? pointSetError(flight.source === "opponent" ? start.back : start.cap, sourceQuad) : null,
    endCapResidual:pointSetError(end.cap,end.targetCap), endWallResidual:pointSetError(flightEnds,targetEnds),
    midpointSideDepths:middle.sideFaces.map((side:any)=>side.width+" × "+side.height) };
}

async function runDiscard(browser: Browser, viewport: {width:number;height:number}, fixture: DiscardFixture) {
  const { page, errors } = await mount(browser, fixture.room, viewport);
  try {
    let source: any = null;
    let sourceQuad: Array<{x:number;y:number}> | undefined;
    if (fixture.actor === 0) {
      const sourceTile = page.locator('[data-testid="mahjong-hand"] [data-tile-face="p1"]').first();
      sourceQuad = await sourceTile.evaluate(element => (window as any).mahjongPhysicalSamples(element, [[0,0],[1,0],[1,1],[0,1]]));
      await sourceTile.click(); await page.waitForTimeout(120); await sourceTile.click();
      const accepted = await page.evaluate(() => (window as any).riverApi.lastChoice);
      assert.ok(accepted && accepted.id === "discard:p1", "the UI submitted the engine's exact legal own discard choice");
      source = await page.evaluate(() => (window as any).riverApi.lastIntent);
      assert.ok(source?.sourceGeometry?.quad, "the selected real tile supplied its measured face corners");
      sourceQuad = [source.sourceGeometry.quad.topLeft, source.sourceGeometry.quad.topRight,
        source.sourceGeometry.quad.bottomRight, source.sourceGeometry.quad.bottomLeft];
    } else {
      const rack = page.locator(`[data-motion-rack-seat="${fixture.actor}"] > i${fixture.scenario === "ordinary" ? ":not(.is-drawn)" : ".is-drawn"}`).last();
      const surface = rack.locator("[data-motion-surface]");
      source = await surface.evaluate(element => (window as any).riverApi.measureDiscardElement(element));
      assert.ok(source?.geometry?.quad && source?.geometry?.normal, "the real public source back supplied its face quad and measured physical normal");
      source.sides = await surface.evaluate(element => {
        const body = element.closest<HTMLElement>("[data-standing-body]");
        return [...(body?.querySelectorAll<HTMLElement>("[data-standing-face]") ?? [])]
          .filter(face => face.dataset.standingFace !== "back" && face.dataset.standingFace !== "front")
          .map(face => ({ side:face.dataset.standingFace!, points:(window as any).mahjongPhysicalSamples(face,[[0,0],[1,0],[1,1],[0,1]]) }));
      });
      sourceQuad = [source.geometry.quad.topLeft,source.geometry.quad.topRight,source.geometry.quad.bottomRight,source.geometry.quad.bottomLeft];
    }
    await render(page, fixture.after);
    const targetIndex = fixture.after.game!.players.find(player=>player.seat===fixture.actor)!.discards.length-1;
    const targetSelector = `[data-discard-event-id$=":${fixture.actor}:${targetIndex}"]`;
    const label = `${browser.browserType().name()}-${fixture.variant}-seat${fixture.actor}-${fixture.scenario}-${viewport.width}`;
    const targetGeometry = await page.locator(`${targetSelector} [data-tile-face]`).evaluate(element => (window as any).riverApi.measureDiscardElement(element));
    const observed = await sampleFlight(page,"discard",targetSelector,source,
      viewport.width===844 && fixture.actor===2 && fixture.scenario==="tsumogiri" ? `${output}/${label}.png` : undefined);
    const residuals = proveEndpoint(observed,sourceQuad,label);
    assert.ok(targetGeometry?.geometry?.normal, `${label}: target cap has a measured physical normal after the source surface is hidden`);
    const measuredTarget = [targetGeometry.geometry.quad.topLeft,targetGeometry.geometry.quad.topRight,targetGeometry.geometry.quad.bottomRight,targetGeometry.geometry.quad.bottomLeft];
    assert.ok(pointSetError(measuredTarget,(observed.frames[2] as any).targetCap)<1.25, `${label}: hidden destination retains the exact raised cap plane`);
    if (fixture.actor !== 0) assert.equal(observed.source,"opponent");
    else assert.equal(observed.source,"own");
    assert.equal(observed.faceTile,fixture.tile.slice(0,2));
    assert.equal(observed.duration,230,"the already-established flight duration remains 230 ms");
    assert.equal(observed.targetHidden,true);
    assert.deepEqual(errors,[]);
    const proof = { label, viewport, expectedTile:fixture.tile, sourceNormal:source?.geometry?.normal ?? source?.sourceGeometry?.normal,
      targetNormal:targetGeometry.geometry.normal,
      sourcePaint:source?.paint ?? source?.sourcePaint, observed, residuals, browserErrors:errors };
    writeFileSync(`${output}/${label}.json`,JSON.stringify(proof,null,2)+"\n");
    return proof;
  } finally { await page.close(); }
}

async function runPublicCall(browser: Browser, viewport: {width:number;height:number}, variant: GameVariant) {
  const fixture = publicCallFixture(variant);
  const { page, errors } = await mount(browser, fixture.before, viewport);
  try {
    const sourceFace = page.locator('[data-discard-event-id] .mahjong-tile').first();
    const source = await sourceFace.evaluate(element => (window as any).riverApi.measureDiscardElement(element));
    assert.ok(source?.geometry?.normal, "accepted river source has measured positive-z normal");
    const sourceQuad = [source.geometry.quad.topLeft,source.geometry.quad.topRight,source.geometry.quad.bottomRight,source.geometry.quad.bottomLeft];
    await render(page,fixture.after);
    const targetSelector='[data-meld-seat="1"][data-meld-index="0"]';
    const observed=await sampleFlight(page,"call",targetSelector,source);
    const residuals=proveEndpoint(observed,sourceQuad,`${browser.browserType().name()}-${variant}-publiccall-${viewport.width}`);
    assert.equal(observed.source,"public");
    assert.equal(observed.faceTile,"p0","the public flight keeps the exact red-five tile identity");
    assert.equal(observed.duration,230);
    assert.deepEqual(errors,[]);
    const label=`${browser.browserType().name()}-${variant}-publiccall-${viewport.width}`;
    const proof={label,viewport,sourceNormal:source.geometry.normal,sourcePaint:source.paint,observed,residuals,browserErrors:errors};
    writeFileSync(`${output}/${label}.json`,JSON.stringify(proof,null,2)+"\n");
    return proof;
  } finally { await page.close(); }
}

const results: unknown[] = [];
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const viewport of [{width:667,height:375},{width:844,height:390}]) {
      for (const variant of ["sanma","yonma"] as const) {
        const count=variant==="sanma"?3:4;
        const scenarios: Array<[number,Scenario]> = [[0,"ordinary"],[1,"ordinary"],[2,"ordinary"],[2,"tsumogiri"],[2,"riichi"]];
        if(count===4)scenarios.push([3,"ordinary"]);
        for(const [actor,scenario] of scenarios)results.push(await runDiscard(browser,viewport,discardFixture(variant,actor,scenario)));
        results.push(await runPublicCall(browser,viewport,variant));
      }
    }
    // A desktop endpoint check is kept to one representative physical seat per rule set.
    for(const variant of ["sanma","yonma"] as const)results.push(await runDiscard(browser,{width:1440,height:810},discardFixture(variant,2,"ordinary")));
  } finally { await browser.close(); }
}

writeFileSync(`${output}/summary.json`,JSON.stringify({
  run:"real engine accepted transitions; actual Chromium and WebKit CSS 3D sampling",
  cases:results.length,sourceFiles:Object.fromEntries(sourceFiles.map(file=>[file,digest(readFileSync(file))])),
  outputs:results.map((value:any)=>value.label),limitations:["230 ms is preserved from existing product timing; this suite verifies source, midpoint, and endpoint geometry, not vendor timing parity."],
},null,2)+"\n");
console.log(`PASS ${results.length} real-engine Chromium/WebKit physical river and call-flight poses; artifacts ${output}`);
