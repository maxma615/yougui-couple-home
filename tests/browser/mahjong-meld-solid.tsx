// Native geometry audit of accepted, engine-produced public melds.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { Choice, GameVariant, RoomView } from "../../src/modules/mahjong/types";

const out = `.local/audit/mahjong-meld-solid-${Date.now()}`;
mkdirSync(out, { recursive: true });
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const tiles = (encoded: string) => [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));
const names = ["甲", "乙", "丙", "丁"];
type Kind = "pon" | "open" | "closed" | "added";
type Fixture = { game: RiichiGame | SanmaGame; actor: number; variant: GameVariant; kind: Kind; choices: Choice[]; choiceType: string; meld?: string; sourceChoice?: string };

function legalFixture(variant: GameVariant, kind: Kind): Fixture {
  const count = variant === "sanma" ? 3 : 4;
  const actor = kind === "closed" ? 0 : 1;
  const encoded = kind === "pon" || kind === "open" || kind === "closed"
    ? "p055s123789z1234" : "p55s123789z12345";
  const draws = kind === "added"
    ? (variant === "sanma" ? ["p5", "z6", "z7", "p0"] : ["p5", "z6", "z7", "m9", "p0"])
    : ["p5"];
  const deal = (physical: string[]) => {
    const pool = physical.slice();
    const take = (tile: string) => {
      const index = pool.indexOf(tile);
      assert.ok(index >= 0, `physical tile is available: ${tile}`);
      return pool.splice(index, 1)[0];
    };
    const hands = Array.from({ length: count }, () => [] as string[]);
    hands[actor] = tiles(encoded).map(take);
    const drawn = draws.map(take);
    for (const hand of hands) {
      if (!hand.length) hand.push(...pool.splice(0, 13));
      assert.equal(hand.length, 13);
    }
    return { hands, drawn, pool };
  };
  const seats = names.slice(0, count);
  const game = variant === "sanma"
    ? new SanmaGame("east", seats, { dealer: 0, wallFactory: () => {
      const { hands, drawn, pool } = deal(sanmaTiles());
      const replacement = pool.splice(0, 4), indicators = pool.splice(0, 10);
      return new SanmaWall([...hands.flat(), ...drawn, ...pool, ...replacement, ...indicators]);
    } })
    : new RiichiGame("east", seats, { dealer: 0, wallFactory: rule => {
      const wall = new Majiang.Shan(rule), { hands, drawn, pool } = deal(wall._pai);
      wall._pai = [...pool, ...[...hands.flat(), ...drawn].reverse()];
      wall._baopai = [wall._pai[4]];
      wall._fubaopai = [wall._pai[9]];
      return wall;
    } });
  const act = (seat: number, id: string) => {
    const view = game.view(seat);
    assert.ok(view.choices.some(choice => choice.id === id), `engine offers ${id}`);
    game.respond(seat, view.decisionId, id);
  };
  const pass = () => {
    for (let seat = 0; seat < count; seat++) {
      const choice = game.view(seat).choices.find(candidate => candidate.type === "pass");
      if (choice) act(seat, choice.id);
    }
  };
  if (kind !== "closed") act(0, `discard:${draws[0]}_`);
  if (kind === "added") {
    const pon = game.view(1).choices.find(choice => choice.type === "pon");
    assert.ok(pon, `${variant} setup has a legal first pon`);
    act(1, pon.id); pass(); act(1, "discard:z5"); pass();
    for (const tile of draws.slice(1, -1)) {
      const seat = game.view(0).turnSeat;
      act(seat, `discard:${tile}_`); pass();
    }
  }
  const choiceType = kind === "pon" ? "pon" : "kan";
  const choices = game.view(actor).choices.filter(choice => choice.type === choiceType);
  assert.ok(choices.length, `${variant} ${kind} comes from a real legal engine choice`);
  return { game, actor, variant, kind, choices, choiceType };
}

