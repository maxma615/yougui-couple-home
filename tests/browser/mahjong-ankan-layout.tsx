// Browser audit of real, progressed closed-kan states. No server or live room is used.
import { projectedSampleScript } from "./projected-samples";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { Choice, GameVariant, RoomView } from "../../src/modules/mahjong/types";

const names = ["甲", "乙", "丙", "丁"];
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

type Scene = { id: string; variant: GameVariant; actor: number; game: SanmaGame | RiichiGame; red: boolean };
const scenes: Scene[] = [];
{
  const game = new SanmaGame("east", names.slice(0, 3), sanmaWall({
    0: "z777p123s123m19z12",
    1: "p23456s456789z23",
    2: "p789s123456z4565",
  }, ["z7"]));
  const before = game.view(0), kan = before.choices.find(choice => choice.type === "kan" && choice.value === "z7777");
  assert.ok(kan, `SanmaGame must offer the physical closed kan: ${JSON.stringify(before.choices)}`);
  game.respond(0, before.decisionId, kan.id);
  assert.equal(game.view(0).phase, "gangzimo");
  scenes.push({ id: "sanma-normal-z7", variant: "sanma", actor: 0, game, red: false });
}
{
  const game = new SanmaGame("east", names.slice(0, 3), sanmaWall({ 0: "p0555s123456z123" }, ["m1"]));
  const before = game.view(0), kan = before.choices.find(choice => choice.type === "kan" && choice.value?.[0] === "p" && choice.value.replace(/\D/g, "").length === 4);
  assert.ok(kan, `SanmaGame must offer the physical red-five closed kan: ${JSON.stringify(before.choices)}`);
  game.respond(0, before.decisionId, kan.id);
  assert.equal(game.view(0).phase, "gangzimo");
  scenes.push({ id: "sanma-red-p5", variant: "sanma", actor: 0, game, red: true });
}
{
  const game = new RiichiGame("east", names, riichiWall({ 0: "z777p123s123m19z12" }, "z7"));
  const before = game.view(0), kan = before.choices.find(choice => choice.type === "kan" && choice.value === "z7777");
  assert.ok(kan, `RiichiGame must offer the physical ordinary closed kan: ${JSON.stringify(before.choices)}`);
  game.respond(0, before.decisionId, kan.id);
  assert.equal(game.view(0).phase, "gangzimo");
  scenes.push({ id: "yonma-normal-z7", variant: "yonma", actor: 0, game, red: false });
}
{
  const game = new RiichiGame("east", names, riichiWall({ 0: "p0555s123456z123" }, "m1"));
  const before = game.view(0), kan = before.choices.find(choice => choice.type === "kan" && choice.value?.[0] === "p" && choice.value.replace(/\D/g, "").length === 4);
  assert.ok(kan, `RiichiGame must offer the physical red-five closed kan: ${JSON.stringify(before.choices)}`);
  game.respond(0, before.decisionId, kan.id);
  assert.equal(game.view(0).phase, "gangzimo");
  scenes.push({ id: "yonma-red-p5", variant: "yonma", actor: 0, game, red: true });
}

for (const scene of scenes) {
  const view = scene.game.view(scene.actor), publicActor = view.players.find(player => player.seat === scene.actor)!;
  assert.equal(publicActor.melds.length, 1, `${scene.id} must publish the actual declared meld`);
  assert.equal(publicActor.handCount, 11, `${scene.id} should retain a valid replacement draw after the kan`);
  const meld = publicActor.melds[0];
  assert.equal(core.valid_mianzi(meld), meld, `${scene.id} must use engine-canonical meld notation`);
  if (scene.red) assert.deepEqual(meld.match(/\d/g)?.sort(), ["0", "5", "5", "5"], "red-five ankan contains exactly one physical red five and three normal fives");
  else assert.equal(meld, "z7777");
  const globalKans = view.players.flatMap(player => player.melds).filter(value => value.match(/\d/g)?.length === 4).length;
  assert.equal(globalKans, 1, `${scene.id} has one actual kan globally`);
  console.log(`ENGINE ${scene.id}: ${scene.variant} legal ${scene.red ? "red-five" : "ordinary"} kan ${meld}; phase=${view.phase}; drawn=${view.drawnTile}; actorHandCount=${publicActor.handCount}; totalKans=${globalKans}.`);
}

