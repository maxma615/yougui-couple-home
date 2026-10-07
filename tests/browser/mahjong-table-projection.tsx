// Real-engine rendered surface geometry. Screenshots and measurements stay in ignored .local/audit.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit, type Page } from "@playwright/test";
import { projectedSampleScript } from "./projected-samples";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { Choice, GameVariant, GameView, RoomView } from "../../src/modules/mahjong/types";

type RealGame = { view(seat: number): GameView; respond(seat: number, decisionId: string, choiceId: string): void };
type SceneSpec = { id: string; variant: GameVariant; actor: number; riichi?: boolean; nuki?: boolean };
type Scene = SceneSpec & { game: RealGame; before: RoomView; after: RoomView; choice: Choice };
type Point = { x: number; y: number };
type Quad = [Point, Point, Point, Point];

const names = ["玩家", "电脑甲", "电脑乙", "电脑丙"];
const widths = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1440, height: 810 }];
const geometryOnly = process.argv.includes("--geometry-only");
const tileList = (encoded: string) => [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));

function sanmaWall(actor: number, hand: string, draw: string) {
  return { dealer: actor, wallFactory: () => {
    const available = sanmaTiles();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `physical Sanma tile exhausted: ${tile}`);
      return available.splice(index, 1)[0];
    };
    const dealtBySeat = Array.from({ length: 3 }, () => [] as string[]);
    dealtBySeat[actor] = tileList(hand).map(take);
    for (let offset = 1; offset < 3; offset++) dealtBySeat[(actor + offset) % 3] = available.splice(0, 13);
    const orderedDeal = Array.from({ length: 3 }, (_, wind) => dealtBySeat[(actor + wind) % 3]).flat();
    const liveDraw = take(draw), replacement = available.splice(0, 4), indicators = available.splice(0, 10);
    return new SanmaWall([...orderedDeal, liveDraw, ...available, ...replacement, ...indicators]);
  }};
}

function riichiWall(actor: number, hand: string, draw: string) {
  return { dealer: actor, wallFactory: (rule: ConstructorParameters<typeof Majiang.Shan>[0]) => {
    const wall = new Majiang.Shan(rule), available = wall._pai.slice();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `physical Riichi tile exhausted: ${tile}`);
      available.splice(index, 1);
      return tile;
    };
    const dealtBySeat = Array.from({ length: 4 }, () => [] as string[]);
    dealtBySeat[actor] = tileList(hand).map(take);
    for (let offset = 1; offset < 4; offset++) dealtBySeat[(actor + offset) % 4] = available.splice(0, 13);
    const orderedDeal = Array.from({ length: 4 }, (_, wind) => dealtBySeat[(actor + wind) % 4]).flat();
    take(draw);
    wall._pai = [...available, ...[...orderedDeal, draw].reverse()];
    wall._baopai = [wall._pai[4]];
    wall._fubaopai = [wall._pai[9]];
    return wall;
  }};
}

function passPending(game: RealGame, capacity: number) {
  for (let cycle = 0; cycle < capacity + 1; cycle++) {
    const phase = game.view(0).phase;
    if (phase !== "dapai" && phase !== "gang" && phase !== "nuki") return;
    let passed = false;
    for (let seat = 0; seat < capacity; seat++) {
      const view = game.view(seat), choice = view.choices.find(item => item.type === "pass");
      if (choice) { game.respond(seat, view.decisionId, choice.id); passed = true; }
    }
    if (!passed && game.view(0).phase === phase) return;
  }
}

