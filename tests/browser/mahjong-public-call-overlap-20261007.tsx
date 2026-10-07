// Real-engine browser proof for a legal pon/chi/minkan accepted before the opponent discard flight finishes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit, type BrowserType } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import type { Choice, RoomView } from "../../src/modules/mahjong/types";
import { projectedSampleScript } from "./projected-samples";

const output = `.local/audit/public-call-overlap-20261007T${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
mkdirSync(output, { recursive: false });
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const encode = (value: string) => [...value.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));
const names = ["甲", "乙 · 朋友", "丙", "丁"];
type CallKind = "chi" | "pon" | "kan";
type Fixture = { kind: CallKind; called: string; initial: RoomView; before: RoomView; after: RoomView; discardChoice: string; callChoice: string };

function fixture(kind: CallKind): Fixture {
  const called = kind === "chi" ? "p3" : kind === "pon" ? "p0" : "z7";
  const hand = kind === "chi" ? "p12m456s123789z12" : kind === "pon" ? "p55m456s123789z12" : "z777p123456s123z1";
  const makeWall = (physical: string[]) => {
    const pool = physical.slice();
    const take = (tile: string) => {
      const index = pool.indexOf(tile);
      assert.ok(index >= 0, `physical wall contains ${tile}`);
      return pool.splice(index, 1)[0];
    };
    const hands = Array.from({ length: 4 }, () => [] as string[]);
    hands[0] = encode("m123p678s456789z4").map(take);
    hands[1] = encode(hand).map(take);
    const draw = take(called);
    for (let seat = 2; seat < 4; seat++) hands[seat] = pool.splice(0, 13);
    assert.deepEqual(hands.map(cards => cards.length), [13, 13, 13, 13]);
    return { hands, draw, pool };
  };
  const game = new RiichiGame("east", names, { dealer: 0, wallFactory: rule => {
    const wall = new Majiang.Shan(rule);
    const { hands, draw, pool } = makeWall(wall._pai.slice());
    wall._pai = [...pool, ...[...hands.flat(), draw].reverse()];
    wall._baopai = [wall._pai[4]];
    wall._fubaopai = [wall._pai[9]];
    assert.deepEqual(wall._pai.slice().sort(), new Majiang.Shan(rule)._pai.slice().sort());
    return wall;
  } });
  const viewer = 2;
  const room = (version: number): RoomView => ({
    id: `overlap-${kind}`, code: "ABCDEFGH", hostUserId: "0", mode: "east", variant: "yonma",
    status: "playing", version, mySeat: viewer, game: game.view(viewer),
    members: names.map((displayName, seat) => ({ userId: String(seat), displayName, seat, kind: "human", ready: true, connected: true })),
  });
  const initial = room(1);
  const discard = game.view(0).choices.find(choice => choice.type === "discard" && choice.value === `${called}_`);
  assert.ok(discard, `real yonma engine offers the ${called}_ discard`);
  game.respond(0, game.view(0).decisionId, discard.id);
  const before = room(2);
  const call = game.view(1).choices.find(choice => choice.type === kind);
  assert.ok(call, `real yonma engine offers ${kind}`);
  game.respond(1, game.view(1).decisionId, call.id);
  const after = room(3);
  assert.equal(after.game!.players.find(player => player.seat === 1)!.melds.length, 1);
  return { kind, called, initial, before, after, discardChoice: discard.id, callChoice: call.id };
}

const harness = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';import{measureDiscardElement}from'./src/components/mahjong/use-discard-motion';let changeRoom;function Scene(){const[room,setRoom]=useState(window.overlapFixture.initial);changeRoom=setRoom;return React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,host:true,busy:false,ownSeat:room.mySeat,connected:true,motionCanAnimate:true,onChoice:()=>{},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))}const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(React.createElement(Scene)));window.overlapApi={render:room=>flushSync(()=>changeRoom(room)),measureDiscardElement};`;
const bundle = await build({
  stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic", metafile: true,
  define: { "process.env.NODE_ENV": '"development"' },
});
const cssFiles = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css", "mahjong-table-center.css", "mahjong-table-edge.css", "mahjong-camera.css", "mahjong-call-announcement.css", "mahjong-standing-tile.css"];
const css = cssFiles.map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");
const sources = [
  "src/components/mahjong/use-public-call-motion.tsx",
  "src/components/mahjong/public-call-motion.ts",
  "src/components/mahjong/mahjong-client.tsx",
  "src/components/mahjong/use-discard-motion.tsx",
  "src/components/mahjong/discard-motion.ts",
  "src/components/mahjong/mahjong-solid-flight-tile.tsx",
  "src/components/mahjong/mahjong-meld.tsx",
  "src/components/mahjong/projected-geometry.ts",
  "tests/component/mahjong-public-call-motion.test.tsx",
  "tests/browser/mahjong-public-call-overlap-20261007.tsx",
];
writeFileSync(`${output}/source-manifest.json`, JSON.stringify({
  head: (await import("node:child_process")).execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sources: Object.fromEntries(sources.map(file => [file, digest(readFileSync(file))])),
  styles: Object.fromEntries(cssFiles.map(file => [file, digest(readFileSync(`src/app/mahjong/${file}`))])),
  bundle: digest(bundle.outputFiles[0].text),
}, null, 2) + "\n");

