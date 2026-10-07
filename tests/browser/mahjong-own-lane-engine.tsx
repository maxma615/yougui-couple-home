// Real-engine own-rack geometry through legal kan choices; this does not open a server or mutate a room.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { GameVariant, GameView, RoomView } from "../../src/modules/mahjong/types";

type RealGame = { view(seat: number): GameView; respond(seat: number, decisionId: string, choiceId: string): void };
type Scene = { id: string; variant: GameVariant; actor: number; game: RealGame; before: GameView; after: GameView; red: boolean; nuki: boolean };

const names = ["甲", "乙", "丙", "丁"];
const tileList = (encoded: string) => [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));

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
    const replacement = available.splice(0, 4), indicators = available.splice(0, 10);
    return new SanmaWall([...dealt.flat(), ...drawn, ...available, ...replacement, ...indicators]);
  }};
}

function riichiWall(hands: Record<number, string>, drawn: string) {
  return { dealer: 0, wallFactory: (rule: ConstructorParameters<typeof Majiang.Shan>[0]) => {
    const wall = new Majiang.Shan(rule), available = wall._pai.slice();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `physical Riichi tile exhausted: ${tile}`);
      available.splice(index, 1);
      return tile;
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

function passPending(game: RealGame, capacity: number, expectedPhase: string) {
  for (let cycle = 0; cycle < capacity + 1; cycle++) {
    if (game.view(0).phase !== expectedPhase) return;
    let passed = false;
    for (let seat = 1; seat < capacity; seat++) {
      const view = game.view(seat), pass = view.choices.find(choice => choice.type === "pass");
      if (pass) {
        game.respond(seat, view.decisionId, pass.id);
        passed = true;
      }
    }
    if (!passed && game.view(0).phase === expectedPhase) break;
  }
  assert.notEqual(game.view(0).phase, expectedPhase, `all legal reactions to ${expectedPhase} must resolve`);
}

function progressKan(sceneId: string, variant: GameVariant, game: RealGame, red: boolean, extractNorth: boolean): Scene {
  const capacity = variant === "sanma" ? 3 : 4;
  if (extractNorth) {
    const initial = game.view(0), nuki = initial.choices.find(choice => choice.type === "nuki");
    assert.ok(nuki, `${sceneId}: engine must offer the physical North extraction`);
    game.respond(0, initial.decisionId, nuki.id);
    passPending(game, capacity, "nuki");
    const nukiDraw = game.view(0);
    assert.equal(nukiDraw.phase, "nukizimo", `${sceneId}: legal North extraction draws a replacement`);
    assert.equal(nukiDraw.players.find(player => player.seat === 0)?.nuki, 1, `${sceneId}: engine records exactly one extracted North`);
  }

  const before = game.view(0);
  assert.equal(before.phase, extractNorth ? "nukizimo" : "zimo", `${sceneId}: kan starts from an ordinary live turn`);
  const kan = before.choices.find(choice => choice.type === "kan" && (red
    ? choice.value?.[0] === "p" && (choice.value.match(/\d/g)?.length ?? 0) === 4 && choice.value.includes("0")
    : choice.value === "z7777"));
  assert.ok(kan, `${sceneId}: real engine must offer the physical ${red ? "red-five" : "ordinary"} closed kan; choices=${JSON.stringify(before.choices)}`);
  game.respond(0, before.decisionId, kan.id);
  passPending(game, capacity, "gang");
  const after = game.view(0);
  assert.equal(after.phase, "gangzimo", `${sceneId}: legal kan proceeds to a replacement draw`);
  assert.equal(after.players.find(player => player.seat === 0)?.melds.length, 1, `${sceneId}: public meld comes from the engine`);
  assert.equal(after.players.flatMap(player => player.melds).filter(meld => (meld.match(/\d/g)?.length ?? 0) === 4).length, 1,
    `${sceneId}: the table contains one actual kan, within the global four-kan limit`);
  assert.equal(after.players.find(player => player.seat === 0)?.nuki ?? 0, extractNorth ? 1 : 0,
    `${sceneId}: the engine's North count persists through the kan`);
  console.log(`ENGINE ${sceneId}: legal ${extractNorth ? "nuki then " : ""}${red ? "red-p5" : "ordinary z7"} kan ${after.players[0].melds[0]}; ${before.phase}->gangzimo; drawn=${after.drawnTile}; globalKans=1; nuki=${after.players[0].nuki ?? 0}.`);
  return { id: sceneId, variant, actor: 0, game, before, after, red, nuki: extractNorth };
}

const scenes: Scene[] = [
  progressKan("sanma-normal-z7", "sanma", new SanmaGame("east", names.slice(0, 3), sanmaWall({
    0: "z777p123s123m19z14",
    1: "p23456s456789z23",
    2: "p789s123456z4565",
  }, ["z7", "s8"])), false, true),
  progressKan("sanma-red-p5", "sanma", new SanmaGame("east", names.slice(0, 3), sanmaWall({
    0: "p0555s123456z123",
  }, ["m1"])), true, false),
  progressKan("yonma-normal-z7", "yonma", new RiichiGame("east", names, riichiWall({
    0: "z777p123s123m19z12",
  }, "z7")), false, false),
  progressKan("yonma-red-p5", "yonma", new RiichiGame("east", names, riichiWall({
    0: "p0555s123456z123",
  }, "m1")), true, false),
];

const harness = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));
window.ownLaneEngineApi={
 render:(room,ownSeat)=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,ownSeat,connected:true,motionCanAnimate:false,host:true,busy:false,onChoice:choice=>window.ownLaneChoices.push(choice),onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}}))))),
 dispose:()=>root.unmount()
};
window.ownLaneChoices=[];`;
const bundle = await build({
  stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const css = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css", "mahjong-table-center.css", "mahjong-table-edge.css"].map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");
const sizes = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1440, height: 810 }];
const measurements: { engine: string; scene: string; width: number; before: Awaited<ReturnType<typeof measure>>; after: Awaited<ReturnType<typeof measure>> }[] = [];

function roomFor(scene: Scene, game: GameView): RoomView {
  const capacity = scene.variant === "sanma" ? 3 : 4;
  return {
    id: `real-own-lane-${scene.id}`, code: "ABCDEFGH", hostUserId: "user-0", mode: "east", variant: scene.variant,
    status: "playing", version: 1, mySeat: 0, game,
    members: Array.from({ length: capacity }, (_, seat) => ({
      userId: `user-${seat}`, displayName: `牌友${seat}`, seat, kind: "human" as const, ready: true, connected: true,
    })),
  };
}

async function measure(page: import("@playwright/test").Page, scene: Scene) {
  const result = await page.evaluate(({ expectNuki }) => {
    const boardEl = document.querySelector(".mahjong-table");
    const handEl = document.querySelector<HTMLElement>('[data-testid="mahjong-hand"]');
    const meldEl = document.querySelector<HTMLElement>(".mahjong-table__own .mahjong-hand-public-melds .mahjong-meld--ankan");
    if (!boardEl || !handEl) throw new Error("real GameRoom table or own hand is not mounted");
    const board = boardEl.getBoundingClientRect();
    const handTiles = [...handEl.querySelectorAll<HTMLElement>("[data-tile-face]")];
    if (!handTiles.length) throw new Error("real own hand has no visible tile faces");
    const boxes = handTiles.map(tile => tile.getBoundingClientRect());
    const nukiTray = document.querySelector<HTMLElement>('.mahjong-table__own [data-testid="nuki-tiles-0"]');
    const nukiTiles = nukiTray ? [...nukiTray.querySelectorAll<HTMLElement>("[data-tile-face]")] : [];
    const tileSlots = [
      ...document.querySelectorAll<HTMLElement>(".mahjong-hand [data-tile-face],.mahjong-hand-public-melds [data-tile-face],.mahjong-hand-public-melds .mahjong-meld__tiles > .mahjong-meld__back,.mahjong-table__own .mahjong-nuki-tray [data-tile-face]"),
    ];
    const issues: string[] = [];
    for (const tile of tileSlots) {
      const box = tile.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0 || box.left < board.left - .5 || box.top < board.top - .5 || box.right > board.right + .5 || box.bottom > board.bottom + .5) {
        issues.push(`tile outside table: ${tile.getAttribute("data-tile-face") || tile.className}`);
      }
      for (const [x, y] of [[.16, .16], [.5, .5], [.84, .16], [.16, .84], [.84, .84]]) {
        const hit = document.elementFromPoint(box.left + box.width * x, box.top + box.height * y);
        if (!hit || !tile.contains(hit)) issues.push(`5-point occlusion ${tile.getAttribute("data-tile-face") || "back"} at ${x},${y} by ${hit?.className || hit?.tagName || "none"}`);
      }
    }
    const art = [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")];
    for (const image of art) if (!image.complete || image.naturalWidth !== 300 || image.naturalHeight !== 400) issues.push(`stock image not loaded at 300x400: ${image.currentSrc || image.src}`);
    if (expectNuki && (!nukiTray || nukiTiles.length !== 1 || nukiTiles[0].dataset.tileFace !== "z4" || !nukiTray.textContent?.includes("拔北 × 1"))) {
      issues.push("the extracted North tile/count is missing from the own persistent tray");
    }
    if (!expectNuki && nukiTray) issues.push("unexpected own North tray for a scene without extraction");
    if (!meldEl) {
      if (document.querySelector(".mahjong-hand-public-melds .mahjong-meld--ankan")) issues.push("unexpected ankan before the engine Choice");
      return {
        issues, firstLeft: (boxes[0].left - board.left) / board.width, firstX: boxes[0].left,
        firstFace: handTiles[0].dataset.tileFace ?? "", lastHandRight: Math.max(...boxes.map(box => box.right)), meldRight: null,
        meldLeft: null, tileCount: handTiles.length, nukiCount: nukiTiles.length, meldCount: 0,
        board: { x: board.x, y: board.y, width: board.width, height: board.height }, stockImageCount: art.length,
      };
    }
    const meld = meldEl.getBoundingClientRect();
    const canonicalMeld = meldEl.getAttribute("data-meld") || meldEl.getAttribute("aria-label") || "";
    return {
      issues, firstLeft: (boxes[0].left - board.left) / board.width, firstX: boxes[0].left,
      firstFace: handTiles[0].dataset.tileFace ?? "", lastHandRight: Math.max(...boxes.map(box => box.right)),
      meldRight: (meld.right - board.left) / board.width, meldLeft: meld.left,
      tileCount: handTiles.length, nukiCount: nukiTiles.length, meldCount: 1, canonicalMeld,
      board: { x: board.x, y: board.y, width: board.width, height: board.height }, stockImageCount: art.length,
    };
  }, { expectNuki: scene.nuki });
  assert.deepEqual(result.issues, [], `${scene.id}: actual stock art, own rack, meld, North tray and 5-point visibility`);
  return result;
}

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://mahjong.local/images/**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      await route.fulfill({ status: 200, contentType: pathname.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync(`public${pathname}`) });
    });
    for (const scene of scenes) for (const size of sizes) {
      await page.setViewportSize(size);
      await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><div id="root"></div>`);
      await page.addScriptTag({ content: `globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}` });
      const beforeRoom = roomFor(scene, scene.before);
      await page.evaluate(({ room }) => (window as any).ownLaneEngineApi.render(room, 0), { room: beforeRoom });
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
      const before = await measure(page, scene);
      assert.equal(before.meldCount, 0, `${scene.id}: pre-kan view contains no ankan`);
      assert.ok(before.firstLeft > .11 && before.firstLeft < .14, `${engine.name()} ${scene.id} ${size.width}: pre-kan concealed hand starts in the stable left lane, got ${before.firstLeft}`);
      assert.ok(before.tileCount >= 13, `${scene.id}: pre-kan concealed hand has the legal live-hand tile count`);

      const afterRoom = roomFor(scene, scene.after);
      await page.evaluate(({ room }) => (window as any).ownLaneEngineApi.render(room, 0), { room: afterRoom });
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
      const after = await measure(page, scene);
      assert.equal(after.meldCount, 1, `${scene.id}: post-kan view renders the actual public ankan`);
      assert.equal(after.tileCount, 11, `${scene.id}: post-kan concealed hand has 11 faces after one meld`);
      assert.ok(Math.abs(after.firstX - before.firstX) <= 1, `${engine.name()} ${scene.id} ${size.width}: kan must not shift the first concealed tile (${before.firstX} -> ${after.firstX})`);
      assert.ok(after.firstLeft > .11 && after.firstLeft < .14, `${engine.name()} ${scene.id} ${size.width}: post-kan concealed hand stays in the left lane, got ${after.firstLeft}`);
      assert.ok(after.meldRight !== null && after.meldRight >= .92 && after.meldRight <= .96,
        `${engine.name()} ${scene.id} ${size.width}: real public meld stays near the right edge, got ${after.meldRight}`);
      assert.ok(after.meldLeft !== null && after.lastHandRight + 4 < after.meldLeft,
        `${engine.name()} ${scene.id} ${size.width}: actual hand faces and meld group have separate non-overlapping lanes (${after.lastHandRight} / ${after.meldLeft})`);

      // Render an identical public engine snapshot to ensure the visual geometry/tray persists without a new Choice.
      await page.evaluate(({ room }) => (window as any).ownLaneEngineApi.render(room, 0), { room: afterRoom });
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
      const rerender = await measure(page, scene);
      assert.equal(rerender.firstX, after.firstX, `${scene.id}: silent render preserves the own hand anchor`);
      assert.equal(rerender.meldRight, after.meldRight, `${scene.id}: silent render preserves the meld right anchor`);
      assert.equal(rerender.nukiCount, scene.nuki ? 1 : 0, `${scene.id}: silent render preserves the extracted North tray`);
      assert.deepEqual(await page.evaluate(() => (window as any).ownLaneChoices), [], `${scene.id}: rendering and rerendering must submit no game Choice`);
      if (size.width === 844 && scene.red) {
        await page.screenshot({ path: `.local/audit/own-lane-engine-${scene.id}-${engine.name()}-844.png` });
      }
      measurements.push({ engine: engine.name(), scene: scene.id, width: size.width, before, after });
      console.log(`PASS ${engine.name()} ${scene.id} ${size.width}x${size.height}: first ${before.firstLeft.toFixed(4)} -> ${after.firstLeft.toFixed(4)} (${(after.firstX - before.firstX).toFixed(2)}px); meldRight=${after.meldRight!.toFixed(4)}; faces=${after.tileCount}; nuki=${after.nukiCount}; art=${after.stockImageCount}.`);
    }
    await page.evaluate(() => (window as any).ownLaneEngineApi.dispose());
  } finally { await browser.close(); }
}

console.log(`PASS ${measurements.length} real engine before/after geometry pairs across Chromium and WebKit at 667×375, 844×390, 1440×810.`);
console.log("Actual progression: Sanma North extraction and ordinary z7 ankan, Sanma red-p5 ankan, Riichi ordinary z7 ankan, Riichi red-p5 ankan; every kan used an offered Choice and reached gangzimo from a physical wall.");