function scene(spec: SceneSpec): Scene {
  const capacity = spec.variant === "sanma" ? 3 : 4;
  const hand = spec.nuki ? "p112233s45678z14" : spec.riichi ? "p123456789s123z2" : "p112233s456789z1";
  const draw = spec.nuki ? "s9" : spec.riichi ? "z3" : "z7";
  const game: RealGame = spec.variant === "sanma"
    ? new SanmaGame("east", names.slice(0, 3), sanmaWall(spec.actor, hand, draw))
    : new RiichiGame("east", names, riichiWall(spec.actor, hand, draw));

  if (spec.nuki) {
    const actorView = game.view(spec.actor), nuki = actorView.choices.find(choice => choice.type === "nuki");
    assert.ok(nuki, `${spec.id}: physical wall must produce a legal North extraction`);
    game.respond(spec.actor, actorView.decisionId, nuki.id);
    passPending(game, capacity);
    assert.equal(game.view(spec.actor).phase, "nukizimo", `${spec.id}: North extraction reaches its replacement draw`);
  }

  const beforeGame = game.view(0), actorView = game.view(spec.actor);
  const choice = actorView.choices.find(item => item.type === (spec.riichi ? "riichi" : "discard")
    && (spec.riichi ? item.value === `${draw}_` : item.value === "p1"));
  assert.ok(choice, `${spec.id}: choose a legal ${spec.riichi ? "riichi sideways" : "ordinary"} discard from the real engine`);
  game.respond(spec.actor, actorView.decisionId, choice.id);
  passPending(game, capacity);
  const afterGame = game.view(0);
  const before: RoomView = {
    id: `projection-${spec.id}`, code: "ABCDEFGH", hostUserId: "display-user-0", mode: "east", variant: spec.variant,
    status: "playing", version: 1, mySeat: 0, game: beforeGame,
    members: Array.from({ length: capacity }, (_, seat) => ({ userId: `display-user-${seat}`, seat,
      displayName: names[seat], kind: seat === 0 ? "human" : "bot", ready: true, connected: true })),
  };
  const after: RoomView = { ...before, version: 2, game: afterGame };
  const publicDiscard = afterGame.players.find(player => player.seat === spec.actor)!.discards.at(-1);
  assert.ok(publicDiscard, `${spec.id}: selected engine Choice must reach the public river`);
  if (spec.riichi) assert.ok(publicDiscard.includes("*"), `${spec.id}: legal riichi Choice must create a sideways declaration`);
  if (spec.nuki) assert.equal(afterGame.players.find(player => player.seat === 0)?.nuki, 1, `${spec.id}: extracted North is retained in the public state`);
  console.log(`ENGINE ${spec.id}: seat=${spec.actor} choice=${choice.id} river=${publicDiscard} phase=${afterGame.phase} nuki=${afterGame.players.find(player => player.seat === 0)?.nuki ?? 0}.`);
  return { ...spec, game, before, after, choice };
}

const projectionScenes = [
  scene({ id: "sanma-nuki-own-discard", variant: "sanma", actor: 0, nuki: true }),
  scene({ id: "yonma-own-riichi", variant: "yonma", actor: 0, riichi: true }),
];
const flightScenes = [
  projectionScenes[0],
  scene({ id: "sanma-opponent-west", variant: "sanma", actor: 2 }),
  projectionScenes[1],
  scene({ id: "yonma-opponent-west", variant: "yonma", actor: 3 }),
];

