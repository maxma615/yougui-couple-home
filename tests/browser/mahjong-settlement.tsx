// Real engine settlements rendered through GameRoom + the production Mahjong CSS.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit, type Page } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { GameVariant, GameView, RoomView, Settlement } from "../../src/modules/mahjong/types";

type Fixture = { name: string; variant: GameVariant; game: GameView; settlement: Settlement; room: RoomView; closed: string[]; melds: string[][]; winningTile: string; title: string };
const names = ["甲", "乙", "丙", "丁"];
const viewports = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1440, height: 810 }];
const tiles = (encoded: string) => [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));

function sanmaWall(hands: Record<number, string>, draws: string[]) {
  const physical = sanmaTiles(), available = physical.slice();
  const take = (tile: string) => {
    const index = available.indexOf(tile);
    assert.ok(index >= 0, `physical Sanma fixture is missing ${tile}`);
    return available.splice(index, 1)[0];
  };
  const dealt = Array.from({ length: 3 }, (_, seat) => hands[seat] ? tiles(hands[seat]).map(take) : []);
  const drawn = draws.map(take);
  for (const hand of dealt) if (!hand.length) hand.push(...available.splice(0, 13));
  assert.deepEqual(dealt.map(hand => hand.length), [13, 13, 13], "Sanma starts with three physical thirteen-tile hands");
  const reserve = available.splice(0, 4), indicators = available.splice(0, 10);
  const ordered = [...dealt.flat(), ...drawn, ...available, ...reserve, ...indicators];
  assert.deepEqual(ordered.slice().sort(), physical.slice().sort(), "Sanma wall conserves every physical tile, including red fives");
  return new SanmaWall(ordered);
}

function riichiWall(hand: string, drawnTile: string) {
  return { dealer: 0, wallFactory: (rule: ConstructorParameters<typeof Majiang.Shan>[0]) => {
    const wall = new Majiang.Shan(rule), physical = wall._pai.slice(), available = wall._pai.slice();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `physical Riichi fixture is missing ${tile}`);
      return available.splice(index, 1)[0];
    };
    const dealt = Array.from({ length: 4 }, () => [] as string[]);
    dealt[0] = tiles(hand).map(take);
    const draw = take(drawnTile);
    for (let seat = 1; seat < 4; seat++) dealt[seat] = available.splice(0, 13);
    assert.deepEqual(dealt.map(value => value.length), [13, 13, 13, 13]);
    wall._pai = [...available, ...[...dealt.flat(), draw].reverse()];
    assert.deepEqual(wall._pai.slice().sort(), physical.slice().sort(), "Riichi wall conserves all physical tiles, including red fives");
    wall._baopai = [wall._pai[4]];
    wall._fubaopai = [wall._pai[9]];
    return wall;
  } };
}

function room(game: GameView, variant: GameVariant, ownSeat: number, name: string): RoomView {
  const capacity = variant === "sanma" ? 3 : 4;
  return {
    id: `settlement-${name}`, code: "ABCDEFGH", hostUserId: `user-${ownSeat}`, variant, mode: "east", status: "playing", version: 1, mySeat: ownSeat,
    game,
    members: names.slice(0, capacity).map((displayName, seat) => ({ userId: `user-${seat}`, displayName, seat, kind: seat === ownSeat ? "human" : "bot", ready: true, connected: true })),
  };
}

function assertSettlement(settlement: Settlement, method: "ron" | "tsumo", tile: string) {
  assert.equal(settlement.kind, "win");
  assert.equal(settlement.winMethod, method);
  assert.equal(settlement.winningTile, tile);
  const [encodedClosed = "", ...encodedMelds] = (settlement.hand ?? "").split(",");
  const melds = encodedMelds.map(tiles);
  const closed = tiles(encodedClosed);
  // Yonma's engine encoding includes its tsumo tile. Sanma keeps the winning
  // tile out of the concealed encoding, including when the winner has a meld.
  if (method === "tsumo" && closed.length === 14 - melds.length * 3) {
    const index = closed.lastIndexOf(tile);
    assert.ok(index >= 0, "the real drawn winning tile must be present in the Riichi concealed hand");
    closed.splice(index, 1);
  }
  assert.equal(closed.length, 13 - melds.length * 3);
  return { closed, melds };
}

