// Real-engine public-meld/North surface audit. No room store, server, or live game is used.
import { projectedSampleScript } from "./projected-samples";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit, type Page } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { GameVariant, GameView, RoomView } from "../../src/modules/mahjong/types";

type RealGame = { view(seat: number): GameView; respond(seat: number, decisionId: string, choiceId: string): void };
type Scene = {
  id: string; variant: GameVariant; actor: number; capacity: number; game: RealGame;
  beforeKan: GameView; afterKan: GameView; afterRiver: GameView;
  afterKanViews: GameView[]; afterRiverViews: GameView[]; red: boolean; nuki: boolean;
};
type Point = { x: number; y: number };
type Quad = Point[];

const names = ["牌友0", "牌友1", "牌友2", "牌友3"];
const sizes = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1440, height: 810 }];
const tileList = (encoded: string) => [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));
const core = Majiang.Shoupai as unknown as { valid_mianzi: (value: string) => string | undefined };

function sanmaWall(hands: Record<number, string>, draws: string[]) {
  return { dealer: 0, wallFactory: () => {
    const available = sanmaTiles();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `physical Sanma tile exhausted: ${tile}`);
      return available.splice(index, 1)[0];
    };
    const dealt = [0, 1, 2].map(seat => hands[seat] ? tileList(hands[seat]).map(take) : []);
    const drawn = draws.map(take);
    for (const hand of dealt) if (!hand.length) hand.push(...available.splice(0, 13));
    const replacements = available.splice(0, 4), indicators = available.splice(0, 10);
    return new SanmaWall([...dealt.flat(), ...drawn, ...available, ...replacements, ...indicators]);
  }};
}

function riichiWall(hands: Record<number, string>, drawn: string) {
  return { dealer: 0, wallFactory: (rule: ConstructorParameters<typeof Majiang.Shan>[0]) => {
    const wall = new Majiang.Shan(rule), available = wall._pai.slice();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `physical Riichi tile exhausted: ${tile}`);
      return available.splice(index, 1)[0];
    };
    const dealt: string[][] = [[], [], [], []];
    for (const [seat, encoded] of Object.entries(hands)) dealt[Number(seat)] = tileList(encoded).map(take);
    take(drawn);
    for (let seat = 0; seat < 4; seat++) if (!dealt[seat].length) dealt[seat] = available.splice(0, 13);
    const order = Array.from({ length: 4 }, (_, wind) => dealt[wind]);
    wall._pai = [...available, ...[...order.flat(), drawn].reverse()];
    wall._baopai = [wall._pai[4]];
    wall._fubaopai = [wall._pai[9]];
    return wall;
  }};
}

function passPending(game: RealGame, capacity: number, actor: number, expectedPhase: string) {
  for (let cycle = 0; cycle < capacity + 1; cycle++) {
    if (game.view(actor).phase !== expectedPhase) return;
    let passed = false;
    for (let seat = 0; seat < capacity; seat++) {
      if (seat === actor) continue;
      const view = game.view(seat), choice = view.choices.find(item => item.type === "pass");
      if (choice) { game.respond(seat, view.decisionId, choice.id); passed = true; }
    }
    if (!passed && game.view(actor).phase === expectedPhase) return;
  }
  assert.notEqual(game.view(actor).phase, expectedPhase, `all legal reactions to ${expectedPhase} must resolve`);
}

function meldPhysicalCount(player: GameView["players"][number]) {
  return player.melds.reduce((total, meld) => total + (meld.match(/\d/g)?.length ?? 0), 0);
}

function heldCount(view: GameView, actor: number) {
  const player = view.players.find(candidate => candidate.seat === actor)!;
  return player.handCount + meldPhysicalCount(player) + (player.nuki ?? 0);
}