function pointError(left: Array<{x:number;y:number}>, right: Array<{x:number;y:number}>) {
  assert.equal(left.length, right.length);
  return Math.max(...left.map(point => Math.min(...right.map(other => Math.hypot(point.x-other.x, point.y-other.y)))));
}

async function run(engine: BrowserType, kind: CallKind) {
  const scene = fixture(kind);
  const browser = await engine.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.route("https://mahjong.local/images/**", route => {
      const file = new URL(route.request().url()).pathname;
      return route.fulfill({ status: 200, contentType: file.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync(`public${file}`) });
    });
    await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*{box-sizing:border-box}${css}</style><div id="root"></div>`);
    await page.evaluate(value => { (window as any).overlapFixture = value; }, scene);
    await page.addScriptTag({ content: `globalThis.__name=(t,v)=>Object.defineProperty(t,"name",{value:v,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}` });
    await page.addScriptTag({ content: projectedSampleScript });
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300));
    await page.waitForTimeout(40); // rack measurements precede the accepted discard

    const transition = await page.evaluate(({ before, after }) => {
      const api = (window as any).overlapApi;
      api.render(before);
      const acceptedDiscardAt = performance.now();
      const discardFlight = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]');
      const hiddenSource = document.querySelector<HTMLElement>('.is-discard-motion-hidden[data-discard-event-id]');
      const sourceFace = hiddenSource?.querySelector<HTMLElement>(".mahjong-tile");
      const source = sourceFace ? api.measureDiscardElement(sourceFace) : null;
      const discardFlightAtCallStart = Boolean(discardFlight);
      const hiddenSourceId = hiddenSource?.dataset.discardEventId ?? null;
      api.render(after);
      const callAcceptedAt = performance.now();
      const flight = document.querySelector<HTMLElement>('[data-testid="mahjong-call-flight"]');
      const targetGroup = document.querySelector<HTMLElement>('[data-meld-seat="1"][data-meld-index="0"]');
      const targetFace = targetGroup?.querySelector<HTMLElement>("[data-called] .mahjong-tile");
      const targetVolume = targetFace?.closest<HTMLElement>("[data-meld-volume]");
      const callAnimations = flight ? [flight, ...flight.querySelectorAll<HTMLElement>("*")].flatMap(element => element.getAnimations()) : [];
      callAnimations.forEach(animation => animation.pause());
      const retainedSourceId = flight?.dataset.motionSourceTileId ?? null;
      const sourceEventStillInRiver = Boolean(hiddenSourceId && document.querySelector(`[data-discard-event-id="${hiddenSourceId}"]`));
      const faceUp = flight?.querySelector<HTMLElement>(".mahjong-discard-flight__face-up-cap .mahjong-tile");
      const sourceQuad = source?.geometry?.quad
        ? [source.geometry.quad.topLeft, source.geometry.quad.topRight, source.geometry.quad.bottomRight, source.geometry.quad.bottomLeft]
        : null;
      const targetMeasure = targetFace ? api.measureDiscardElement(targetFace) : null;
      const targetQuad = targetMeasure?.geometry?.quad
        ? [targetMeasure.geometry.quad.topLeft, targetMeasure.geometry.quad.topRight, targetMeasure.geometry.quad.bottomRight, targetMeasure.geometry.quad.bottomLeft]
        : null;
      return {
        elapsedMs: callAcceptedAt - acceptedDiscardAt,
        discardFlightAtCallStart,
        hiddenSourceId,
        retainedSourceId,
        sourceQuad,
        targetQuad,
        faceValue: faceUp?.dataset.tileFace ?? null,
        flightSource: flight?.dataset.motionSource ?? null,
        flightSides: flight?.querySelectorAll("[data-flight-side]").length ?? 0,
        flightVolume: Boolean(flight?.querySelector("[data-flight-volume]")),
        discardFlightAfterCall: document.querySelectorAll('[data-testid="mahjong-discard-flight"]').length,
        sourceEventStillInRiver,
        targetGroupExists: Boolean(targetGroup),
        targetVolumeVisibility: targetVolume ? getComputedStyle(targetVolume).visibility : null,
        targetFaceVisibility: targetFace ? getComputedStyle(targetFace).visibility : null,
        targetPhysicalVisibility: targetVolume ? [...targetVolume.querySelectorAll<HTMLElement>("[data-meld-surface], [data-meld-side]")].map(element => getComputedStyle(element).visibility) : [],
        targetSideCount: targetVolume?.querySelectorAll("[data-meld-side]").length ?? 0,
        movementDuration: callAnimations.find(animation => animation.effect instanceof KeyframeEffect && animation.effect.target === flight)?.effect?.getComputedTiming().duration ?? null,
      };
    }, { before: scene.before, after: scene.after });

    writeFileSync(`${output}/${engine.name()}-${kind}-transition.json`,JSON.stringify({
      browser:engine.name(),kind:scene.kind,choices:{discard:scene.discardChoice,call:scene.callChoice},
      versions:{initial:scene.initial.version,discard:scene.before.version,call:scene.after.version},transition,
    },null,2)+"\n");

    assert.ok(transition.elapsedMs < 230, `${kind}: accepted call arrived ${transition.elapsedMs.toFixed(2)} ms after the discard flight began`);
    assert.ok(transition.discardFlightAtCallStart, `${kind}: the real opponent discard flight was active before the call`);
    assert.ok(transition.hiddenSourceId, `${kind}: the exact public discard was hidden by its in-flight portal`);
    assert.equal(transition.retainedSourceId, transition.hiddenSourceId, `${kind}: call flight consumes the exact hidden discard source`);
    assert.equal(transition.flightSource, "public");
    assert.equal(transition.faceValue, scene.called);
    assert.equal(transition.flightVolume, true);
    assert.equal(transition.flightSides, 4);
    assert.equal(transition.discardFlightAfterCall, 0, "the cancelled discard flight leaves no duplicate portal");
    assert.equal(transition.sourceEventStillInRiver, false, "claimed source is removed from the river while the public flight owns it");
    assert.equal(transition.targetGroupExists, true);
    assert.equal(transition.targetVolumeVisibility, "hidden", "whole physical meld tile is hidden under the moving copy");
    assert.equal(transition.targetFaceVisibility, "hidden");
    assert.equal(transition.targetPhysicalVisibility.length, 6);
    assert.ok(transition.targetPhysicalVisibility.every(value => value === "hidden"));
    assert.equal(transition.targetSideCount, 4);
    assert.equal(transition.movementDuration, 230);
    const sourceQuad=transition.sourceQuad,targetQuad=transition.targetQuad;
    assert.ok(sourceQuad, `${kind}: the hidden source has a physical quad`);
    assert.ok(targetQuad, `${kind}: the called target has a physical quad`);

    const frames = await page.evaluate(async () => {
      const flight = document.querySelector<HTMLElement>('[data-testid="mahjong-call-flight"]')!;
      const targetFace = document.querySelector<HTMLElement>('[data-meld-seat="1"][data-meld-index="0"] [data-called] .mahjong-tile')!;
      const targetVolume = targetFace.closest<HTMLElement>("[data-meld-volume]")!;
      const movement = [flight, ...flight.querySelectorAll<HTMLElement>("*")].flatMap(element => element.getAnimations())
        .find(animation => animation.effect instanceof KeyframeEffect && animation.effect.target === flight)!;
      const animations = [flight, ...flight.querySelectorAll<HTMLElement>("*")].flatMap(element => element.getAnimations());
      const corners = (element: HTMLElement) => (window as any).mahjongPhysicalSamples(element, [[0,0],[1,0],[1,1],[0,1]]) as Array<{x:number;y:number}>;
      const sidePoints = (root: HTMLElement, selector: string) => [...root.querySelectorAll<HTMLElement>(selector)].map(element => ({
        side: element.dataset.flightSide ?? element.dataset.meldSide,
        points: corners(element),
        width: getComputedStyle(element).width,
        height: getComputedStyle(element).height,
      }));
      const snapshots=[] as any[];
      for (const time of [0,115,229.99]) {
        animations.forEach(animation => { animation.pause(); animation.currentTime = time; });
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        snapshots.push({
          time,
          cap: corners(flight.querySelector<HTMLElement>(".mahjong-discard-flight__face-up-cap .mahjong-tile")!),
          sides: sidePoints(flight,"[data-flight-side]"),
          targetSides: sidePoints(targetVolume,"[data-meld-side]"),
          targetCap: corners(targetFace),
          targetVolumeVisibility: getComputedStyle(targetVolume).visibility,
        });
      }
      return { duration: movement.effect!.getComputedTiming().duration, snapshots };
    });
    assert.equal(frames.duration, 230);
    const [start, midpoint, endpoint] = frames.snapshots;
    assert.equal(start.cap.length, sourceQuad.length);
    assert.ok(Math.max(...start.cap.map((point:any,index:number) => Math.hypot(point.x-sourceQuad[index].x, point.y-sourceQuad[index].y))) < 2,
      `${kind}: first public-flight face stays on the exact hidden river plane`);
    assert.ok(midpoint.sides.length === 4 && midpoint.sides.every((side:any) => Number.parseFloat(side.width)>0 && Number.parseFloat(side.height)>0),
      `${kind}: all four real flight walls retain positive thickness at midpoint`);
    assert.ok(Math.max(...endpoint.cap.map((point:any,index:number) => Math.hypot(point.x-targetQuad[index].x, point.y-targetQuad[index].y))) < 1.25,
      `${kind}: landing cap aligns to the exact called meld face`);
    const flightWalls=endpoint.sides.flatMap((side:any)=>side.points);
    const targetWalls=endpoint.targetSides.flatMap((side:any)=>side.points);
    assert.equal(flightWalls.length,16); assert.equal(targetWalls.length,16);
    assert.ok(pointError(flightWalls,targetWalls)<1.5,`${kind}: all four landing walls align to the whole physical target tile`);
    await page.screenshot({ path: `${output}/${engine.name()}-${kind}-arrival.png` });

    await page.evaluate(() => {
      const flight=document.querySelector<HTMLElement>('[data-testid="mahjong-call-flight"]');
      if(flight) for(const animation of [flight,...flight.querySelectorAll<HTMLElement>("*")].flatMap(element=>element.getAnimations())) animation.finish();
    });
    await page.getByTestId("mahjong-call-flight").waitFor({state:"detached",timeout:1000});
    const cleanup=await page.evaluate(() => {
      const targetFace=document.querySelector<HTMLElement>('[data-meld-seat="1"][data-meld-index="0"] [data-called] .mahjong-tile')!;
      const volume=targetFace.closest<HTMLElement>("[data-meld-volume]")!;
      return {
        callFlightCount:document.querySelectorAll('[data-testid="mahjong-call-flight"]').length,
        discardFlightCount:document.querySelectorAll('[data-testid="mahjong-discard-flight"]').length,
        sourceEventCount:document.querySelectorAll('[data-discard-event-id$=":0:0"]').length,
        targetVolumeInlineVisibility:volume.style.visibility,
        targetVolumeVisibility:getComputedStyle(volume).visibility,
        targetFaceVisibility:getComputedStyle(targetFace).visibility,
        targetPhysicalVisibility:[...volume.querySelectorAll<HTMLElement>("[data-meld-surface], [data-meld-side]")].map(element=>getComputedStyle(element).visibility),
        sideCount:volume.querySelectorAll("[data-meld-side]").length,
      };
    });
    assert.deepEqual(cleanup,{
      callFlightCount:0,discardFlightCount:0,sourceEventCount:0,targetVolumeInlineVisibility:"",targetVolumeVisibility:"visible",
      targetFaceVisibility:"visible",targetPhysicalVisibility:Array(6).fill("visible"),sideCount:4,
    });
    assert.deepEqual(errors,[]);
    writeFileSync(`${output}/${engine.name()}-${kind}.json`,JSON.stringify({
      browser:engine.name(),kind:scene.kind,variant:"yonma",viewer:2,viewport:{width:844,height:390},
      choices:{discard:scene.discardChoice,call:scene.callChoice},versions:{initial:scene.initial.version,discard:scene.before.version,call:scene.after.version},
      transition,frames,cleanup,errors,
    },null,2)+"\n");
    console.log(`PASS ${engine.name()} ${kind}: overlap ${transition.elapsedMs.toFixed(2)} ms, cap ${pointError(endpoint.cap,endpoint.targetCap).toFixed(3)} px, walls ${pointError(flightWalls,targetWalls).toFixed(3)} px`);
  } finally {
    await page.close();
    await browser.close();
  }
}

for (const engine of [chromium, webkit]) for (const kind of ["pon","chi","kan"] as const) await run(engine,kind);
writeFileSync(`${output}/summary.json`,JSON.stringify({
  scope:"actual legal RiichiGame snapshots mounted in local GameRoom; no server or network service",
  cases:6,types:["pon","chi","kan"],browsers:["chromium","webkit"],
  sourceFiles:Object.fromEntries(sources.map(file=>[file,digest(readFileSync(file))])),
},null,2)+"\n");
console.log(`ARTIFACTS ${output}`);
