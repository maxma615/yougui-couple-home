// Real-engine acceptance through the live interactive hand in Chromium/WebKit.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit, type Page } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import type { Choice, GameView, RoomView } from "../../src/modules/mahjong/types";

type RealRoom = { room: RoomView; game: RiichiGame };
type Rect = { x: number; y: number; width: number; height: number };
type HandSample = { id: string; face: string; rect: Rect };

const names = ["甲", "乙", "丙", "丁"];
const tileList = (encoded: string) => [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));

function riichiWall(hand: string, drawn: string) {
  return { dealer: 0, wallFactory: (rule: ConstructorParameters<typeof Majiang.Shan>[0]) => {
    const wall = new Majiang.Shan(rule), available = wall._pai.slice();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `physical Riichi tile exhausted: ${tile}`);
      available.splice(index, 1);
      return tile;
    };
    const dealt: string[][] = [tileList(hand).map(take), [], [], []];
    take(drawn);
    for (let seat = 1; seat < 4; seat++) dealt[seat] = available.splice(0, 13);
    wall._pai = [...available, ...[...dealt.flat(), drawn].reverse()];
    wall._baopai = [wall._pai[4]];
    wall._fubaopai = [wall._pai[9]];
    return wall;
  } };
}

function realRoom(game: RiichiGame, version = 10): RoomView {
  return {
    id: "browser-hand-reflow", code: "ABCDEFGH", hostUserId: "user-0", mode: "east", variant: "yonma",
    status: "playing", version, mySeat: 0, game: game.view(0),
    members: names.map((displayName, seat) => ({ userId: `user-${seat}`, displayName, seat, kind: "human", ready: true, connected: true })),
  };
}

async function sampleHand(page: Page): Promise<HandSample[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.mahjong-hand button[data-hand-instance-id]')].map(element => {
    const rect = element.getBoundingClientRect();
    return {
      id: element.dataset.handInstanceId || "",
      face: element.dataset.tileFace || "",
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }));
}