function closedSanmaRon(): Fixture {
  const game = new SanmaGame("east", names.slice(0, 3), { dealer: 0, wallFactory: () => sanmaWall({
    0: "m19p19s123z234567", 1: "p123s123456789z5", 2: "m119p246s246z2346",
  }, ["z5"]) });
  const dealer = game.view(0), discard = dealer.choices.find(choice => choice.type === "discard" && choice.value === "z5_");
  assert.ok(discard, "dealer has a real legal z5 tsumogiri Choice");
  game.respond(0, dealer.decisionId, discard.id);
  const response = game.view(1), ron = response.choices.find(choice => choice.type === "ron");
  assert.ok(ron, "seat 1 has a legal closed-hand ron Choice");
  game.respond(1, response.decisionId, ron.id);
  const view = game.view(1), settlement = view.settlement!;
  const parts = assertSettlement(settlement, "ron", "z5");
  return { name: "sanma-closed-ron", variant: "sanma", game: view, settlement, room: room(view, "sanma", 1, "closed-ron"), ...parts, winningTile: "z5", title: "荣和" };
}

function openSanmaRon(): Fixture {
  const game = new SanmaGame("east", names.slice(0, 3), { dealer: 0, wallFactory: () => sanmaWall({
    0: "m1p123s456z234567", 1: "z11p123s123456z56", 2: "m119p246s246z2346",
  }, ["z1", "z5"]) });
  const opening = game.view(0), east = opening.choices.find(choice => choice.type === "discard" && choice.value === "z1_");
  assert.ok(east, "dealer has a real legal East discard Choice");
  game.respond(0, opening.decisionId, east.id);
  const response = game.view(1), pon = response.choices.find(choice => choice.type === "pon" && choice.value === "z111-");
  assert.ok(pon, "seat 1 has a legal East pon Choice");
  game.respond(1, response.decisionId, pon.id);
  assert.deepEqual(game.view(1).players.find(player => player.seat === 1)?.melds, ["z111-"], "the open group must come from the real engine state");
  const caller = game.view(1), discard = caller.choices.find(choice => choice.type === "discard" && choice.value === "z6");
  assert.ok(discard, "the caller has a real legal post-pon discard Choice");
  game.respond(1, caller.decisionId, discard.id);
  const next = game.view(2), discardDraw = next.choices.find(choice => choice.type === "discard" && choice.value === "z5_");
  assert.ok(discardDraw, "seat 2 physically draws z5 and has a legal discard Choice");
  game.respond(2, next.decisionId, discardDraw.id);
  const winner = game.view(1), ron = winner.choices.find(choice => choice.type === "ron");
  assert.ok(ron, "the open hand has a legal ron Choice");
  game.respond(1, winner.decisionId, ron.id);
  const view = game.view(1), settlement = view.settlement!;
  assert.equal(settlement.hand?.split(",").length, 2, "the settlement must preserve its actual meld encoding");
  assert.equal(settlement.hand?.split(",")[1], "z111-");
  const parts = assertSettlement(settlement, "ron", "z5");
  assert.deepEqual(parts.melds, [["z1", "z1", "z1"]]);
  return { name: "sanma-open-ron", variant: "sanma", game: view, settlement, room: room(view, "sanma", 1, "open-ron"), ...parts, winningTile: "z5", title: "荣和" };
}

function riichiTsumo(): Fixture {
  const game = new RiichiGame("east", names, riichiWall("m123p123s123z1112", "z2"));
  const turn = game.view(0), tsumo = turn.choices.find(choice => choice.type === "tsumo");
  assert.equal(turn.drawnTile, "z2", "the winning tile must be the real wall draw");
  assert.ok(tsumo, "the real engine provides a legal tsumo Choice");
  game.respond(0, turn.decisionId, tsumo.id);
  const view = game.view(0), settlement = view.settlement!;
  const parts = assertSettlement(settlement, "tsumo", "z2");
  return { name: "riichi-tsumo", variant: "yonma", game: view, settlement, room: room(view, "yonma", 0, "tsumo"), ...parts, winningTile: "z2", title: "自摸" };
}

