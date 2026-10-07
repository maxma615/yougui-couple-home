// Verify real public opponent racks and discard origins through the projected
// interactive table, using the public boolean emitted by the real game engines.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit, type Page } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { Choice, GameVariant, GameView, RoomView } from "../../src/modules/mahjong/types";
import { projectedSampleScript } from "./projected-samples";

type RealGame = { view(seat: number): GameView; respond(seat: number, decisionId: string, choiceId: string): void };
type DrawAction = "closed-hand" | "drawn-tile" | "red-hand";
type Point = { x: number; y: number };
type Fixture = { variant: GameVariant; actor: number; viewer: number; action: DrawAction; game: RealGame; before: RoomView; after: RoomView; choice: Choice };

const names = ["玩家", "电脑甲", "电脑乙", "电脑丙"];
const viewports = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1440, height: 810 }];
const tileList = (encoded: string) => [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));
const concealedHand = "p011233s456789z1";
const drawnTile = "z7";

function sanmaOptions(actor: number) {
  return { dealer: actor, wallFactory: () => {
    const physicalBefore = sanmaTiles();
    const available = physicalBefore.slice();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `physical Sanma fixture is missing ${tile}`);
      return available.splice(index, 1)[0];
    };
    const bySeat = Array.from({ length: 3 }, () => [] as string[]);
    bySeat[actor] = tileList(concealedHand).map(take);
    assert.equal(bySeat[actor].length, 13, "every actor begins with a legal thirteen-tile hand");
    const draw = take(drawnTile);
    for (let offset = 1; offset < 3; offset++) bySeat[(actor + offset) % 3] = available.splice(0, 13);
    const orderedDeal = Array.from({ length: 3 }, (_, wind) => bySeat[(actor + wind) % 3]).flat();
    const replacements = available.splice(0, 4);
    const indicators = available.splice(0, 10);
    const ordered = [...orderedDeal, draw, ...available, ...replacements, ...indicators];
    assert.deepEqual(ordered.slice().sort(), physicalBefore.slice().sort(), "all physical Sanma tiles, including red fives, remain conserved");
    return new SanmaWall(ordered);
  } };
}

function riichiOptions(actor: number) {
  return { dealer: actor, wallFactory: (rule: ConstructorParameters<typeof Majiang.Shan>[0]) => {
    const wall = new Majiang.Shan(rule), physicalBefore = wall._pai.slice(), available = wall._pai.slice();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `physical Riichi fixture is missing ${tile}`);
      return available.splice(index, 1)[0];
    };
    const bySeat = Array.from({ length: 4 }, () => [] as string[]);
    bySeat[actor] = tileList(concealedHand).map(take);
    assert.equal(bySeat[actor].length, 13, "every actor begins with a legal thirteen-tile hand");
    const draw = take(drawnTile);
    for (let offset = 1; offset < 4; offset++) bySeat[(actor + offset) % 4] = available.splice(0, 13);
    const orderedDeal = Array.from({ length: 4 }, (_, wind) => bySeat[(actor + wind) % 4]).flat();
    wall._pai = [...available, ...[...orderedDeal, draw].reverse()];
    assert.deepEqual(wall._pai.slice().sort(), physicalBefore.slice().sort(), "all Riichi tiles, including each red five, remain conserved");
    wall._baopai = [wall._pai[4]];
    wall._fubaopai = [wall._pai[9]];
    return wall;
  } };
}

function assertDrawFlagsArePublished(view: GameView, game: RealGame, label: string) {
  for (const player of view.players) {
    const actual = (player as typeof player & { hasDrawnTile?: unknown }).hasDrawnTile;
    assert.equal(typeof actual, "boolean", `${label}: PublicPlayer ${player.seat} must publish only the drawn-tile boolean`);
    assert.equal(actual, game.view(player.seat).drawnTile !== null, `${label}: drawn state must match that seat's real engine hand`);
    assert.deepEqual(Object.keys(player).sort(), ["discards", "handCount", "hasDrawnTile", "melds", "nuki", "riichi", "score", "seat", "wind"].filter(key => key !== "nuki" || "nuki" in player).sort(), `${label}: public players may expose the boolean and public data, never a concealed hand`);
  }
}

function room(rawView: GameView, variant: GameVariant, viewer: number, id: string): RoomView {
  const capacity = variant === "sanma" ? 3 : 4;
  return {
    id, code: "ABCDEFGH", hostUserId: `display-user-${viewer}`, variant, mode: "east", status: "playing", version: 1, mySeat: viewer,
    game: rawView,
    members: Array.from({ length: capacity }, (_, seat) => ({ userId: `display-user-${seat}`, seat,
      displayName: names[seat], kind: seat === viewer ? "human" : "bot", ready: true, connected: true })),
  };
}