const harness = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));
window.ankanLayoutApi={
 render:(room,ownSeat)=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,ownSeat,connected:true,motionCanAnimate:false,host:true,busy:false,onChoice:choice=>window.ankanChoices.push(choice),onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}}))))),
 dispose:()=>root.unmount()
};
window.ankanChoices=[];`;
const bundle = await build({
  stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const css = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css", "mahjong-table-center.css", "mahjong-table-edge.css", "mahjong-camera.css"].map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");
const sizes = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1440, height: 810 }];
const failures: string[] = [];
let views = 0;

function roomFor(scene: Scene, viewer: number): RoomView {
  const capacity = scene.variant === "sanma" ? 3 : 4;
  return {
    id: `real-ankan-${scene.id}`, code: "ABCDEFGH", hostUserId: `user-${viewer}`,
    mode: "east", variant: scene.variant, status: "playing", version: 1, mySeat: viewer,
    game: scene.game.view(viewer),
    members: Array.from({ length: capacity }, (_, seat) => ({
      userId: `user-${seat}`, displayName: `牌友${seat}`, seat, kind: "human" as const, ready: true, connected: true,
    })),
  };
}

async function captureSignature(page: import("@playwright/test").Page, scene: Scene, viewer: number) {
  const selector = viewer === scene.actor
    ? ".mahjong-table__own-public .mahjong-hand-public-melds .mahjong-meld--ankan"
    : `[data-testid="player-${scene.actor}"] .mahjong-meld--ankan`;
  const meld = page.locator(selector);
  assert.equal(await meld.count(), 1, `${scene.id} viewer ${viewer}: the actual public ankan is rendered once`);
  const signature = await meld.evaluate(element => {
    const tiles = [...element.querySelector(".mahjong-meld__tiles")!.children] as HTMLElement[];
    return {
      aria: element.getAttribute("aria-label"),
      kind: element.getAttribute("data-kind"),
      slots: tiles.map(tile => ({
        kind: tile.classList.contains("mahjong-meld__back") ? "back" : "face",
        face: tile.querySelector<HTMLElement>("[data-tile-face]")?.dataset.tileFace ?? null,
        red: tile.querySelector("img[src$='Pin5-Dora.svg']") !== null,
        image: tile.querySelector("img")?.getAttribute("src") ?? null,
        ariaHidden: tile.getAttribute("aria-hidden"),
      })),
    };
  });
  assert.equal(signature.kind, "ankan");
  assert.deepEqual(signature.slots.map(slot => slot.kind), ["back", "face", "face", "back"], `${scene.id} viewer ${viewer}: both ends concealed, center faces visible`);
  assert.deepEqual(signature.slots.filter(slot => slot.kind === "back").map(slot => slot.ariaHidden), ["true", "true"]);
  assert.deepEqual(signature.slots.filter(slot => slot.kind === "face").map(slot => slot.face), scene.red ? ["p0", "p5"] : ["z7", "z7"]);
  assert.deepEqual(signature.slots.filter(slot => slot.kind === "face").map(slot => slot.red), scene.red ? [true, false] : [false, false]);
  assert.equal(signature.aria, scene.red ? "暗杠，五筒（赤）" : "暗杠，红中");

  await page.addScriptTag({content: projectedSampleScript});
  const geometry = await meld.evaluate(element => {
    const table = document.querySelector(".mahjong-table")!.getBoundingClientRect();
    const failures: string[] = [];
    for (const tile of [...element.querySelector(".mahjong-meld__tiles")!.children] as HTMLElement[]) {
      const bounds = tile.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0 || bounds.left < table.left - .5 || bounds.top < table.top - .5 || bounds.right > table.right + .5 || bounds.bottom > table.bottom + .5) {
        failures.push(`tile slot outside table: ${tile.className} ${JSON.stringify({ x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height })}`);
      }
      for (const point of (window as any).mahjongPhysicalSamples(tile) as {x:number;y:number;u:number;v:number}[]) {
        const hit = document.elementFromPoint(point.x, point.y);
        if (!hit || !tile.contains(hit)) failures.push(`5-point projected tile sample (${point.u},${point.v}) intercepted by ${hit?.className || hit?.tagName || "none"}`);
      }
    }
    return failures;
  });
  assert.deepEqual(geometry, [], `${scene.id} viewer ${viewer}: all four tile boxes and their five face/back samples remain visible`);
  return signature;
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
    for (const scene of scenes) {
      const capacity = scene.variant === "sanma" ? 3 : 4;
      for (let viewer = 0; viewer < capacity; viewer++) for (const size of sizes) {
        await page.setViewportSize(size);
        await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><div id="root"></div>`);
        await page.addScriptTag({ content: `globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}` });
        const room = roomFor(scene, viewer);
        await page.evaluate(({ room, viewer }) => (window as any).ankanLayoutApi.render(room, viewer), { room, viewer });
        await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
        const before = await captureSignature(page, scene, viewer);
        if (scene.red) {
          assert.equal(await page.locator(`[data-testid="player-${scene.actor}"] .mahjong-meld--ankan img[src$='Pin5-Dora.svg']`).count(), 1,
            "every viewer sees the actor's single public red-five face on that actor's physical panel");
          assert.equal(await page.locator("img.mahjong-tile__art").evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth === 300 && (image as HTMLImageElement).naturalHeight === 400)), true);
        }
        // Re-render the same engine snapshot without a new decision. The public meld must remain identical.
        await page.evaluate(({ room, viewer }) => (window as any).ankanLayoutApi.render(room, viewer), { room, viewer });
        await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
        const after = await captureSignature(page, scene, viewer);
        assert.deepEqual(after, before, `${engine.name()} ${scene.id} viewer ${viewer} ${size.width}: silent React re-render preserves concealed-kan composition`);
        if (scene.red) {
          const visibleRed = viewer === scene.actor
            ? page.locator(`.mahjong-table__own-public .mahjong-hand-public-melds .mahjong-meld--ankan img[src$='Pin5-Dora.svg']`)
            : page.locator(`[data-testid="player-${scene.actor}"] .mahjong-meld--ankan img[src$='Pin5-Dora.svg']`);
          assert.equal(await visibleRed.count(), 1, "the actual red-five art remains loaded after re-render");
          if (viewer === 1 && size.width === 844) {
            await page.screenshot({ path: `../audit/ankan-red-face-${scene.id}-${engine.name()}-viewer1-844.png` });
          }
        }
        views++;
      }

      // Exercise the real GameRoom inspect button from an opposing seat and inspect loaded, enlarged faces.
      await page.setViewportSize({ width: 844, height: 390 });
      const viewer = 1, room = roomFor(scene, viewer);
      await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><div id="root"></div>`);
      await page.addScriptTag({ content: `globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}` });
      await page.evaluate(({ room, viewer }) => (window as any).ankanLayoutApi.render(room, viewer), { room, viewer });
      await page.getByRole("button", { name: `查看牌友${scene.actor}的公开副露` }).click();
      const dialog = page.getByRole("dialog", { name: `牌友${scene.actor}的公开副露` });
      await dialog.waitFor({ state: "visible" });
      const detailMeld = dialog.locator(".mahjong-meld--ankan");
      assert.equal(await detailMeld.locator(".mahjong-meld__back").count(), 2);
      assert.deepEqual(await detailMeld.locator("[data-tile-face]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-tile-face"))), scene.red ? ["p0", "p5"] : ["z7", "z7"]);
      const readableFace = await detailMeld.locator("[data-tile-face]").first().boundingBox();
      assert.ok(readableFace && readableFace.width >= 39 && readableFace.height >= 56, "inspected declared-kan faces remain readable at the public-meld detail size");
      if (scene.red) assert.equal(await detailMeld.locator("img[src$='Pin5-Dora.svg']").count(), 1, "the inspect dialog preserves the red-five stock art");
      assert.deepEqual(await page.evaluate(() => (window as any).ankanChoices), [], "opening public meld details never submits a game choice");
      await page.getByRole("button", { name: "关闭副露详情" }).click();
      await dialog.waitFor({ state: "detached" });
      console.log(`DETAIL ${engine.name()} ${scene.id}: opened through the mounted GameRoom inspect button; two backs, two public faces, no game choice.`);
    }
  } finally { await browser.close(); }
}

console.log(`PASS ${views} real-game viewer/viewport renders across Chromium and WebKit (Sanma 3 viewers + yonma 4 viewers; 667×375, 844×390, 1440×810).`);
console.log("Coverage: ordinary and red-p5 ankan in both SanmaGame and RiichiGame, each declared by a legal engine Choice with a physical replacement draw; details were opened through mounted GameRoom UI.");