const fixtures = [closedSanmaRon(), openSanmaRon(), riichiTsumo()];
const harness = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));
window.settlementApi={
 render:room=>flushSync(()=>root.render(
  React.createElement('main',{className:'mahjong-page'},
   React.createElement('div',{className:'mahjong-shell'},
    React.createElement(GameRoom,{room,ownSeat:room.mySeat,connected:true,motionCanAnimate:false,host:true,busy:false,onChoice:()=>{},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})
   )
  )
 )),
 dispose:()=>root.unmount()
};`;
const bundle = await build({ stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
const css = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css", "mahjong-table-center.css", "mahjong-table-edge.css", "mahjong-camera.css"]
  .map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");
const script = `globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}`;

async function mount(page: Page, fixture: Fixture, width: number, height: number) {
  await page.goto("about:blank");
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*{box-sizing:border-box}${css}</style><div id="root"></div>`);
  await page.addScriptTag({ content: script });
  await page.evaluate(room => (window as any).settlementApi.render(room), fixture.room);
  await page.getByRole("region", { name: "本局结算" }).waitFor({ state: "visible", timeout: 5000 });
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".mahjong-winning-hand img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

function faceList(encoded: string[]) { return encoded.slice().sort(); }

async function inspect(page: Page, fixture: Fixture) {
  const result = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[aria-label="本局结算"]')!;
    const row = panel.querySelector<HTMLElement>(".mahjong-winning-hand__row")!;
    const closed = panel.querySelector<HTMLElement>('[role="group"][aria-label="闭手"]')!;
    const winning = panel.querySelector<HTMLElement>('[data-testid="mahjong-winning-tile"]')!;
    const meldWrapper = panel.querySelector<HTMLElement>(".mahjong-winning-hand__melds");
    const parts = [closed, winning, ...(meldWrapper ? [...meldWrapper.children] as HTMLElement[] : [])];
    const rect = (node: Element) => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
    const boxes = parts.map(rect);
    const gaps = boxes.slice(1).map((box, index) => box.x - boxes[index].right);
    const overlaps = boxes.flatMap((a, i) => boxes.slice(i + 1).map((b, j) => ({ i, j: i + 1 + j, area: Math.max(0, Math.min(a.right,b.right)-Math.max(a.x,b.x)) * Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)) }))).filter(pair => pair.area > 1);
    const rowBox = rect(row), faces = [...panel.querySelectorAll<HTMLElement>(".mahjong-winning-hand [data-tile-face]")], lastFace = faces.at(-1)!;
    const initialLast = rect(lastFace), initialScroll = { client: row.clientWidth, scroll: row.scrollWidth, overflow: getComputedStyle(row).overflowX };
    row.scrollLeft = row.scrollWidth;
    const scrolledLast = rect(lastFace), scrolledLeft = row.scrollLeft;
    const images = [...panel.querySelectorAll<HTMLImageElement>(".mahjong-winning-hand img.mahjong-tile__art")].map(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }));
    return {
      title: panel.querySelector("h2")?.textContent?.trim(),
      totalFaces: panel.querySelectorAll(".mahjong-winning-hand [data-tile-face]").length,
      closedFaces: [...closed.querySelectorAll<HTMLElement>("[data-tile-face]")].map(tile => tile.dataset.tileFace!),
      winningFaces: [...winning.querySelectorAll<HTMLElement>("[data-tile-face]")].map(tile => tile.dataset.tileFace!),
      meldCount: panel.querySelectorAll(".mahjong-winning-hand__melds .mahjong-meld").length,
      meldFaces: [...(meldWrapper?.querySelectorAll<HTMLElement>("[data-tile-face]") ?? [])].map(tile => tile.dataset.tileFace!),
      boxes, gaps, overlaps, rowBox, initialLast, initialScroll, scrolledLast, scrolledLeft, images,
      rowInsidePanel: rowBox.x >= panel.getBoundingClientRect().x - 1 && rowBox.right <= panel.getBoundingClientRect().right + 1,
    };
  });
  assert.equal(result.title, fixture.title, `${fixture.name}: settlement must identify ron or tsumo`);
  assert.equal(result.totalFaces, 14, `${fixture.name}: all physical winning tiles, melds included, must appear exactly once`);
  assert.deepEqual(faceList(result.closedFaces), faceList(fixture.closed), `${fixture.name}: closed hand matches the actual engine result`);
  assert.deepEqual(result.winningFaces, [fixture.winningTile], `${fixture.name}: winning tile is a separate rendered physical face`);
  assert.equal(result.meldCount, fixture.melds.length, `${fixture.name}: actual public meld count is retained`);
  assert.deepEqual(faceList(result.meldFaces), faceList(fixture.melds.flat()), `${fixture.name}: public meld faces match engine encoding`);
  assert.equal(result.overlaps.length, 0, `${fixture.name}: closed hand, winning tile, and meld groups must not overlap: ${JSON.stringify(result.overlaps)}`);
  assert.ok(result.gaps.length === 1 + fixture.melds.length && result.gaps.every(gap => gap >= 8), `${fixture.name}: closed-hand/winning-tile and winning-tile/meld gaps must each be at least 8px: ${JSON.stringify(result.gaps)}`);
  assert.ok(result.rowBox.width > 0 && result.rowBox.height > 0 && result.rowInsidePanel, `${fixture.name}: the winning hand row must be visible inside the result panel`);
  assert.equal(result.initialScroll.overflow, "auto", `${fixture.name}: the physical tile row remains horizontally scrollable`);
  assert.ok(result.initialScroll.client > 0 && result.initialScroll.scroll >= result.initialScroll.client, `${fixture.name}: scroll viewport must have measurable dimensions`);
  if (result.initialScroll.scroll > result.initialScroll.client + 1) {
    assert.ok(result.scrolledLeft > 0, `${fixture.name}: overflowing winning row must accept horizontal scrolling`);
    assert.ok(result.scrolledLast.x >= result.rowBox.x - 1 && result.scrolledLast.right <= result.rowBox.right + 1, `${fixture.name}: the final face must become visible after scrolling`);
  } else {
    assert.ok(result.initialLast.x >= result.rowBox.x - 1 && result.initialLast.right <= result.rowBox.right + 1, `${fixture.name}: the full hand is visible without scrolling when it fits`);
  }
  assert.ok(result.images.length > 0 && result.images.every(image => image.complete && image.width > 0 && image.height > 0), `${fixture.name}: authentic tile artwork must load in the browser`);
  return result;
}