function snapshotViews(game: RealGame, capacity: number): GameView[] {
  const snapshots = Array.from({ length: capacity }, (_, seat) => structuredClone(game.view(seat)));
  for (let left = 0; left < snapshots.length; left++) for (let right = left + 1; right < snapshots.length; right++) {
    assert.notStrictEqual(snapshots[left].players, snapshots[right].players, "viewer DTOs must not share mutable player arrays");
  }
  return snapshots;
}

function progressKan(id: string, variant: GameVariant, game: RealGame, capacity: number, red: boolean, nuki: boolean): Scene {
  if (nuki) {
    const initial = game.view(0), choice = initial.choices.find(item => item.type === "nuki");
    assert.ok(choice, `${id}: physical wall must offer North extraction`);
    game.respond(0, initial.decisionId, choice.id);
    passPending(game, capacity, 0, "nuki");
    assert.equal(game.view(0).phase, "nukizimo", `${id}: actual North choice reaches replacement draw`);
    assert.equal(game.view(0).players.find(player => player.seat === 0)?.nuki, 1, `${id}: one North is public`);
  }

  const beforeKan = game.view(0);
  assert.equal(beforeKan.phase, nuki ? "nukizimo" : "zimo", `${id}: kan must start from a real live draw`);
  const kan = beforeKan.choices.find(choice => choice.type === "kan" && (red
    ? choice.value?.[0] === "p" && (choice.value.match(/\d/g)?.length ?? 0) === 4 && choice.value.includes("0")
    : choice.value === "z7777"));
  assert.ok(kan, `${id}: engine must offer a legal ${red ? "red-p5" : "ordinary z7"} ankan; choices=${JSON.stringify(beforeKan.choices)}`);
  game.respond(0, beforeKan.decisionId, kan.id);
  passPending(game, capacity, 0, "gang");
  const afterKanViews = snapshotViews(game, capacity), afterKan = afterKanViews[0];
  const afterKanSnapshot = JSON.stringify(afterKanViews), publicActor = afterKan.players.find(player => player.seat === 0)!;
  assert.equal(afterKan.phase, "gangzimo", `${id}: actual kan proceeds to replacement draw`);
  assert.equal(publicActor.melds.length, 1, `${id}: engine publishes one kan`);
  assert.equal(core.valid_mianzi(publicActor.melds[0]), publicActor.melds[0], `${id}: use canonical engine meld notation`);
  assert.equal(meldPhysicalCount(publicActor), 4, `${id}: closed kan contains four physical tiles`);
  assert.equal(publicActor.handCount, 11, `${id}: 11 concealed tiles remain after kan replacement`);
  assert.equal(publicActor.nuki ?? 0, nuki ? 1 : 0, `${id}: Nuki count persists through kan`);
  const globalKans = afterKan.players.flatMap(player => player.melds).filter(meld => (meld.match(/\d/g)?.length ?? 0) === 4).length;
  assert.ok(globalKans <= 4, `${id}: global kan limit is respected`);
  assert.equal(heldCount(afterKan, 0), heldCount(beforeKan, 0) + 1,
    `${id}: only the actual replacement draw changes actor-held physical tile count`);

  // Use a second real legal Choice so the rendered public tile can be checked against a real river.
  const discardView = game.view(0), discard = discardView.choices.find(choice => choice.type === "discard");
  assert.ok(discard, `${id}: post-kan replacement draw must offer a legal discard`);
  const previousRiverLength = publicActor.discards.length;
  game.respond(0, discardView.decisionId, discard.id);
  passPending(game, capacity, 0, "dapai");
  const afterRiverViews = snapshotViews(game, capacity), afterRiver = afterRiverViews[0];
  const riverActor = afterRiver.players.find(player => player.seat === 0)!;
  assert.equal(riverActor.discards.length, previousRiverLength + 1, `${id}: actual Choice creates one river tile`);
  assert.equal(heldCount(afterRiver, 0) + riverActor.discards.length, heldCount(afterKan, 0) + previousRiverLength,
    `${id}: discarding moves one physical tile from hand to river without loss`);
  assert.equal(riverActor.melds[0], publicActor.melds[0]);
  assert.equal(riverActor.nuki ?? 0, nuki ? 1 : 0);
  assert.equal(afterRiver.players.flatMap(player => player.melds).filter(meld => (meld.match(/\d/g)?.length ?? 0) === 4).length, globalKans);
  assert.equal(publicActor.handCount, 11, `${id}: captured gangzimo snapshot retains 11 actor tiles`);
  assert.equal(publicActor.discards.length, 0, `${id}: captured gangzimo snapshot precedes the real discard`);
  assert.equal(riverActor.handCount, 10, `${id}: captured post-discard snapshot has 10 actor tiles`);
  assert.equal(riverActor.discards.length, 1, `${id}: captured post-discard snapshot has one river tile`);
  assert.equal(JSON.stringify(afterKanViews), afterKanSnapshot, `${id}: later engine mutations cannot change the gangzimo snapshots`);
  for (let left = 0; left < afterKanViews.length; left++) for (let right = 0; right < afterRiverViews.length; right++) {
    assert.notStrictEqual(afterKanViews[left].players, afterRiverViews[right].players, `${id}: stage DTOs must be deep snapshots`);
  }
  console.log(`ENGINE ${id}: legal ${nuki ? "nuki + " : ""}${red ? "red-p5" : "ordinary z7"} ankan ${publicActor.melds[0]} reached gangzimo; actual discard=${riverActor.discards.at(-1)}; hand=${publicActor.handCount}; nuki=${publicActor.nuki ?? 0}; globalKans=${globalKans}.`);
  return { id, variant, actor: 0, capacity, game, beforeKan, afterKan, afterRiver, afterKanViews, afterRiverViews, red, nuki };
}