const sourceFiles = [
  "src/components/mahjong/mahjong-meld.tsx",
  "src/components/mahjong/use-public-call-motion.tsx",
  "src/app/mahjong/mahjong-meld.css",
  "tests/component/mahjong-meld.test.tsx",
  "tests/browser/mahjong-meld-solid.tsx",
];
const harness = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));
window.meldSolidRender=(room,viewer)=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,ownSeat:viewer,connected:true,motionCanAnimate:false,host:true,busy:false,onChoice:()=>{},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))));
`;
const bundle = await build({
  stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const cssFiles = [...readFileSync("src/app/mahjong/page.tsx", "utf8")
  .matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(match => match[1]);
const css = cssFiles.map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");
writeFileSync(`${out}/bundle.js`, bundle.outputFiles[0].text);
writeFileSync(`${out}/source-manifest.json`, JSON.stringify({
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  files: Object.fromEntries(sourceFiles.map(file => [file, digest(readFileSync(file))])),
  cssFiles: Object.fromEntries(cssFiles.map(file => [file, digest(readFileSync(`src/app/mahjong/${file}`))])),
  bundle: digest(bundle.outputFiles[0].text),
}, null, 2));

function roomFor(fixture: Fixture, viewer: number): RoomView {
  const members = names.slice(0, fixture.variant === "sanma" ? 3 : 4).map((displayName, seat) => ({
    userId: String(seat), displayName, seat, kind: "human" as const, ready: true, connected: true,
  }));
  return {
    id: `solid-${fixture.variant}-${fixture.kind}`, code: "ABCDEFGH", hostUserId: "0", mode: "east",
    variant: fixture.variant, status: "playing", version: 1, mySeat: viewer,
    game: fixture.game.view(viewer), members,
  };
}

const sceneCount = { renders: 0, choices: 0 };
const failures: string[] = [];
const cases: Fixture[] = [];
for (const variant of ["yonma", "sanma"] as const) {
  for (const kind of ["pon", "open", "closed", "added"] as const) {
    const initial = legalFixture(variant, kind);
    // Retain every real physical alternative so red and normal five selections
    // are independently accepted by the authoritative engine.
    for (const choice of initial.choices) {
      const fixture = legalFixture(variant, kind);
      const selected = fixture.game.view(fixture.actor).choices.find(candidate => candidate.id === choice.id);
      assert.ok(selected, `fresh ${variant} ${kind} fixture has the same legal choice`);
      fixture.game.respond(fixture.actor, fixture.game.view(fixture.actor).decisionId, selected.id);
      for (let seat = 0; seat < (variant === "sanma" ? 3 : 4); seat++) {
        const pending = fixture.game.view(seat).choices.find(candidate => candidate.type === "pass");
        if (pending) fixture.game.respond(seat, fixture.game.view(seat).decisionId, pending.id);
      }
      const actorView = fixture.game.view(fixture.actor);
      const published = actorView.players.find(player => player.seat === fixture.actor)!.melds;
      assert.equal(published.length, 1, `${variant} ${kind} publishes from the actual accepted event; choice=${choice.id} phase=${actorView.phase} choices=${JSON.stringify(actorView.choices)}`);
      const meld = published.at(-1)!;
      assert.equal((Majiang.Shoupai as any).valid_mianzi(meld), meld, `${variant} ${kind} notation is canonical`);
      fixture.meld = meld;
      fixture.sourceChoice = choice.id;
      cases.push(fixture);
    }
  }
}

const captureMode = process.env.MELD_SOLID_CAPTURE;
const runCases = captureMode === "kan"
  ? cases.filter(fixture => fixture.variant === "yonma" && (fixture.kind === "closed" || fixture.kind === "added") && fixture.meld?.includes("0"))
  : cases;
assert.ok(runCases.length > 0, `capture mode ${captureMode || "full"} selects at least one accepted physical meld`);

const errors: string[] = [];
for (const engine of captureMode ? [webkit] : [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const fixture of runCases) {
      const capacity = fixture.variant === "sanma" ? 3 : 4;
      const viewers = Array.from({ length: capacity }, (_, seat) => seat);
      const videoFixture = engine === webkit && (captureMode === "kan"
        ? fixture.variant === "yonma" && (fixture.kind === "closed" || fixture.kind === "added")
        : fixture.variant === "yonma" && fixture.kind === "pon" && fixture.sourceChoice === "pon:p505-" && fixture.actor === 1);
      const videoViewer = captureMode === "kan" ? fixture.actor : 1;
      const primaryViewers = videoFixture ? [...viewers.filter(viewer => viewer !== videoViewer), videoViewer] : viewers;
      const viewports = captureMode
        ? [{ width: 844, height: 390, viewers: [videoViewer] }]
        : [{ width: 844, height: 390, viewers: primaryViewers },
          { width: 667, height: 375, viewers: [fixture.actor] },
          { width: 1440, height: 810, viewers: [fixture.actor] }];
      for (const size of viewports) {
        const video = videoFixture && size.width === 844;
        const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, ...(video ? { recordVideo: { dir: out, size: { width: size.width, height: size.height } } } : {}) });
        const page = await context.newPage();
        page.on("pageerror", error => errors.push(`${engine.name()} ${fixture.variant} ${fixture.kind}: ${error.message}`));
        try {
          await page.route("https://mahjong.local/images/**", route => {
            const path = new URL(route.request().url()).pathname;
            return route.fulfill({ status: 200, contentType: path.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync(`public${path}`) });
          });
          await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><div id="root"></div>`);
          await page.addScriptTag({ content: `globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}` });
          for (const viewer of size.viewers) {
            const room = roomFor(fixture, viewer);
            await page.evaluate(({ room, viewer }) => (window as any).meldSolidRender(room, viewer), { room, viewer });
            await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
            const group = page.locator(`[data-meld-seat="${fixture.actor}"][data-meld-index="0"]`);
            assert.equal(await group.count(), 1, `${engine.name()} ${fixture.variant}/${fixture.kind} viewer ${viewer}: one accepted public meld`);
            const geometry = await group.evaluate(element => {
              const table = document.querySelector<HTMLElement>(".mahjong-table")!.getBoundingClientRect();
              const volumes = [...element.querySelectorAll<HTMLElement>("[data-meld-volume]")];
              const problems: string[] = [];
              const projections = volumes.map(volume => {
                const style = getComputedStyle(volume), width = parseFloat(style.width), height = parseFloat(style.height);
                const depth = height * .4;
                const probe = (parent: HTMLElement, x: number, y: number, z: number) => {
                  const marker = document.createElement("i");
                  marker.style.cssText = `position:absolute!important;left:${x}px!important;top:${y}px!important;width:0!important;height:0!important;margin:0!important;padding:0!important;border:0!important;opacity:0!important;pointer-events:none!important;transform:translateZ(${z}px)!important;`;
                  parent.append(marker);
                  const rect = marker.getBoundingClientRect();
                  marker.remove();
                  return { x: rect.left, y: rect.top };
                };
                const floor = probe(volume, width / 2, height / 2, 0), cap = probe(volume, width / 2, height / 2, depth);
                const slot = volume.closest<HTMLElement>(".mahjong-meld__slot,.mahjong-meld__back")!;
                const slotStyle = getComputedStyle(slot), slotWidth = parseFloat(slotStyle.width), slotHeight = parseFloat(slotStyle.height);
                const floorCorners = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => probe(volume, x, y, 0));
                const footprintCorners = [[0, 0], [slotWidth, 0], [slotWidth, slotHeight], [0, slotHeight]].map(([x, y]) => probe(slot, x, y, 0));
                const nearestResiduals = floorCorners.map(point => Math.min(...footprintCorners.map(other => Math.hypot(point.x - other.x, point.y - other.y))));
                if (nearestResiduals.some(residual => residual > 1)) problems.push(`body floor is out of slot footprint by ${Math.max(...nearestResiduals).toFixed(2)}px; volume=${width}x${height} slot=${slotWidth}x${slotHeight} floor=${JSON.stringify(floorCorners)} footprint=${JSON.stringify(footprintCorners)}`);
                const sides = [...volume.querySelectorAll<HTMLElement>("[data-meld-side]")].map(side => {
                  const rect = side.getBoundingClientRect();
                  if (getComputedStyle(side).visibility !== "visible" || rect.width < .5 || rect.height < .5)
                    problems.push(`non-projecting side ${side.dataset.meldSide}: ${rect.width.toFixed(2)}×${rect.height.toFixed(2)}`);
                  if (rect.left < table.left - 1 || rect.top < table.top - 1 || rect.right > table.right + 1 || rect.bottom > table.bottom + 1)
                    problems.push(`side clipped by table ${side.dataset.meldSide}: ${JSON.stringify(rect.toJSON())}`);
                  return { side: side.dataset.meldSide, rect: rect.toJSON() };
                });
                const capElement = volume.querySelector<HTMLElement>("[data-meld-surface=cap]")!;
                const capRect = capElement.getBoundingClientRect();
                const center = document.elementFromPoint(capRect.left + capRect.width / 2, capRect.top + capRect.height / 2);
                if (!center?.closest(".mahjong-meld") || center.closest(".mahjong-meld") !== element)
                  problems.push(`top cap hit-test escaped meld: ${center?.className || center?.tagName || "none"}`);
                for (const [label, rect] of [["cap", capRect], ["volume", volume.getBoundingClientRect()]] as const) {
                  if (rect.left < table.left - 1 || rect.top < table.top - 1 || rect.right > table.right + 1 || rect.bottom > table.bottom + 1)
                    problems.push(`${label} clipped by table: ${JSON.stringify(rect.toJSON())}`);
                }
                return { depth, floor, cap, lift: Math.hypot(cap.x - floor.x, cap.y - floor.y), capRect: capRect.toJSON(), sides };
              });
              const layers = [...element.querySelectorAll<HTMLElement>("[data-layer]")].map(slot => ({ layer: slot.dataset.layer, rect: slot.getBoundingClientRect().toJSON() }));
              return { problems, projections, layers, backs: element.querySelectorAll(".mahjong-meld__back").length,
                faces: [...element.querySelectorAll<HTMLElement>(".mahjong-meld__face")].map(face => face.dataset.tileFace) };
            });
            if (geometry.problems.length) {
              await page.screenshot({ path: `${out}/failure-${engine.name()}-${fixture.variant}-${fixture.kind}-${viewer}-${size.width}.png` });
              writeFileSync(`${out}/failure.json`, JSON.stringify({ variant: fixture.variant, kind: fixture.kind, viewer, size, sourceChoice: fixture.sourceChoice, geometry }, null, 2));
            }
            assert.deepEqual(geometry.problems, [], `${engine.name()} ${fixture.variant}/${fixture.kind} viewer ${viewer} ${size.width}: physical faces project, stay inside the table, and own their hit target`);
            for (const projection of geometry.projections) {
              assert.ok(projection.depth > 0, `${fixture.kind}: public table depth is 0.4 × tile height`);
              assert.ok(projection.lift > 1, `${fixture.kind}: the rendered cap rises above its floor marker`);
              assert.deepEqual(projection.sides.map(side => side.side).sort(), ["bottom", "left", "right", "top"]);
            }
            if (fixture.kind === "closed") assert.equal(geometry.backs, 2, "closed kan keeps exactly two tile backs");
            if (fixture.kind === "added") {
              assert.deepEqual(geometry.layers.map(layer => layer.layer), ["added", "called"], "kakan stays in its existing two-row tabletop adjacency");
              assert.equal(geometry.layers.length, 2);
            }
            sceneCount.renders++;
            if (video && viewer === videoViewer) {
              const id = fixture.sourceChoice!.replace(/[^a-zA-Z0-9]+/g, "-");
              await page.screenshot({ path: `${out}/webkit-${id}-full.png` });
              await page.waitForTimeout(300);
            }
            const expectedFaces = fixture.meld?.match(/[mpsz]\d/g)?.map(value => value) ?? [];
            if (expectedFaces.some(value => value.endsWith("0"))) assert.ok(geometry.faces.includes(expectedFaces.find(value => value.endsWith("0"))!.toLowerCase()), "accepted physical red-five choice remains visible");
            sceneCount.choices++;
          }
        } finally {
          await context.close();
        }
      }
    }
  } finally { await browser.close(); }
}
assert.deepEqual(errors, [], "no mounted-game browser exceptions");
writeFileSync(`${out}/summary.json`, JSON.stringify({ ...sceneCount, cases: cases.map(fixture => ({ variant: fixture.variant, kind: fixture.kind, meld: fixture.meld, sourceChoice: fixture.sourceChoice })), errors }, null, 2));
console.log(`PASS ${sceneCount.renders} native Chromium/WebKit renders; ${sceneCount.choices} real engine accepted Choice snapshots${captureMode ? ` (${captureMode} compositor capture)` : ""}.`);
console.log(`Evidence directory: ${out}`);