const harness = `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {GameRoom} from './src/components/mahjong/mahjong-client';
let setRoom,setConnected,setCanAnimate,currentIntent=null;window.projectionApi={lastChoice:null,lastIntent:null};
function Scene(){const[room,roomSetter]=useState(window.projectionFixture);const[connected,connectionSetter]=useState(true);const[canAnimate,animateSetter]=useState(true);setRoom=roomSetter;setConnected=connectionSetter;setCanAnimate=animateSetter;return React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,host:true,busy:false,ownSeat:0,connected,motionCanAnimate:canAnimate,motionIntent:currentIntent,onChoice:(choice,intent)=>{window.projectionApi.lastChoice=choice;window.projectionApi.lastIntent=intent;currentIntent=intent},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})));}
const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(React.createElement(Scene)));window.projectionApi.dispose=()=>root.unmount();window.projectionApi.update=room=>flushSync(()=>setRoom(room));window.projectionApi.quietUpdate=room=>flushSync(()=>{setCanAnimate(false);setRoom(room)});window.projectionApi.connected=value=>flushSync(()=>setConnected(value));`;
const bundle = await build({ stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" }, bundle: true,
  platform: "browser", format: "iife", write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
const cssFiles = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css", "mahjong-table-center.css", "mahjong-table-edge.css", "mahjong-camera.css"];
const css = cssFiles.map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");
const cameraSha = createHash("sha256").update(readFileSync("src/app/mahjong/mahjong-camera.css")).digest("hex");
const clientSha = createHash("sha256").update(readFileSync("src/components/mahjong/mahjong-client.tsx")).digest("hex");
console.log(`CSS_SOURCE camera=${cameraSha} client=${clientSha} engine-harness=${createHash("sha256").update(css).digest("hex")}`);

async function mount(page: Page, room: RoomView, size: { width: number; height: number }) {
  await page.goto("about:blank");
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*{box-sizing:border-box}${css}</style><div id="root"></div>`);
  await page.evaluate(value => { (window as any).projectionFixture = value; }, room);
  const script = `globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}`;
  await page.addScriptTag({ content: script });
  await page.addScriptTag({ content: projectedSampleScript });
  await page.getByTestId("mahjong-board").waitFor({ state: "visible", timeout: 4000 });
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
  await page.waitForTimeout(260);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function projection(page: Page, spec: SceneSpec) {
  return page.evaluate(({ nuki, variant }) => {
    const table = document.querySelector<HTMLElement>(".mahjong-table");
    const surface = document.querySelector<HTMLElement>(".mahjong-table__surface");
    if (!table || !surface) throw new Error("shared .mahjong-table__surface has not mounted");
    const board = table.getBoundingClientRect();

    function corners(element: HTMLElement) {
      const oldPosition = element.style.getPropertyValue("position");
      const oldPriority = element.style.getPropertyPriority("position");
      if (getComputedStyle(element).position === "static") element.style.setProperty("position", "relative", "important");
      const style = getComputedStyle(element);
      const leftBorder = Number.parseFloat(style.borderLeftWidth) || 0, rightBorder = Number.parseFloat(style.borderRightWidth) || 0;
      const topBorder = Number.parseFloat(style.borderTopWidth) || 0, bottomBorder = Number.parseFloat(style.borderBottomWidth) || 0;
      const coords = [[-leftBorder, -topBorder], [element.clientWidth + rightBorder, -topBorder],
        [element.clientWidth + rightBorder, element.clientHeight + bottomBorder], [-leftBorder, element.clientHeight + bottomBorder]];
      const points = coords.map(([x, y]) => {
        const marker = document.createElement("i");
        marker.setAttribute("data-projection-point", "");
        Object.assign(marker.style, { position: "absolute", display: "block", visibility: "hidden", opacity: "0", pointerEvents: "none",
          margin: "0", padding: "0", border: "0", width: "0", height: "0", transform: "none", left: `${x}px`, top: `${y}px` });
        element.append(marker);
        const rect = marker.getBoundingClientRect();
        marker.remove();
        return { x: rect.left, y: rect.top };
      });
      if (oldPosition) element.style.setProperty("position", oldPosition, oldPriority);
      else element.style.removeProperty("position");
      return points as [{x:number;y:number},{x:number;y:number},{x:number;y:number},{x:number;y:number}];
    }
    function metrics(element: HTMLElement) {
      const p = corners(element), top = [p[1].x - p[0].x, p[1].y - p[0].y], side = [p[3].x - p[0].x, p[3].y - p[0].y];
      const length = (v: number[]) => Math.hypot(v[0], v[1]);
      const angle = (v: number[]) => Math.atan2(v[1], v[0]) * 180 / Math.PI;
      const dot = Math.abs(top[0] * side[0] + top[1] * side[1]) / Math.max(1, length(top) * length(side));
      const area = Math.abs(p.reduce((sum, point, index) => {
        const next = p[(index + 1) % p.length]; return sum + point.x * next.y - next.x * point.y;
      }, 0)) / 2;
      return { points: p, area, center: { x: p.reduce((sum, point) => sum + point.x, 0) / 4, y: p.reduce((sum, point) => sum + point.y, 0) / 4 },
        topAngle: angle(top), sideAngle: angle(side), orthogonality: dot,
        rect: (() => { const r = element.getBoundingClientRect(); return { x:r.x,y:r.y,w:r.width,h:r.height }; })() };
    }
    function projectedPoint(q: any[], u: number, v: number) {
      const [p0,p1,p2,p3]=q, dx1=p1.x-p2.x, dx2=p3.x-p2.x, dx3=p0.x-p1.x+p2.x-p3.x,
        dy1=p1.y-p2.y, dy2=p3.y-p2.y, dy3=p0.y-p1.y+p2.y-p3.y;
      const denominator=dx1*dy2-dx2*dy1;
      const g=Math.abs(denominator)<1e-8?0:(dx3*dy2-dx2*dy3)/denominator;
      const h=Math.abs(denominator)<1e-8?0:(dx1*dy3-dx3*dy1)/denominator;
      const a=p1.x-p0.x+g*p1.x,b=p3.x-p0.x+h*p3.x,c=p0.x,d=p1.y-p0.y+g*p1.y,e=p3.y-p0.y+h*p3.y,f=p0.y;
      const w=g*u+h*v+1;
      return {x:(a*u+b*v+c)/w,y:(d*u+e*v+f)/w};
    }
    const surfaceMetrics = metrics(surface), surfaceStyle = getComputedStyle(surface);
    const center = document.querySelector<HTMLElement>(".mahjong-table__center")!;
    const centerMetrics = metrics(center);
    const sideRacks = [...surface.querySelectorAll<HTMLElement>(".mahjong-table__position--east .mahjong-opponent-rack,.mahjong-table__position--west .mahjong-opponent-rack")].map(rack => {
      const seat = Number(rack.closest<HTMLElement>("[data-testid^='player-']")?.dataset.testid?.replace("player-", ""));
      const tiles = [...rack.querySelectorAll<HTMLElement>(".mahjong-player__hidden > i")].map(tile => metrics(tile)).sort((a,b) => a.center.y-b.center.y);
      const far=tiles[0],near=tiles.at(-1)!;
      const axisDelta=(value:number)=>{const modulo=((value%90)+90)%90;return Math.min(modulo,90-modulo);};
      return { seat, count:tiles.length, farArea:far?.area, nearArea:near?.area, nearFarAreaRatio:far?.area?near.area/far.area:null,
        far:far&&{topAngle:far.topAngle,sideAngle:far.sideAngle,orthogonality:far.orthogonality,center:far.center},
        near:near&&{topAngle:near.topAngle,sideAngle:near.sideAngle,orthogonality:near.orthogonality,center:near.center},
        maxNonAxisAngleDeg:tiles.length?Math.max(...tiles.flatMap(tile=>[axisDelta(tile.topAngle),axisDelta(tile.sideAngle)])):null,
        maxNonOrthogonality:tiles.length?Math.max(...tiles.map(tile=>tile.orthogonality)):null };
    });
    const riverFaces = [...surface.querySelectorAll<HTMLElement>(".mahjong-river__tile .mahjong-tile")].map(tile=>metrics(tile));
    const allTiles = [...document.querySelectorAll<HTMLElement>("[data-tile-face],.mahjong-player__hidden > i,.mahjong-meld__back")].filter(el=>{
      const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=="hidden";
    });
    const tileIssues:string[]=[];
    for(const tile of allTiles){
      const q=corners(tile);
      for(const [index,p] of q.entries())if(p.x<board.left-.5||p.y<board.top-.5||p.x>board.right+.5||p.y>board.bottom+.5)tileIssues.push(`projected tile corner outside table: ${tile.dataset.tileFace||tile.className} corner=${index}`);
      for(const [u,v] of [[.16,.16],[.5,.5],[.84,.16],[.16,.84],[.84,.84]]){
        const p=projectedPoint(q,u,v),hit=document.elementFromPoint(p.x,p.y);
        if(!hit||!tile.contains(hit))tileIssues.push(`projected local ${u},${v} miss ${tile.dataset.tileFace||tile.className}; hit=${hit?.className||hit?.tagName||"none"}`);
      }
    }
    const images=[...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")];
    for(const image of images)if(!image.complete||image.naturalWidth!==300||image.naturalHeight!==400)tileIssues.push(`stock image is not 300x400: ${image.currentSrc||image.src}`);
    const avatar=document.querySelector<HTMLElement>(".mahjong-table__position .mahjong-player__head");
    const ownHead=document.querySelector<HTMLElement>(".mahjong-table__own .mahjong-player__head");
    const ownTile=document.querySelector<HTMLElement>('.mahjong-table__own .mahjong-hand [data-tile-face]');
    const dora=document.querySelector<HTMLElement>(".mahjong-table__dora");
    const nukiCounter=document.querySelector<HTMLElement>('.mahjong-table__own .mahjong-player__nuki');
    const nukiTray=document.querySelector<HTMLElement>('.mahjong-table__own-public .mahjong-nuki-tray');
    const action=document.querySelector<HTMLElement>(".mahjong-action-dock");
    const flat={avatar:avatar&&metrics(avatar),ownHead:ownHead&&metrics(ownHead),ownTile:ownTile&&metrics(ownTile),dora:dora&&metrics(dora),
      nukiCounter:nukiCounter&&metrics(nukiCounter),nukiTray:nukiTray&&metrics(nukiTray),action:action&&metrics(action)};
    const flatOutside={avatar:!!avatar&&!surface.contains(avatar),ownHead:!!ownHead&&!surface.contains(ownHead),ownTile:!!ownTile&&!surface.contains(ownTile),
      dora:!!dora&&!surface.contains(dora),nukiCounter:!!nukiCounter&&!surface.contains(nukiCounter),action:!!action&&!surface.contains(action)};
    if(!surface.contains(center)||!surface.contains(document.querySelector(".mahjong-table__grain"))||!surface.contains(document.querySelector(".mahjong-table__seams")))tileIssues.push("center/grain/seams do not share the projected surface");
    if(!surface.querySelector(".mahjong-river"))tileIssues.push("rivers are outside the shared projected surface");
    if(nukiTray&&!surface.contains(nukiTray))tileIssues.push("own extracted North is outside the physical surface");
    if(nuki&&(!nukiCounter||!nukiTray||!nukiTray.querySelector('[data-tile-face="z4"]')))tileIssues.push("real North extraction is not shown in own count/tray");
    return { surface:{rect:surfaceMetrics.rect,points:surfaceMetrics.points,transform:surfaceStyle.transform,origin:surfaceStyle.transformOrigin,perspective:surfaceStyle.perspective,
        centerXOffset:surfaceMetrics.center.x-(board.left+board.width/2),centerYOffset:surfaceMetrics.center.y-(board.top+board.height/2)},
      center:{points:centerMetrics.points,rect:centerMetrics.rect,topAngle:centerMetrics.topAngle,sideAngle:centerMetrics.sideAngle,orthogonality:centerMetrics.orthogonality},
      sideRacks,riverFaceCount:riverFaces.length,rivers:riverFaces.map(({points,rect,topAngle,sideAngle,orthogonality})=>({points,rect,topAngle,sideAngle,orthogonality})),
      flat,flatOutside,table:{x:board.x,y:board.y,width:board.width,height:board.height},tiles:allTiles.length,images:images.length,tileIssues,variant,nuki };
  }, { nuki: !!spec.nuki, variant: spec.variant });
}

const results: unknown[] = [];
const flightResults: unknown[] = [];
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on("pageerror", error => console.error(`PAGEERROR ${engine.name()}: ${error.message}`));
    await page.route("https://mahjong.local/images/**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      const contentType = pathname.endsWith(".svg") ? "image/svg+xml"
        : pathname.endsWith(".webp") ? "image/webp"
          : pathname.endsWith(".png") ? "image/png" : "application/octet-stream";
      await route.fulfill({ status: 200, contentType, body: readFileSync(`public${pathname}`) });
    });
    for (const fixture of projectionScenes) for (const size of widths) {
      await mount(page, fixture.after, size);
      assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "cold engine snapshot must not replay its prior discard");
      const measured = await projection(page, fixture);
      console.log(`GEOMETRY ${engine.name()} ${fixture.id} ${size.width}x${size.height}: ${JSON.stringify(measured)}`);
      if (!geometryOnly) assert.deepEqual(measured.tileIssues, [], `${engine.name()} ${fixture.id}: projected five-point/table/image checks`);
      if (size.width === 844) await page.screenshot({ path: `.local/audit/mahjong-table-projection-${engine.name()}-${fixture.variant}-844.png` });
      results.push({ engine: engine.name(), scene: fixture.id, size, measured });
    }
    if (!geometryOnly) for (const fixture of flightScenes) for (const size of widths) {
      await mount(page, fixture.before, size);
      let expectedSource: Point[];
      if (fixture.actor === 0) {
        if (fixture.riichi) await page.getByRole("button", { name: "立直", exact: true }).click();
        const tile = fixture.riichi
          ? page.locator('.is-drawn[data-choice-type="riichi"]')
          : page.getByTestId("mahjong-hand").locator('[data-tile-face="p1"]').nth(1);
        await tile.click();
        await page.waitForTimeout(120);
        await tile.click();
        const intent = await page.evaluate(() => (window as any).projectionApi.lastIntent);
        assert.equal((await page.evaluate(() => (window as any).projectionApi.lastChoice))?.id, fixture.choice.id,
          `${fixture.id}: UI must submit the engine Choice`);
        assert.ok(intent?.sourceGeometry?.quad, `${fixture.id}: own discard intent must include its measured source quad`);
        expectedSource = [intent.sourceGeometry.quad.topLeft, intent.sourceGeometry.quad.topRight,
          intent.sourceGeometry.quad.bottomRight, intent.sourceGeometry.quad.bottomLeft];
        assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "a local choice alone must not start the server-confirmed flight");
      } else {
        const source = page.locator(`[data-motion-rack-seat="${fixture.actor}"] > i`).last();
        expectedSource = await source.evaluate(element => (window as any).mahjongPhysicalSamples(element, [[0,0],[1,0],[1,1],[0,1]]));
      }

      await page.evaluate(after => (window as any).projectionApi.update(after), fixture.after);
      await page.getByTestId("mahjong-discard-flight").waitFor({ state: "attached", timeout: 2000 });
      const measured = await page.evaluate(async ({ expectedSource, after, checkQuietResize }) => {
        const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const quad = (element: HTMLElement) => (window as any).mahjongPhysicalSamples(element, [[0,0],[1,0],[1,1],[0,1]]) as Point[];
        const error = (left: Point[], right: Point[]) => Math.max(...left.map((point, index) => Math.hypot(point.x-right[index].x, point.y-right[index].y)));
        const node = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]');
        if (!node) throw new Error("server-confirmed engine snapshot did not mount its flight");
        const movement = node.getAnimations()[0];
        if (!movement) throw new Error("flight must expose the real browser movement animation");
        movement.pause();
        const timing = movement.effect?.getComputedTiming();
        const duration = Number(timing?.duration);
        if (!(duration > 0)) throw new Error(`invalid flight duration ${duration}`);
        const eventId = node.dataset.motionEvent;
        const target = [...document.querySelectorAll<HTMLElement>("[data-discard-event-id]")].find(element => element.dataset.discardEventId === eventId);
        const face = target?.querySelector<HTMLElement>(".mahjong-tile");
        if (!target || !face) throw new Error(`no rendered river face for event ${eventId}`);
        const targetQuad = quad(face);
        movement.currentTime = 0;
        await nextFrame(); await nextFrame();
        const startQuad = quad(node);
        movement.currentTime = duration / 2;
        await nextFrame(); await nextFrame();
        const middleQuad = quad(node);
        const middleTime = movement.currentTime;
        movement.currentTime = duration - 0.5;
        await nextFrame(); await nextFrame();
        const endQuad = quad(node);
        const result: any = { eventId, source: node.dataset.motionSource, seat: Number(node.dataset.motionSeat), duration,
          startQuad, expectedSource, targetQuad, endQuad, middleQuad, middleTime,
          startError: error(startQuad, expectedSource), endError: error(endQuad, targetQuad),
          pointerEvents: getComputedStyle(node).pointerEvents, ariaHidden: node.getAttribute("aria-hidden"),
          targetHidden: getComputedStyle(target).opacity === "0" || getComputedStyle(face).opacity === "0" };
        if (checkQuietResize) {
          movement.currentTime = duration / 2;
          await nextFrame();
          const heldTime = movement.currentTime;
          (window as any).projectionApi.quietUpdate(structuredClone(after));
          await nextFrame(); await nextFrame();
          const afterQuietNode = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]');
          const afterQuietAnimation = afterQuietNode?.getAnimations()[0];
          result.quietPreserved = afterQuietNode === node && afterQuietAnimation === movement && movement.currentTime === heldTime;
          (window as any).projectionHeldEvent = eventId;
        }
        return result;
      }, { expectedSource, after: fixture.after, checkQuietResize: size.width === 844 && fixture.id === "sanma-nuki-own-discard" });
      assert.equal(measured.source, fixture.actor === 0 ? "own" : "opponent");
      assert.equal(measured.seat, fixture.actor);
      assert.ok(measured.startError < 1.5, `${engine.name()} ${fixture.id} ${size.width}: source quad error ${measured.startError}px`);
      assert.ok(measured.endError < 2, `${engine.name()} ${fixture.id} ${size.width}: target quad error ${measured.endError}px`);
      assert.equal(measured.pointerEvents, "none");
      assert.equal(measured.ariaHidden, "true");
      assert.equal(measured.targetHidden, true);
      if (size.width === 844) await page.screenshot({ path: `.local/audit/mahjong-table-projection-flight-${engine.name()}-${fixture.id}-844.png` });
      if (size.width === 844 && fixture.id === "sanma-nuki-own-discard") {
        assert.equal((measured as any).quietPreserved, true, "quiet rerender must preserve current flight node and paused animation time");
        await page.setViewportSize({ width: size.width + 2, height: size.height });
        await page.waitForTimeout(60);
        assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "resize must cancel an in-progress flight");
        assert.equal(await page.locator(`[data-discard-event-id="${(measured as any).eventId}"] .mahjong-tile`).evaluate(element => getComputedStyle(element).opacity), "1",
          "resize cancellation must reveal the confirmed river face");
      }
      console.log(`FLIGHT ${engine.name()} ${fixture.id} ${size.width}x${size.height}: ${JSON.stringify(measured)}`);
      flightResults.push({ engine: engine.name(), scene: fixture.id, size, measured });
    }
    await page.evaluate(() => (window as any).projectionApi.dispose());
  } finally { await browser.close(); }
}

writeFileSync(".local/audit/mahjong-table-projection-geometry.json", JSON.stringify({ cameraSha, clientSha, geometryOnly, results, flightResults }, null, 2) + "\n");
console.log(`PASS ${results.length} real-engine projected GameRoom geometry snapshots and ${flightResults.length} quad-measured real-engine flights across Chromium/WebKit at 667×375, 844×390, 1440×810.`);