const scenes: Scene[] = [
  progressKan("sanma-normal-z7-nuki", "sanma", new SanmaGame("east", names.slice(0, 3), sanmaWall({
    0: "z777p123s123m19z14",
    1: "p23456s456789z23",
    2: "p789s123456z4565",
  }, ["z7", "s8"])), 3, false, true),
  progressKan("sanma-red-p5", "sanma", new SanmaGame("east", names.slice(0, 3), sanmaWall({
    0: "p0555s123456z123",
  }, ["m1"])), 3, true, false),
  progressKan("yonma-normal-z7", "yonma", new RiichiGame("east", names, riichiWall({
    0: "z777p123s123m19z12",
  }, "z7")), 4, false, false),
  progressKan("yonma-red-p5", "yonma", new RiichiGame("east", names, riichiWall({
    0: "p0555s123456z123",
  }, "m1")), 4, true, false),
];

for (const scene of scenes) {
  const actor = scene.afterKan.players.find(player => player.seat === scene.actor)!;
  assert.equal(actor.melds.length, 1);
  assert.equal(core.valid_mianzi(actor.melds[0]), actor.melds[0]);
  if (scene.red) {
    assert.equal(actor.melds[0][0], "p");
    assert.deepEqual(actor.melds[0].match(/\d/g)?.sort(), ["0", "5", "5", "5"]);
  } else assert.equal(actor.melds[0], "z7777");
  assert.equal(scene.afterRiver.players.find(player => player.seat === scene.actor)!.discards.length, 1);
}

const harness = `import React from 'react';
import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));window.ownPublicChoices=[];
window.ownPublicApi={
 render:(room,ownSeat)=>flushSync(()=>{
   root.render(React.createElement('main',{className:'mahjong-page'},
     React.createElement('div',{className:'mahjong-shell'},
       React.createElement(GameRoom,{room,ownSeat,connected:true,motionCanAnimate:false,host:true,busy:false,
         onChoice:choice=>window.ownPublicChoices.push(choice),onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}}))));
 }),
 dispose:()=>root.unmount()
};`;