function fixture(variant: GameVariant, actor: number, action: DrawAction): Fixture {
  const capacity = variant === "sanma" ? 3 : 4;
  const viewer = (actor + 1) % capacity;
  assert.notEqual(viewer, actor, "the actor must always be rendered as an opponent");
  const game: RealGame = variant === "sanma"
    ? new SanmaGame("east", names.slice(0, 3), sanmaOptions(actor))
    : new RiichiGame("east", names, riichiOptions(actor));
  const actorBefore = game.view(actor);
  assert.equal(actorBefore.turnSeat, actor, `${variant} actor ${actor} must own the real initial draw`);
  assert.equal(actorBefore.drawnTile, drawnTile, `${variant} actor ${actor} must have the physical wall draw`);
  const choice = actorBefore.choices.find(item => item.type === "discard" && (action === "drawn-tile"
    ? item.value === `${drawnTile}_`
    : item.value === (action === "red-hand" ? "p0" : "p1")));
  assert.ok(choice, `${variant} actor ${actor} must have the requested legal ${action} Choice`);

  const beforeRaw = game.view(viewer);
  assertDrawFlagsArePublished(beforeRaw, game, `${variant} actor ${actor} before`);
  const actorPublic = beforeRaw.players.find(player => player.seat === actor)!;
  assert.equal(actorPublic.handCount, 14, "the dealer's real initial draw must add one public back tile");
  assert.equal("hand" in actorPublic, false, "the public opponent record must not contain a concealed hand");
  game.respond(actor, actorBefore.decisionId, choice.id);
  const afterRaw = game.view(viewer);
  assertDrawFlagsArePublished(afterRaw, game, `${variant} actor ${actor} after`);
  const actorAfter = afterRaw.players.find(player => player.seat === actor)!;
  assert.equal(actorAfter.handCount, 13, "a real accepted discard leaves thirteen concealed backs");
  assert.equal(actorAfter.hasDrawnTile, false, "the discarder must have no drawn back after a discard");
  const publicDiscard = actorAfter.discards.at(-1);
  assert.ok(publicDiscard, "the selected legal Choice must reach the real public river");
  assert.equal(publicDiscard.includes("_"), action === "drawn-tile", "only the actual tsumogiri keeps the engine underscore marker");
  assert.equal(publicDiscard.includes("*"), false, "these two scenarios do not declare riichi");

  const id = `opponent-draw-${variant}-${actor}-${action}`;
  const before = room(beforeRaw, variant, viewer, id);
  const after = { ...before, version: 2, game: afterRaw };
  return { variant, actor, viewer, action, game, before, after, choice };
}

const harness = `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {GameRoom} from './src/components/mahjong/mahjong-client';
let setRoom,setCanAnimate;window.opponentDrawApi={lastChoice:null};
function Scene(){const[room,roomSetter]=useState(window.opponentDrawFixture);const[connected]=useState(true);const[canAnimate,animateSetter]=useState(true);setRoom=roomSetter;setCanAnimate=animateSetter;return React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,host:true,busy:false,ownSeat:room.mySeat,connected,motionCanAnimate:canAnimate,motionIntent:null,onChoice:choice=>window.opponentDrawApi.lastChoice=choice,onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})));}
const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(React.createElement(Scene)));window.opponentDrawApi.dispose=()=>root.unmount();window.opponentDrawApi.update=room=>flushSync(()=>setRoom(room));window.opponentDrawApi.quietUpdate=room=>flushSync(()=>{setCanAnimate(false);setRoom(room)});`;