const harness = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));
window.handReflowChoices=[];
window.handReflowApi={
 render:(room,options={})=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{
  room,ownSeat:0,host:true,busy:false,connected:options.connected??true,motionCanAnimate:options.canAnimate??false,motionIntent:options.intent??null,
  onChoice:(choice,intent)=>window.handReflowChoices.push({choice,intent}),onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}
 }))))),
 dispose:()=>root.unmount()
};`;

const bundle = await build({
  stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const css = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css", "mahjong-table-center.css", "mahjong-table-edge.css", "mahjong-camera.css"]
  .map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");

async function mount(page: Page, room: RoomView, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setContent(`<base href="https://mahjong.local/"><style>*{box-sizing:border-box}body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}${css}</style><div id="root"></div>`);
  await page.addScriptTag({ content: `globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}` });
  await page.evaluate(value => (window as any).handReflowApi.render(value), room);
  await page.getByTestId("mahjong-board").waitFor({ state: "visible" });
}

function ordinaryDuplicateRoom(): RealRoom {
  // The closed and drawn ordinary 5-pin copies remain distinct from the exact red 5.
  const game = new RiichiGame("east", names, riichiWall("m1p055s123456z123", "p5"));
  return { game, room: realRoom(game) };
}

function riichiDuplicateRoom(): RealRoom {
  // A legal riichi hand contains repeated Easts and a drawn East matching a closed East.
  const game = new RiichiGame("east", names, riichiWall("m123p123s123z1112", "z2"));
  return { game, room: realRoom(game) };
}

const movedOrigins = (before: HandSample[], after: HandSample[], discardedId: string) => {
  const queues = new Map<string, HandSample[]>();
  for (const sample of before) {
    if (sample.id === discardedId) continue;
    const queue = queues.get(sample.face) || [];
    queue.push(sample);
    queues.set(sample.face, queue);
  }
  return after.flatMap(target => {
    const source = queues.get(target.face)?.shift();
    return source ? [{ source, target }] : [];
  });
};

async function sampleReflowAnimations(page: Page, origins: ReturnType<typeof movedOrigins>) {
  return page.evaluate(async expected => {
    const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const hand = document.querySelector<HTMLElement>(".mahjong-hand");
    if (!hand) throw new Error("own hand is missing after accepted discard");
    const findTarget = (id: string) => [...hand.querySelectorAll<HTMLElement>("button[data-hand-instance-id]")]
      .find(element => element.dataset.handInstanceId === id);
    const animations = [...hand.querySelectorAll<HTMLElement>("button[data-hand-instance-id]")]
      .flatMap(element => element.getAnimations().filter(animation => animation.id.startsWith("mahjong-hand-reflow:")));
    for (const animation of animations) { animation.pause(); animation.currentTime = Number(animation.effect?.getComputedTiming().duration); }
    await raf();
    const read = (element: HTMLElement) => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; };
    const destinations = [...hand.querySelectorAll<HTMLElement>("button[data-hand-instance-id]")].map(element => ({ id: element.dataset.handInstanceId || "", face: element.dataset.tileFace || "", rect: read(element) }));
    for (const animation of animations) { animation.currentTime = 0; }
    await raf();
    const records = [] as Array<{ sourceId: string; targetId: string; duration: number; start: Rect; middle: Rect; end: Rect; animation: Animation }>;
    for (const item of expected) {
      if (Math.hypot(item.target.rect.x - item.source.rect.x, item.target.rect.y - item.source.rect.y) < .5) continue;
      const target = findTarget(item.target.id);
      const animation = target?.getAnimations().find(candidate => candidate.id === `mahjong-hand-reflow:${encodeURIComponent(item.source.id)}`);
      if (!target || !animation) continue;
      animation.pause();
      const duration = Number(animation.effect?.getComputedTiming().duration);
      animation.currentTime = 0; await raf(); const start = read(target);
      animation.currentTime = duration / 2; await raf(); const middle = read(target);
      animation.currentTime = duration - .1; await raf(); const end = read(target);
      animation.currentTime = duration * .3; await raf();
      records.push({ sourceId: item.source.id, targetId: item.target.id, duration, start, middle, end, animation });
    }
    for (const animation of animations) animation.play();
    return { destinations, records: records.map(({ animation: _animation, ...record }) => record), activeCount: animations.length };
  }, origins);
}

async function finalHandPositions(page: Page): Promise<{ samples: HandSample[]; activeCount: number }> {
  return page.evaluate(async () => {
    const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const hand = document.querySelector<HTMLElement>(".mahjong-hand");
    if (!hand) throw new Error("own hand is missing after accepted discard");
    const animations = [...hand.querySelectorAll<HTMLElement>("button[data-hand-instance-id]")]
      .flatMap(element => element.getAnimations().filter(animation => animation.id.startsWith("mahjong-hand-reflow:")));
    for (const animation of animations) { animation.pause(); animation.currentTime = Number(animation.effect?.getComputedTiming().duration); }
    await raf();
    const samples = [...hand.querySelectorAll<HTMLElement>("button[data-hand-instance-id]")].map(element => {
      const rect = element.getBoundingClientRect();
      return { id: element.dataset.handInstanceId || "", face: element.dataset.tileFace || "", rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    });
    for (const animation of animations) animation.currentTime = 0;
    await raf();
    return { samples, activeCount: animations.length };
  });
}

const delta = (left: Rect, right: Rect) => Math.hypot(left.x - right.x, left.y - right.y);

async function runAcceptedDiscard(page: Page, kind: "ordinary-double-tap" | "riichi-drag", viewport: { width: number; height: number }) {
  let pointerCaptureAtDown = false;
  let pointerCaptureAtTarget = false;
  let postDiscardHandInputEnabled: boolean | null = null;
  let quietUpdatePreserved: number | null = null;
  let finiteMotionReleased: boolean | null = null;
  let reconnectReplayCount: number | null = null;
  const fixture = kind === "ordinary-double-tap" ? ordinaryDuplicateRoom() : riichiDuplicateRoom();
  const beforeRoom = fixture.room;
  await mount(page, beforeRoom, viewport);
  const before = await sampleHand(page);
  let tile = kind === "ordinary-double-tap"
    ? page.locator('.mahjong-hand > button[data-tile-face="p5"]').nth(1)
    : page.locator('.mahjong-hand > button[data-tile-face="z1"]').nth(1);
  if (kind === "riichi-drag") {
    assert.ok(beforeRoom.game!.choices.some(choice => choice.id === "riichi:z1"), "real engine must authorize riichi on the selected duplicate");
    await page.getByRole("button", { name: "立直", exact: true }).click();
    tile = page.locator('.mahjong-hand > button[data-tile-face="z1"][data-choice-type="riichi"]').nth(1);
  }
  const sourceId = await tile.getAttribute("data-hand-instance-id");
  assert.ok(sourceId, `${kind}: selected tile must have its actual pre-discard instance ID`);
  let inputOrigin: Rect;
  if (kind === "ordinary-double-tap") {
    await tile.click();
    assert.deepEqual(await page.evaluate(() => (window as any).handReflowChoices), [], "first tap only selects and cannot reflow the hand");
    await page.waitForTimeout(150);
    const selectedBox = await tile.boundingBox();
    assert.ok(selectedBox);
    inputOrigin = { x: selectedBox.x, y: selectedBox.y, width: selectedBox.width, height: selectedBox.height };
    await tile.click();
  } else {
    await tile.hover();
    await page.waitForTimeout(160);
    const start = await tile.boundingBox();
    const target = await page.locator(".mahjong-table__center").boundingBox();
    assert.ok(start && target, "real drag needs both the source tile and table target geometry");
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    const captureAtPointerDown = await page.evaluate(id => document.querySelector<HTMLElement>(`[data-hand-instance-id="${id}"]`)?.hasPointerCapture(1), sourceId);
    assert.equal(captureAtPointerDown, true, `${kind}: the real input must capture its original tile before reflow measurement`);
    pointerCaptureAtDown = captureAtPointerDown;
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.waitForTimeout(50);
    const dragState = await page.evaluate(({ x, y, id }) => {
      const source = document.querySelector<HTMLElement>(`[data-hand-instance-id="${id}"]`);
      return {
        boardClass: document.querySelector('[data-testid="mahjong-board"]')?.className,
        hit: document.elementFromPoint(x, y)?.className,
        source: source?.getBoundingClientRect().toJSON(),
        sourceClass: source?.className,
        captured: source?.hasPointerCapture(1),
      };
    }, { x: target.x + target.width / 2, y: target.y + target.height / 2, id: sourceId });
    assert.ok(dragState.boardClass?.includes("is-discard-target"), `${kind}: real drag reached the table target (${JSON.stringify(dragState)})`);
    assert.equal(dragState.captured, true, `${kind}: pointer capture must continue through movement over the table`);
    pointerCaptureAtTarget = dragState.captured;
    const hit = await page.evaluate(({ x, y }) => {
      const center = document.querySelector(".mahjong-table__center");
      const actual = document.elementFromPoint(x, y);
      return Boolean(center && actual && center.contains(actual));
    }, { x: target.x + target.width / 2, y: target.y + target.height / 2 });
    assert.equal(hit, true, "the actual table discard area must remain reachable during a drag");
    const dragged = await tile.boundingBox();
    assert.ok(dragged);
    inputOrigin = { x: dragged.x, y: dragged.y, width: dragged.width, height: dragged.height };
    await page.mouse.up();
  }
  const submitted = await page.evaluate(() => (window as any).handReflowChoices[0]);
  assert.deepEqual(submitted?.choice, kind === "ordinary-double-tap"
    ? { id: "discard:p5", type: "discard", value: "p5" }
    : { id: "riichi:z1", type: "riichi", value: "z1" }, `${kind}: the accepted action must retain the engine's original Choice`);
  assert.equal(submitted?.intent?.sourceTileId, sourceId, `${kind}: intent must retain the exact selected physical duplicate`);
  assert.ok(Math.hypot(submitted.intent.sourceRect.left - inputOrigin.x, submitted.intent.sourceRect.top - inputOrigin.y) < 1.5,
    `${kind}: the existing discard flight origin must match the actual selected/dragged tile`);
  await page.mouse.move(5, 5);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".mahjong-hand button")]
    .flatMap(element => element.getAnimations().filter(animation => animation.id.startsWith("mahjong-hand-reflow:"))).length), 0,
  `${kind}: selection or a sent Choice alone cannot start reflow`);

  fixture.game.respond(0, beforeRoom.game!.decisionId, submitted.choice.id);
  const afterRoom = { ...beforeRoom, version: beforeRoom.version + 1, game: fixture.game.view(0) };
  await page.evaluate(value => (window as any).handReflowApi.render(value.room, { canAnimate: true, intent: value.intent }), { room: afterRoom, intent: submitted.intent });
  const finalLayout = await finalHandPositions(page);
  const after = finalLayout.samples;
  const origins = movedOrigins(before, after, sourceId);
  const maxJump = Math.max(0, ...origins.map(({ source, target }) => delta(source.rect, target.rect)));
  const drawPair = origins.find(({ source }) => source.id.startsWith("drawn:"));
  const drawJump = drawPair ? delta(drawPair.source.rect, drawPair.target.rect) : 0;
  const animationSample = await sampleReflowAnimations(page, origins);
  const moved = origins.filter(({ source, target }) => delta(source.rect, target.rect) >= .5);
  console.log(`${kind} ${page.context().browser()?.browserType().name()}: movedOccurrences=${moved.length}, maxLayoutDisplacementPx=${maxJump.toFixed(2)}, drawnTileDisplacementPx=${drawJump.toFixed(2)}, activeReflowAnimations=${animationSample.activeCount}`);
  assert.equal(animationSample.activeCount, moved.length, `${kind}: each moved source occurrence must have one finite animation`);
  assert.equal(animationSample.records.length, moved.length, `${kind}: each physical occurrence must expose a real WAAPI transition`);
  for (const record of animationSample.records) {
    const expected = moved.find(item => item.source.id === record.sourceId && item.target.id === record.targetId);
    assert.ok(expected, `${kind}: animation must name an actual source occurrence`);
    assert.equal(record.duration, 250, `${kind}: reflow must be finite`);
    assert.ok(delta(record.start, expected.source.rect) < 1.5, `${kind}: animation starts at its physical source position (${JSON.stringify({ source: expected.source, target: expected.target, start: record.start, middle: record.middle, end: record.end })})`);
    assert.ok(delta(record.middle, expected.source.rect) > 1, `${kind}: a real browser frame moves away from the source`);
    assert.ok(delta(record.middle, animationSample.destinations.find(target => target.id === record.targetId)!.rect) > 1,
      `${kind}: a real browser frame still has distance to the authoritative target`);
    assert.ok(delta(record.end, animationSample.destinations.find(target => target.id === record.targetId)!.rect) < 1.5,
      `${kind}: animation ends at the authoritative sorted-hand position`);
  }
  assert.deepEqual(after.map(sample => sample.face), afterRoom.game!.hand,
    `${kind}: the visible target order must remain the authoritative engine hand order`);
  if (kind === "ordinary-double-tap") {
    assert.ok(after.some(sample => sample.face === "p0"), "normal discard must preserve the exact red five face");
    const sameFaceCopies = origins.filter(({ source }) => source.face === "p5");
    assert.equal(sameFaceCopies.length, 2, "the surviving closed and drawn ordinary fives must each map to one physical source");
    assert.equal(new Set(sameFaceCopies.map(({ source }) => source.id)).size, 2, "duplicate faces must remain distinct occurrences");
    assert.ok(sameFaceCopies.some(({ source }) => source.id.startsWith("drawn:")), "the matching drawn copy must retain its own source position");
    assert.ok(animationSample.records.some(record => record.sourceId.startsWith("drawn:")), "the drawn occurrence must animate into the sorted hand");

    const quietRoom = { ...afterRoom, version: afterRoom.version + 1 };
    await page.evaluate(value => (window as any).handReflowApi.render(value.room, { canAnimate: true, intent: value.intent }), { room: quietRoom, intent: submitted.intent });
    const quietCount = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".mahjong-hand button")]
      .flatMap(element => element.getAnimations().filter(animation => animation.id.startsWith("mahjong-hand-reflow:"))).length);
    assert.equal(quietCount, moved.length, "a quiet room refresh must preserve a live reflow");
    quietUpdatePreserved = quietCount;
    await page.waitForTimeout(280);
    const afterFiniteMotionCount = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".mahjong-hand button")]
      .flatMap(element => element.getAnimations().filter(animation => animation.id.startsWith("mahjong-hand-reflow:"))).length);
    assert.equal(afterFiniteMotionCount, 0,
    "the browser animation must finish and release its individual translate effect");
    finiteMotionReleased = afterFiniteMotionCount === 0;

    // Reconnecting to the same accepted snapshot and later drawing must never replay this transition.
    await page.evaluate(value => (window as any).handReflowApi.render(value, { connected: false, canAnimate: false }), quietRoom);
    await page.evaluate(value => (window as any).handReflowApi.render(value.room, { connected: true, canAnimate: true, intent: value.intent }), { room: quietRoom, intent: submitted.intent });
    reconnectReplayCount = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".mahjong-hand button")]
      .flatMap(element => element.getAnimations().filter(animation => animation.id.startsWith("mahjong-hand-reflow:"))).length);
    assert.equal(reconnectReplayCount, 0,
    "reconnect and a duplicate accepted snapshot must not replay hand motion");
  } else {
    const movedTile = moved.find(({ target }) => target.id === animationSample.records[0]?.targetId)?.target;
    assert.ok(movedTile, "riichi drag scenario must produce at least one moved target for immediate input cancellation");
    const liveTile = page.locator(`.mahjong-hand button[data-hand-instance-id="${movedTile.id}"]`);
    const liveTileState = { enabled: await liveTile.isEnabled(), choiceType: await liveTile.getAttribute("data-choice-type"), className: await liveTile.getAttribute("class") };
    postDiscardHandInputEnabled = liveTileState.enabled;
    if (liveTileState.enabled) {
      const box = await liveTile.boundingBox();
      assert.ok(box);
      const hit = await page.evaluate(({ x, y, id }) => {
        const element = document.querySelector<HTMLElement>(`.mahjong-hand button[data-hand-instance-id="${id}"]`);
        return Boolean(element && element.contains(document.elementFromPoint(x, y)));
      }, { x: box.x + box.width / 2, y: box.y + box.height / 2, id: movedTile.id });
      assert.equal(hit, true, "the animated tile's actual visual hit region must remain interactive");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      assert.equal(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".mahjong-hand button")]
        .flatMap(element => element.getAnimations().filter(animation => animation.id.startsWith("mahjong-hand-reflow:"))).length), 0,
      `the first real hand pointer input must cancel reflow synchronously (${JSON.stringify(liveTileState)})`);
      await page.mouse.up();
      assert.equal((await page.evaluate(() => (window as any).handReflowChoices)).length, 1, "new hand input cannot accidentally submit a second Choice");
    } else {
      assert.equal(liveTileState.choiceType, null, "the next seat owns the turn after an accepted riichi discard");
    }
  }
  const engine = page.context().browser()?.browserType().name() ?? "unknown";
  const evidence = {
    engine,
    scenario: kind,
    viewport,
    selectedSourceId: sourceId,
    acceptedChoice: submitted.choice,
    maxLayoutDisplacementPx: maxJump,
    drawnTileDisplacementPx: drawJump,
    sourceToTargetOccurrences: origins,
    activeFiniteAnimations: animationSample.records.map(({ sourceId: fromId, targetId, duration, start, middle, end }) => ({ sourceId: fromId, targetId, duration, start, middle, end })),
    pointerCaptureAtDown,
    pointerCaptureAtTableTarget: pointerCaptureAtTarget,
    quietUpdatePreserved,
    finiteMotionReleased,
    reconnectReplayCount,
    postDiscardHandInputEnabled,
  };
  mkdirSync(".local/audit", { recursive: true });
  const evidencePath = `.local/audit/hand-reflow-${engine}-${kind}-${viewport.width}x${viewport.height}.json`;
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`EVIDENCE ${evidencePath}`);
  return evidence;
}

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const viewport of [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1440, height: 810 }]) {
      for (const kind of ["ordinary-double-tap", "riichi-drag"] as const) {
        const page = await browser.newPage({ viewport });
        await page.route("https://mahjong.local/images/**", route => {
          const pathname = new URL(route.request().url()).pathname;
          return route.fulfill({ status: 200, contentType: pathname.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync(`public${pathname}`) });
        });
        try { await runAcceptedDiscard(page, kind, viewport); }
        finally { await page.close(); }
      }
    }
  } finally {
    await browser.close();
  }
}