const bundle = await build({
  stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const cssFiles = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css", "mahjong-table-center.css", "mahjong-table-edge.css", "mahjong-camera.css"];
const css = cssFiles.map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");
const hashes = Object.fromEntries([
  ["test", "tests/browser/mahjong-own-public-surface.tsx"], ["client", "src/components/mahjong/mahjong-client.tsx"],
  ["edgeCss", "src/app/mahjong/mahjong-table-edge.css"], ["cameraCss", "src/app/mahjong/mahjong-camera.css"],
].map(([key, path]) => [key, createHash("sha256").update(readFileSync(path)).digest("hex")]));
console.log(`SOURCE_HASHES ${JSON.stringify(hashes)} cssBundle=${createHash("sha256").update(css).digest("hex")}`);

function roomFor(scene: Scene, game: GameView, viewer: number, version: number): RoomView {
  return {
    id: `own-public-${scene.id}`, code: "ABCDEFGH", hostUserId: `user-${viewer}`, mode: "east", variant: scene.variant,
    status: "playing", version, mySeat: viewer, game,
    members: Array.from({ length: scene.capacity }, (_, seat) => ({ userId: `user-${seat}`, displayName: names[seat], seat,
      kind: "human" as const, ready: true, connected: true })),
  };
}

async function mount(page: Page, room: RoomView, viewer: number, size: { width: number; height: number }) {
  await page.goto("about:blank");
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><div id="root"></div>`);
  await page.addScriptTag({ content: `globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}` });
  await page.addScriptTag({ content: projectedSampleScript });
  await page.evaluate(({ room, viewer }) => (window as any).ownPublicApi.render(room, viewer), { room, viewer });
  await page.getByTestId("mahjong-board").waitFor({ state: "visible", timeout: 3000 });
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")];
    return images.length > 0 && images.every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400);
  });
}

async function measure(page: Page, scene: Scene, viewer: number, stage: "gangzimo" | "river") {
  const stageView = stage === "gangzimo" ? scene.afterKanViews[viewer] : scene.afterRiverViews[viewer];
  const actorSnapshot = stageView.players.find(player => player.seat === scene.actor)!;
  if (stage === "gangzimo") assert.equal(stageView.phase, "gangzimo", `${scene.id} viewer=${viewer}: captured view is at gangzimo`);
  const expectedActorHandCount = stage === "gangzimo" ? 11 : 10;
  const expectedActorRiverCount = stage === "gangzimo" ? 0 : 1;
  assert.equal(actorSnapshot.handCount, expectedActorHandCount, `${scene.id} viewer=${viewer} ${stage}: actor hand count comes from the correct snapshot`);
  assert.equal(actorSnapshot.discards.length, expectedActorRiverCount, `${scene.id} viewer=${viewer} ${stage}: actor river count comes from the correct snapshot`);
  const result = await page.evaluate(({ actor, viewer, red, nuki, identityName, stage, expectedActorHandCount, expectedActorRiverCount }) => {
    const board = document.querySelector<HTMLElement>(".mahjong-table");
    const surface = document.querySelector<HTMLElement>('[data-testid="mahjong-table-surface"]');
    const panel = document.querySelector<HTMLElement>(`[data-testid="player-${actor}"]`);
    const meld = panel?.querySelector<HTMLElement>(".mahjong-meld--ankan");
    const tray = panel?.querySelector<HTMLElement>(".mahjong-nuki-tray");
    const hand = document.querySelector<HTMLElement>('.mahjong-table__own [data-testid="mahjong-hand"]');
    const ownTiles = hand ? [...hand.querySelectorAll<HTMLElement>("[data-tile-face]")] : [];
    if (!board || !surface || !panel || !meld || !hand) throw new Error("board, shared surface, public kan, or private hand is missing");
    const boardBox = board.getBoundingClientRect();
    const issues: string[] = [];
    if (!surface.contains(panel) || !surface.contains(meld)) issues.push("the actor's public ankan panel is outside the shared surface");
    if (nuki && (!tray || !surface.contains(tray))) issues.push("the actor's extracted-North tray is outside the shared surface");
    if (surface.contains(hand)) issues.push("the viewer's private hand was moved onto the public surface");
    const identity = document.querySelector<HTMLElement>(`.mahjong-table__own .mahjong-player__head[aria-label="查看${identityName}的公开副露"]`)
      || [...document.querySelectorAll<HTMLElement>(`.mahjong-player__head[aria-label="查看${identityName}的公开副露"]`)].find(node => !surface.contains(node));
    if (!identity || surface.contains(identity)) issues.push("inspect identity button is missing or projected with physical tiles");
    const riverTiles = [...surface.querySelectorAll<HTMLElement>(".mahjong-river__tile .mahjong-tile")];
    if (riverTiles.length !== expectedActorRiverCount) issues.push(`stage ${stage} must render ${expectedActorRiverCount} actual river tiles, got ${riverTiles.length}`);

    const faceSlots = [...meld.querySelectorAll<HTMLElement>(".mahjong-meld__tiles > .mahjong-meld__slot")];
    const backs = [...meld.querySelectorAll<HTMLElement>(".mahjong-meld__tiles > .mahjong-meld__back")];
    const faceTiles = [...meld.querySelectorAll<HTMLElement>(".mahjong-meld__face[data-tile-face]")];
    const slots = [...meld.querySelector(".mahjong-meld__tiles")!.children] as HTMLElement[];
    const signature = {
      kind: meld.dataset.kind,
      label: meld.getAttribute("aria-label"),
      order: slots.map(slot => slot.classList.contains("mahjong-meld__back")
        ? { kind: "back", ariaHidden: slot.getAttribute("aria-hidden"), face: null, red: false }
        : { kind: "face", ariaHidden: slot.getAttribute("aria-hidden"), face: slot.querySelector<HTMLElement>("[data-tile-face]")?.dataset.tileFace ?? null,
          red: Boolean(slot.querySelector("img[src$='Pin5-Dora.svg']")) }),
    };
    if (signature.kind !== "ankan") issues.push(`public meld kind is ${signature.kind ?? "missing"}`);
    if (backs.length !== 2 || faceSlots.length !== 2) issues.push("ankan must expose exactly two center faces and two concealed end backs");
    if (signature.order.map(slot => slot.kind).join(",") !== "back,face,face,back") issues.push("ankan slot order is not two backs, then two faces");
    if (signature.order.filter(slot => slot.kind === "back").some(slot => slot.ariaHidden !== "true")) issues.push("closed-kan backs must be hidden from assistive technology");
    if (signature.order.filter(slot => slot.kind === "face").map(slot => slot.face).join(",") !== (red ? "p0,p5" : "z7,z7")) issues.push("visible ankan faces do not preserve the actual red/ordinary tiles");
    if (signature.order.filter(slot => slot.kind === "face").map(slot => String(slot.red)).join(",") !== (red ? "true,false" : "false,false")) issues.push("visible ankan stock art does not show the expected red five");
    if (red && meld.querySelectorAll("img[src$='Pin5-Dora.svg']").length !== 1) issues.push("red-five ankan must load exactly one Pin5-Dora image");
    if (!red && meld.querySelector("img[src$='Pin5-Dora.svg']")) issues.push("ordinary ankan unexpectedly contains red-five art");
    const northFaces = tray ? [...tray.querySelectorAll<HTMLElement>('[data-tile-face="z4"]')] : [];
    if (nuki && (!tray || northFaces.length !== 1 || !tray.textContent?.includes("拔北 × 1"))) issues.push("North tray must preserve one public North and its count");
    if (!nuki && tray) issues.push("a scene without Nuki unexpectedly displays a North tray");

    const quad = (element: HTMLElement) => (window as any).mahjongPhysicalSamples(element, [[0,0],[1,0],[1,1],[0,1]]) as Point[];
    const measureTile = (element: HTMLElement, label: string) => {
      const points = quad(element), samples = (window as any).mahjongPhysicalSamples(element) as Array<Point & {u:number;v:number}>;
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) issues.push(`${label} has no painted footprint`);
      const distinctQuadPoints = new Set(points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)).size;
      const quadArea = Math.abs(points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y;
      }, 0)) / 2;
      const distinctSamples = new Set(samples.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)).size;
      if (points.length !== 4 || distinctQuadPoints < 4 || quadArea < 1) issues.push(`${label} projected face quad is degenerate: ${JSON.stringify({ distinctQuadPoints, quadArea, points })}`);
      if (samples.length !== 5 || distinctSamples !== 5) issues.push(`${label} five-point test collapsed to duplicate screen samples: ${JSON.stringify(samples)}`);
      for (const [index, point] of points.entries()) {
        if (point.x < boardBox.left - .5 || point.y < boardBox.top - .5 || point.x > boardBox.right + .5 || point.y > boardBox.bottom + .5)
          issues.push(`${label} projected corner ${index} escapes the table: ${JSON.stringify(point)}`);
      }
      for (const point of samples) {
        const hit = document.elementFromPoint(point.x, point.y);
        if (!hit || !element.contains(hit)) issues.push(`${label} local face sample ${point.u},${point.v} is covered by ${hit?.className || hit?.tagName || "none"}`);
      }
      return points;
    };
    const publicEls = [...meld.querySelectorAll<HTMLElement>(".mahjong-meld__back,.mahjong-meld__face")];
    if (nuki && tray) publicEls.push(...tray.querySelectorAll<HTMLElement>(".mahjong-tile"));
    const publicQuads = publicEls.map((element, index) => measureTile(element, `${element.dataset.tileFace || "ankan-back"}[${index}]`));
    const handQuads = ownTiles.map(tile => quad(tile));
    const riverQuads = riverTiles.map(tile => quad(tile));
    const overlaps = (left: Quad, right: Quad) => {
      for (const polygon of [left, right]) for (let index = 0; index < polygon.length; index++) {
        const a = polygon[index], b = polygon[(index + 1) % polygon.length], axis = { x: -(b.y - a.y), y: b.x - a.x };
        const lp = left.map(point => point.x * axis.x + point.y * axis.y), rp = right.map(point => point.x * axis.x + point.y * axis.y);
        if (Math.max(...lp) <= Math.min(...rp) + .25 || Math.max(...rp) <= Math.min(...lp) + .25) return false;
      }
      return true;
    };
    for (const publicQuad of publicQuads) {
      for (const handQuad of handQuads) if (overlaps(publicQuad, handQuad)) issues.push("public kan/North face overlaps the viewer's concealed hand");
      for (const riverQuad of riverQuads) if (overlaps(publicQuad, riverQuad)) issues.push("public kan/North face overlaps a projected river face");
    }

    const images = [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")];
    if (!images.length || images.some(image => !image.complete || image.naturalWidth !== 300 || image.naturalHeight !== 400)) issues.push("a stock face did not load at 300×400");
    if (nuki && (!tray || !surface.contains(tray))) issues.push("persistent North tray left the common surface");
    const nukiCounter = document.querySelector<HTMLElement>(`[data-testid="nuki-${actor}"]`);
    if (nuki && (!nukiCounter || !nukiCounter.textContent?.includes("× 1"))) issues.push("the flat player identity does not retain the public North count");
    const details = document.querySelector<HTMLElement>(`dialog.mahjong-public-melds`);
    if (details && surface.contains(details)) issues.push("public meld details dialog is inside the projected physical surface");

    return { issues, signature, actor: { panelInSurface: surface.contains(panel), meldInSurface: surface.contains(meld), nukiTrayInSurface: tray ? surface.contains(tray) : null,
        handOutsideSurface: !surface.contains(hand), identityOutsideSurface: Boolean(identity && !surface.contains(identity)) },
      tileCount: ownTiles.length, publicFaceCount: publicEls.length, riverFaceCount: riverTiles.length, imageCount: images.length,
      surfaceTransform: getComputedStyle(surface).transform, board: { x:boardBox.x,y:boardBox.y,width:boardBox.width,height:boardBox.height },
      meldRect: (()=>{const rect=meld.getBoundingClientRect();return{x:rect.x,y:rect.y,width:rect.width,height:rect.height};})(),
      trayRect: tray ? (()=>{const rect=tray.getBoundingClientRect();return{x:rect.x,y:rect.y,width:rect.width,height:rect.height};})() : null,
      riverRects: riverTiles.map(tile=>{const rect=tile.getBoundingClientRect();return{x:rect.x,y:rect.y,width:rect.width,height:rect.height};}),
      handRects: ownTiles.map(tile=>{const rect=tile.getBoundingClientRect();return{x:rect.x,y:rect.y,width:rect.width,height:rect.height};}),
      stage, viewer, actorSeat: actor, red, nuki, actorHandCount: expectedActorHandCount, actorRiverCount: expectedActorRiverCount };
  }, { actor: scene.actor, viewer, red: scene.red, nuki: scene.nuki, identityName: names[scene.actor], stage, expectedActorHandCount, expectedActorRiverCount });
  assert.deepEqual(result.issues, [], `${scene.id} viewer=${viewer} ${stage}: public ankan/North projected surface geometry and visibility`);
  assert.equal(result.actor.panelInSurface, true);
  assert.equal(result.actor.meldInSurface, true);
  assert.equal(result.actor.handOutsideSurface, true);
  assert.equal(result.actor.identityOutsideSurface, true);
  if (scene.nuki) assert.equal(result.actor.nukiTrayInSurface, true);
  assert.equal(result.signature.kind, "ankan");
  return result;
}

const evidence: unknown[] = [];
let viewCount = 0, detailCount = 0;
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://mahjong.local/images/**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      const contentType = pathname.endsWith(".svg") ? "image/svg+xml"
        : pathname.endsWith(".webp") ? "image/webp" : pathname.endsWith(".png") ? "image/png" : "application/octet-stream";
      await route.fulfill({ status: 200, contentType, body: readFileSync(`public${pathname}`) });
    });

    for (const scene of scenes) for (let viewer = 0; viewer < scene.capacity; viewer++) for (const size of sizes) {
      const afterKanView = scene.afterKanViews[viewer];
      const afterRiverView = scene.afterRiverViews[viewer];
      await mount(page, roomFor(scene, afterKanView, viewer, 2), viewer, size);
      const actorInitial = await measure(page, scene, viewer, "gangzimo");
      assert.equal(actorInitial.actorHandCount, 11, `${scene.id}: rendered gangzimo view is backed by the pre-discard hand state`);
      assert.equal(actorInitial.actorRiverCount, 0, `${scene.id}: rendered gangzimo view has no discard yet`);
      await page.evaluate(({ room, viewer }) => (window as any).ownPublicApi.render(room, viewer), {
        room: roomFor(scene, afterRiverView, viewer, 3), viewer,
      });
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")]
        .every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
      const riverStage = await measure(page, scene, viewer, "river");
      assert.equal(riverStage.actorHandCount, 10, `${scene.id}: rendered post-discard view has one fewer concealed tile`);
      assert.equal(riverStage.actorRiverCount, 1, `${scene.id}: rendered post-discard view has one river tile`);
      if (viewer === scene.actor) {
        assert.equal(actorInitial.tileCount, 11, `${scene.id}: actor's visible gangzimo hand has 11 tiles`);
        assert.equal(riverStage.tileCount, 10, `${scene.id}: actor's visible hand has 10 tiles after discarding`);
      }
      await page.evaluate(({ room, viewer }) => (window as any).ownPublicApi.render(room, viewer), {
        room: roomFor(scene, afterRiverView, viewer, 4), viewer,
      });
      const quiet = await measure(page, scene, viewer, "river");
      assert.deepEqual(quiet.signature, riverStage.signature, `${scene.id} viewer=${viewer}: quiet render preserves backs/faces/red five`);
      assert.equal(quiet.actor.nukiTrayInSurface, riverStage.actor.nukiTrayInSurface, `${scene.id}: silent render preserves public North surface placement`);
      assert.deepEqual(await page.evaluate(() => (window as any).ownPublicChoices), [], `${scene.id}: mounting and quiet render must not submit a game Choice`);
      if (viewer === 0 && size.width === 844 && (scene.red || scene.nuki)) {
        await page.screenshot({ path: `.local/audit/own-public-surface-${engine.name()}-${scene.id}-viewer0-844.png` });
      }
      evidence.push({ engine: engine.name(), scene: scene.id, viewer, size, actorInitial, riverStage, quiet });
      viewCount++;
      console.log(`PASS ${engine.name()} ${scene.id} viewer=${viewer} ${size.width}x${size.height}: actor hand=${actorInitial.actorHandCount}->${riverStage.actorHandCount}, river=${actorInitial.riverFaceCount}->${riverStage.riverFaceCount}; own private hand outside surface; actor kan/North on surface; 5-point/quads clear; quiet Choice count=0.`);
    }

    for (const scene of scenes) {
      const viewer = 1, size = { width: 844, height: 390 };
      await mount(page, roomFor(scene, scene.afterRiverViews[viewer], viewer, 4), viewer, size);
      const button = page.getByRole("button", { name: `查看${names[scene.actor]}的公开副露`, exact: true });
      assert.equal(await button.count(), 1, `${scene.id}: mounted identity inspect button is available`);
      assert.equal(await button.evaluate(element => document.querySelector('[data-testid="mahjong-table-surface"]')!.contains(element)), false,
        `${scene.id}: identity/inspect button stays flat outside the physical surface`);
      await button.click();
      const dialog = page.getByRole("dialog", { name: `${names[scene.actor]}的公开副露`, exact: true });
      await dialog.waitFor({ state: "visible" });
      assert.equal(await dialog.evaluate(element => document.querySelector('[data-testid="mahjong-table-surface"]')!.contains(element)), false,
        `${scene.id}: readable meld details stay outside the projected table`);
      const detailMeld = dialog.locator(".mahjong-meld--ankan");
      assert.equal(await detailMeld.count(), 1);
      assert.equal(await detailMeld.locator(".mahjong-meld__back").count(), 2);
      assert.deepEqual(await detailMeld.locator(".mahjong-meld__face[data-tile-face]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-tile-face"))),
        scene.red ? ["p0", "p5"] : ["z7", "z7"]);
      if (scene.red) assert.equal(await detailMeld.locator("img[src$='Pin5-Dora.svg']").count(), 1, `${scene.id}: public details retain red-five stock art`);
      if (scene.nuki) {
        assert.equal(await dialog.locator('.mahjong-public-melds__nuki [data-tile-face="z4"]').count(), 1);
        assert.ok((await dialog.locator(".mahjong-public-melds__nuki").textContent())?.includes("拔北 × 1"));
      }
      assert.deepEqual(await page.evaluate(() => (window as any).ownPublicChoices), [], `${scene.id}: identity detail interaction must not submit a game Choice`);
      await page.screenshot({ path: `.local/audit/own-public-details-${engine.name()}-${scene.id}-viewer${viewer}-844.png` });
      await page.getByRole("button", { name: "关闭副露详情", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      detailCount++;
      console.log(`DETAIL ${engine.name()} ${scene.id}: actual identity button opened readable 2-back/2-face ankan/North details with zero Choice submissions.`);
    }
    await page.evaluate(() => (window as any).ownPublicApi.dispose());
  } finally { await browser.close(); }
}

writeFileSync(".local/audit/mahjong-own-public-surface.json", JSON.stringify({ hashes, viewCount, detailCount, evidence }, null, 2) + "\n");
console.log(`PASS ${viewCount} real-engine seat/view/viewport cases and ${detailCount} mounted identity-detail interactions across Chromium/WebKit; each of four scenes used a legal physical-wall kan Choice and reached gangzimo.`);