const bundle = await build({ stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" }, bundle: true,
  platform: "browser", format: "iife", write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
const css = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css", "mahjong-table-center.css", "mahjong-table-edge.css", "mahjong-camera.css", "mahjong-standing-tile.css"]
  .map(file => readFileSync("src/app/mahjong/" + file, "utf8")).join("\n");
const script = "globalThis.__name=(target,value)=>Object.defineProperty(target,\"name\",{value,configurable:true});globalThis.process={env:{NODE_ENV:\"development\"}};\n" + bundle.outputFiles[0].text;

async function mount(page: Page, current: RoomView, width: number, height: number) {
  await page.evaluate(() => (window as any).opponentDrawApi?.dispose?.());
  await page.goto("about:blank");
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*{box-sizing:border-box}${css}</style><div id="root"></div>`);
  await page.evaluate(value => { (window as any).opponentDrawFixture = value; }, current);
  await page.addScriptTag({ content: script });
  await page.addScriptTag({ content: projectedSampleScript });
  await page.getByTestId("mahjong-board").waitFor({ state: "visible", timeout: 4000 });
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "a first snapshot must not replay a discard");
}

async function rackState(page: Page, actor: number) {
  return page.evaluate(seat => {
    const rack = document.querySelector<HTMLElement>(`[data-motion-rack-seat="${seat}"]`);
    if (!rack) throw new Error(`opponent rack for seat ${seat} was not rendered`);
    const backs = [...rack.querySelectorAll<HTMLElement>(":scope > i")];
    const drawn = backs.filter(back => back.classList.contains("is-drawn") && back.dataset.motionDrawn === "true");
    const box = (element: HTMLElement) => { const rect = element.getBoundingClientRect(); return {x:rect.x,y:rect.y,w:rect.width,h:rect.height}; };
    const center = (rect: ReturnType<typeof box>) => ({x:rect.x+rect.w/2,y:rect.y+rect.h/2});
    const closedGap = backs.length > 2 ? Math.hypot(center(box(backs[backs.length-2])).x-center(box(backs[backs.length-3])).x,center(box(backs[backs.length-2])).y-center(box(backs[backs.length-3])).y) : 0;
    const drawnGap = drawn.length && backs.length > 1 ? Math.hypot(center(box(drawn[0])).x-center(box(backs[backs.length-2])).x,center(box(drawn[0])).y-center(box(backs[backs.length-2])).y) : 0;
    return { backs: backs.length, drawn: drawn.length, drawnIndex: backs.indexOf(drawn[0]), drawnGap, closedGap,
      publicCount: Number(rack.querySelector(":scope > span")?.textContent), hasFace: Boolean(rack.querySelector("img,[data-tile-face]")),
      cards: backs.map(back => ({className:back.className,drawn:back.dataset.motionDrawn??null})) };
  }, actor);
}

async function sourceCorners(page: Page, actor: number, action: DrawAction) {
  return page.evaluate(({ seat, action: drawAction }) => {
    const backs = [...document.querySelectorAll<HTMLElement>(`[data-motion-rack-seat="${seat}"] > i`)];
    const source = backs[drawAction === "drawn-tile" ? backs.length - 1 : backs.length - 2];
    if (!source || backs.length !== 14) throw new Error("real initial opponent rack must contain fourteen backs");
    const face = source.querySelector<HTMLElement>("[data-motion-surface]");
    if (!face) throw new Error("a physical opponent tile must provide its visible back as the discard source");
    return (window as any).mahjongPhysicalSamples(face, [[0,0],[1,0],[1,1],[0,1]]) as {x:number;y:number}[];
  }, { seat: actor, action });
}

async function liveFlight(page: Page, current: Fixture) {
  return page.evaluate(async ({ after, actor, action }) => {
    (window as any).opponentDrawApi.update(after);
    for (let frame = 0; frame < 12; frame++) {
      await new Promise(requestAnimationFrame);
      const node = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]');
      if (!node) continue;
      const movement = node.getAnimations()[0];
      if (!movement) throw new Error("an opponent discard must use the live browser flight");
      movement.pause();
      movement.currentTime = 0;
      for (const animation of node.querySelector(".mahjong-discard-flight__card")?.getAnimations() ?? []) {
        animation.pause();
        animation.currentTime = 0;
      }
      await new Promise(requestAnimationFrame);
      const event = node.dataset.motionEvent;
      const river = [...document.querySelectorAll<HTMLElement>("[data-discard-event-id]")].find(item => item.dataset.discardEventId === event);
      if (!river) throw new Error("opponent flight must be attached to the engine's real river event");
      const corners = (window as any).mahjongPhysicalSamples(node, [[0,0],[1,0],[1,1],[0,1]]) as {x:number;y:number}[];
      return { corners, source: node.dataset.motionSource, sourceSeat: Number(node.dataset.motionSeat), event,
        tsumogiri: river.classList.contains("is-tsumogiri") };
    }
    throw new Error(`${action} by opponent seat ${actor} did not create a flight`);
  }, { after: current.after, actor: current.actor, action: current.action });
}

async function sourceMaterial(page: Page, actor: number, action: DrawAction) {
  return page.evaluate(({ actor, action }) => {
    const backs = [...document.querySelectorAll<HTMLElement>(`[data-motion-rack-seat="${actor}"] > i`)];
    const tile = action === "drawn-tile" ? backs.find(back => back.dataset.motionDrawn === "true") : backs.filter(back => back.dataset.motionDrawn !== "true").at(-1);
    const face = tile?.querySelector<HTMLElement>("[data-motion-surface]");
    if (!face) throw new Error("a material comparison requires the real source surface");
    const style = getComputedStyle(face);
    return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage,
      borderColor: style.borderTopColor, borderWidth: style.borderTopWidth,
      borderRadius: style.borderTopLeftRadius, boxShadow: style.boxShadow };
  }, { actor, action });
}

async function flightMaterials(page: Page) {
  return page.evaluate(() => {
    const flight = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]')!;
    const event = flight.dataset.motionEvent;
    const river = [...document.querySelectorAll<HTMLElement>("[data-discard-event-id]")].find(item => item.dataset.discardEventId === event)!;
    const surface = (element: Element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage,
        borderColor: style.borderTopColor, borderWidth: style.borderTopWidth,
        borderRadius: style.borderTopLeftRadius, boxShadow: style.boxShadow };
    };
    const front = flight.querySelector<HTMLElement>(".mahjong-discard-flight__face")!;
    const target = river.querySelector<HTMLElement>(".mahjong-tile")!;
    const facePaint = (element: Element) => {
      const style = getComputedStyle(element);
      return { ...surface(element), padding: style.padding, outline: style.outlineStyle === "none" ? "none" : style.outline };
    };
    const indicatorBacks = [...document.querySelectorAll<HTMLElement>(".mahjong-indicator-back")].map(surface);
    return { back: surface(flight.querySelector(".mahjong-discard-flight__back")!),
      front: facePaint(front), target: facePaint(target), indicatorBacks,
      flyingValue: front.dataset.tileFace, targetValue: target.dataset.tileFace,
      artwork: front.querySelector<HTMLImageElement>("img")?.getAttribute("src"),
      frontFilter: getComputedStyle(front).filter, riverFilter: getComputedStyle(river).filter };
  });
}

const compareCorners = (actual: Point[], expected: Point[], label: string) => {
  assert.equal(actual.length, 4); assert.equal(expected.length, 4);
  for (let index = 0; index < 4; index++) {
    const error = Math.hypot(actual[index].x - expected[index].x, actual[index].y - expected[index].y);
    assert.ok(error < 1.5, `${label}: projected corner ${index} must start at the expected physical back (error ${error.toFixed(3)}px)`);
  }
};

let passed = 0;
const browsers: [string, typeof chromium][] = [["chromium", chromium], ["webkit", webkit]];
try {
  for (const [browserName, engine] of browsers) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.on("pageerror", error => console.error(`BROWSER_RUNTIME ${browserName}`, error.message));
      await page.route("https://mahjong.local/images/**", route => {
        const file = new URL(route.request().url()).pathname;
        return route.fulfill({ status: 200, contentType: file.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync("public" + file) });
      });
      for (const variant of ["sanma", "yonma"] as const) {
        const capacity = variant === "sanma" ? 3 : 4;
        for (let actor = 0; actor < capacity; actor++) for (const viewport of viewports) for (const action of ["closed-hand", "drawn-tile", "red-hand"] as const) {
          const current = fixture(variant, actor, action);
          await mount(page, current.before, viewport.width, viewport.height);
          const keepVisualSample = browserName === "chromium" && actor === 0
            && ((variant === "sanma" && viewport.width === 667) || (variant === "yonma" && viewport.width === 1440));
          let rack = await rackState(page, actor);
          assert.equal(rack.backs, 14, `${browserName}/${variant}/actor=${actor}/${action}: rack back count must equal public handCount`);
          assert.equal(rack.publicCount, 14);
          assert.equal(rack.drawn, 1, "the drawn flag must mark exactly one last back");
          assert.equal(rack.drawnIndex, 13, "the last back is the actual draw");
          assert.ok(rack.drawnGap > rack.closedGap, `projected drawn gap must exceed the neighboring closed-hand gap (${rack.drawnGap.toFixed(2)} vs ${rack.closedGap.toFixed(2)}px)`);
          assert.equal(rack.hasFace, false, "opponent backs expose no tile art or face value");
          if (keepVisualSample) await page.screenshot({ path: `.local/audit/mahjong-opponent-draw-${variant}-${viewport.width}-${action}-before.png` });

          await page.evaluate(after => (window as any).opponentDrawApi.quietUpdate(after), current.after);
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "a quiet accepted snapshot must not animate");
          rack = await rackState(page, actor);
          assert.equal(rack.backs, 13); assert.equal(rack.drawn, 0); assert.equal(rack.publicCount, 13);

          await mount(page, current.after, viewport.width, viewport.height);
          assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "refreshing on an accepted snapshot must not replay a flight");
          await mount(page, current.before, viewport.width, viewport.height);
          const expected = await sourceCorners(page, actor, action);
          const expectedMaterial = await sourceMaterial(page, actor, action);
          const flight = await liveFlight(page, current);
          assert.equal(flight.source, "opponent"); assert.equal(flight.sourceSeat, actor);
          assert.equal(flight.tsumogiri, action === "drawn-tile", "the river marker must reflect the real engine Choice");
          compareCorners(flight.corners, expected, `${browserName}/${variant}/actor=${actor}/${action}`);
          const paint = await flightMaterials(page);
          assert.deepEqual(paint.back, expectedMaterial, "the flying back must keep its source tile's original material without a gold flash");
          assert.deepEqual(paint.front, paint.target, "the flight face must land with the confirmed river face's paint, padding and outline");
          assert.equal(paint.frontFilter, paint.riverFilter, "tsumogiri brightness must not jump when the flying face reaches its river");
          assert.equal(paint.flyingValue, paint.targetValue, "the confirmed flying value matches its river tile");
          if (action === "red-hand") {
            assert.equal(paint.flyingValue, "p0", "the real physical red five is preserved in flight");
            assert.equal(paint.artwork, "/images/mahjong-tiles/regular/Pin5-Dora.svg", "a red five uses the original licensed red artwork");
          }
          for (const back of paint.indicatorBacks) {
            assert.equal(back.backgroundColor, expectedMaterial.backgroundColor, "indicator backs belong to the same physical tile set");
            assert.equal(back.backgroundImage, expectedMaterial.backgroundImage);
            assert.equal(back.borderColor, expectedMaterial.borderColor);
          }
          if (keepVisualSample) await page.screenshot({ path: `.local/audit/mahjong-opponent-draw-${variant}-${viewport.width}-${action}-flight.png` });

          // Duplicate snapshots are applied with the same public event and room version.
          const duplicate = await page.evaluate(async after => {
            const node = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]')!;
            const animation = node.getAnimations()[0], currentTime = animation.currentTime;
            (window as any).opponentDrawApi.update(structuredClone(after));
            await new Promise(requestAnimationFrame);
            return { sameNode: document.querySelector('[data-testid="mahjong-discard-flight"]') === node,
              sameAnimation: node.getAnimations()[0] === animation, currentTime, laterTime: animation.currentTime };
          }, current.after);
          assert.equal(duplicate.sameNode, true, "a duplicate snapshot must preserve the active flight node");
          assert.equal(duplicate.sameAnimation, true, "a duplicate snapshot must not restart the flight");
          assert.equal(duplicate.laterTime, duplicate.currentTime, "the paused flight time must be unchanged by a duplicate");

          await page.evaluate(() => { const node=document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]'); node?.getAnimations()[0]?.finish(); });
          await page.waitForTimeout(30);
          assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "completed opponent flight must leave the confirmed river face");
          rack = await rackState(page, actor);
          assert.equal(rack.backs, 13, "after discard, the actor has thirteen hidden backs");
          assert.equal(rack.publicCount, 13);
          assert.equal(rack.drawn, 0, "the completed discard must leave no drawn back");
          passed++;
          console.log(`PASS ${browserName} ${variant} ${viewport.width}x${viewport.height} actor=${actor} viewer=${current.viewer} ${action}: engine Choice, rack, source corners, quiet/reload/dedupe`);
        }
      }
      await page.close();
    } finally { await browser.close(); }
  }
  writeFileSync(".local/audit/mahjong-opponent-draw-browser-proof.json", JSON.stringify({ cases: passed, source: "real SanmaGame/RiichiGame snapshots and actual public player rack", geometry: "DOM projected four-corner and computed-paint comparison", matrix: "2 browsers × 7 absolute actor seats × 3 viewports × 3 legal discard choices including red five" }, null, 2) + "\n");
  console.log(`${passed}/126 real-engine projected opponent-rack, material and discard-origin cases passed.`);
} catch (error) {
  writeFileSync(".local/audit/mahjong-opponent-draw-browser-failure.json", JSON.stringify({ passed, error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error) }, null, 2) + "\n");
  throw error;
}