let passed = 0;
const browsers: [string, typeof chromium][] = [["chromium", chromium], ["webkit", webkit]];
const results: unknown[] = [];
try {
  for (const [browserName, engine] of browsers) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.on("pageerror", error => console.error(`BROWSER_RUNTIME ${browserName}`, error.message));
      await page.route("https://mahjong.local/images/**", route => {
        const file = new URL(route.request().url()).pathname;
        return route.fulfill({ status: 200, contentType: "image/svg+xml", body: readFileSync(`public${file}`) });
      });
      for (const fixture of fixtures) for (const viewport of viewports) {
        await mount(page, fixture, viewport.width, viewport.height);
        const measurement = await inspect(page, fixture);
        if (browserName === "chromium" && [667, 1440].includes(viewport.width)) {
          await page.screenshot({ path: `.local/audit/mahjong-settlement-${fixture.name}-${viewport.width}.png` });
        }
        results.push({ browser: browserName, fixture: fixture.name, viewport, measurement });
        passed++;
        console.log(`PASS ${browserName} ${fixture.name} ${viewport.width}x${viewport.height}: result title, 14 physical faces, hand/meld separation, row scroll and tile art`);
      }
      await page.close();
    } finally { await browser.close(); }
  }
  writeFileSync(".local/audit/mahjong-settlement-browser-proof.json", JSON.stringify({ cases: passed, source: "real SanmaGame and RiichiGame outcomes after legal Choices", checks: ["DOM tile faces", "real MeldView group", "8px closed/winning/meld separation", "visible non-overlapping row bounds", "horizontal row scrollability", "loaded original tile art"], results }, null, 2) + "\n");
  console.log(`${passed}/18 real-engine settlement browser cases passed.`);
} catch (error) {
  writeFileSync(".local/audit/mahjong-settlement-browser-failure.json", JSON.stringify({ passed, error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error), results }, null, 2) + "\n");
  throw error;
}
