// Render authority-produced snapshots through the actual interactive table.
// This checks animation geometry; real Socket submission is tested separately.
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit, type Page } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { Choice, GameVariant, RoomView } from "../../src/modules/mahjong/types";

const encodedTiles = (s: string) => [...s.matchAll(/([mpsz])(\d+)/g)].flatMap(m => [...m[2]].map(n => m[1] + n));
function scene(variant: GameVariant, actor: number, riichi = false) {
  const capacity = variant === "sanma" ? 3 : 4;
  const hand = riichi ? "p123456789s123z2" : "p112233s456789z1";
  const draw = riichi ? "z3" : "z7";
  const allocate = (available: string[]) => {
    const take = (tile: string) => {
      const i = available.indexOf(tile); assert.ok(i >= 0, `physical fixture missing ${tile}`);
      return available.splice(i, 1)[0];
    };
    const hands = Array.from({ length: capacity }, () => [] as string[]);
    hands[actor] = encodedTiles(hand).map(take); take(draw);
    for (let seat = 0; seat < capacity; seat++) if (seat !== actor) hands[seat] = available.splice(0, 13);
    return Array.from({ length: capacity }, (_, wind) => hands[(actor + wind) % capacity]).flat();
  };
  const game = variant === "sanma"
    ? new SanmaGame("east", ["玩家", "电脑甲", "电脑乙"], { dealer: actor, wallFactory: () => {
      const available = sanmaTiles(), dealt = allocate(available);
      const reserve = available.splice(0, 4), indicators = available.splice(0, 10);
      return new SanmaWall([...dealt, draw, ...available, ...reserve, ...indicators]);
    } })
    : new RiichiGame("east", ["玩家", "电脑甲", "电脑乙", "电脑丙"], { dealer: actor, wallFactory: rule => {
      const wall = new Majiang.Shan(rule), available = wall._pai.slice(), dealt = allocate(available);
      wall._pai = [...available, ...[...dealt, draw].reverse()];
      wall._baopai = [wall._pai[4]]; wall._fubaopai = [wall._pai[9]]; return wall;
    } });
  const before = game.view(0), acting = game.view(actor);
  const choice = acting.choices.find(c => c.type === (riichi ? "riichi" : "discard") && c.value === (riichi ? draw + "_" : "p1"));
  assert.ok(choice, "real engine must offer requested fixture action");
  game.respond(actor, acting.decisionId, choice.id);
  const room: RoomView = {
    id: `motion-${variant}-${actor}-${riichi}`, code: "ABCDEFGH", hostUserId: "display-user-0", variant,
    mode: "east", status: "playing", version: 1, mySeat: 0, game: before,
    members: Array.from({ length: capacity }, (_, seat) => ({ userId: `display-user-${seat}`, seat,
      displayName: seat === 0 ? "玩家" : `电脑${seat}`, kind: seat === 0 ? "human" : "bot", ready: true, connected: true })),
  };
  return { room, after: { ...room, version: 2, game: game.view(0) }, choice: actor === 0 ? choice : null };
}

const harness = `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
import {GameRoom} from './src/components/mahjong/mahjong-client';
let setRoom, setConnected, setCanAnimate, currentIntent=null; window.motionApi={lastChoice:null};
function Scene(){const [room,roomSetter]=useState(window.motionFixture.room);const[connected,connectionSetter]=useState(true);const[canAnimate,canAnimateSetter]=useState(true);setRoom=roomSetter;setConnected=connectionSetter;setCanAnimate=canAnimateSetter;return React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,host:true,busy:false,ownSeat:0,connected,motionCanAnimate:canAnimate,motionIntent:currentIntent,onChoice:(c,intent)=>{window.motionApi.lastChoice=c;currentIntent=intent},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))}
const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(React.createElement(Scene)));window.motionApi.dispose=()=>root.unmount();
window.motionApi.update=room=>flushSync(()=>setRoom(room));window.motionApi.connected=value=>flushSync(()=>setConnected(value));window.motionApi.quietUpdate=room=>flushSync(()=>{setCanAnimate(false);setRoom(room)});`;
const bundle = await build({ stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" }, bundle: true,
  platform: "browser", format: "iife", write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
const css = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css", "mahjong-table-center.css"]
  .filter(file => existsSync("src/app/mahjong/" + file)).map(file => readFileSync("src/app/mahjong/" + file, "utf8")).join("\n");
const script = "globalThis.__name=(target,value)=>Object.defineProperty(target,\"name\",{value,configurable:true});globalThis.process={env:{NODE_ENV:\"development\"}};\n" + bundle.outputFiles[0].text;
async function mount(page: Page, fixture: ReturnType<typeof scene>, width: number) {
  await page.evaluate(()=>(window as any).motionApi?.dispose?.());
  await page.goto("about:blank"); // Each scene gets a fresh React document and pointer plugins.
  await page.setViewportSize({ width, height: width === 667 ? 375 : width === 844 ? 390 : 810 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*{box-sizing:border-box}${css}</style><div id="root"></div>`);
  await page.evaluate(f => { (window as any).motionFixture = f; }, fixture);
  await page.addScriptTag({ content: script });
  await page.getByTestId("mahjong-board").waitFor({state:"visible",timeout:2000});
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(i => i.complete && i.naturalWidth === 300));
  await page.waitForTimeout(260); // Initial draw/selection effects must have settled before measuring.
  assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "first snapshot must not replay a discard");
}
async function captureFlight(page: Page, fixture: ReturnType<typeof scene>) {
  return page.evaluate(async after => {
    const api = (window as any).motionApi;
    api.update(after);
    for (let frame = 0; frame < 10; frame++) {
      await new Promise(requestAnimationFrame);
      const flight = document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]');
      if (!flight) continue;
      const animation = flight.getAnimations()[0];
      if (!animation) throw Error("flight must expose actual browser animation");
      animation.pause();
      const duration = Number(animation.effect!.getComputedTiming().duration);
      const box = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const event = flight.dataset.motionEvent;
      const target = [...document.querySelectorAll<HTMLElement>('[data-discard-event-id]')].find(e => e.dataset.discardEventId === event);
      if (!target) throw Error("flight must correspond to an actual river event");
      const face = target.querySelector<HTMLElement>('[data-tile-face]')!;
      animation.currentTime = 0; await new Promise(requestAnimationFrame); const start = box(flight); const matrix=new DOMMatrixReadOnly(getComputedStyle(flight).transform);const startAngle=Math.atan2(matrix.b,matrix.a)*180/Math.PI;
      animation.currentTime = duration * .5; await new Promise(requestAnimationFrame); const middle = box(flight);
      animation.currentTime = duration - .01; await new Promise(requestAnimationFrame); const end = box(flight), destination = box(face);
      const result = { start, startAngle, middle, end, destination, source: flight.dataset.motionSource, seat: flight.dataset.motionSeat,
        duration, pointerEvents: getComputedStyle(flight).pointerEvents, ariaHidden: flight.getAttribute('aria-hidden'),
        hiddenTarget: getComputedStyle(target).opacity === '0' || getComputedStyle(face).opacity === '0' };
      animation.finish(); return result;
    }
    throw Error("server-confirmed new discard did not produce a continuous flight");
  }, fixture.after);
}
const center = (b: { x: number; y: number; w: number; h: number }) => [b.x + b.w / 2, b.y + b.h / 2];
async function holdFlight(page: Page, fixture: ReturnType<typeof scene>) {
  const tile=page.getByTestId("mahjong-hand").locator('[data-tile-face="p1"]').nth(1);
  await tile.click(); await page.waitForTimeout(120); await tile.click();
  return page.evaluate(async after=>{
    (window as any).motionApi.update(after);
    for(let i=0;i<10;i++){
      await new Promise(requestAnimationFrame);
      const node=document.querySelector<HTMLElement>('[data-testid="mahjong-discard-flight"]');
      const animation=node?.getAnimations()[0];
      if(animation){animation.pause();(window as any).heldFlightNode=node;return node!.dataset.motionEvent!;}
    }
    throw Error('expected live flight before testing cancellation');
  },fixture.after);
}
let passed = 0, cancellations = 0;
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on("pageerror", error => console.error("BROWSER_RUNTIME",error.message));
    await page.route("https://mahjong.local/images/**", route => {
      const file = new URL(route.request().url()).pathname;
      return route.fulfill({ status: 200, contentType: file.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync("public" + file) });
    });
    for (const variant of ["sanma", "yonma"] as const) for (const width of [667, 844, 1440]) {
      for (let actor = 0; actor < (variant === "sanma" ? 3 : 4); actor++) for (const riichi of [false, true]) {
        const fixture = scene(variant, actor, riichi); await mount(page, fixture, width);
        let source: {x: number; y: number; width: number; height: number} | null = null;
        const rack = actor !== 0 ? await page.getByTestId(`player-${actor}`).locator(".mahjong-opponent-rack").boundingBox() : null;
        if (actor === 0) {
          if (riichi) await page.getByRole("button", { name: "立直", exact: true }).click();
          const tile = riichi ? page.locator('.is-drawn[data-choice-type="riichi"]')
            : page.getByTestId("mahjong-hand").locator('[data-tile-face="p1"]').nth(1);
          await tile.click(); await tile.waitFor({ state: "visible" }); await page.waitForTimeout(120);
          source = await tile.boundingBox(); assert.ok(source);
          await tile.click();
          assert.equal((await page.evaluate(() => (window as any).motionApi.lastChoice)).id, fixture.choice!.id);
          assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "input alone must not animate");
        }
        const f = await captureFlight(page, fixture);
        assert.equal(f.source, actor === 0 ? "own" : "opponent"); assert.equal(Number(f.seat), actor);
        assert.equal(f.pointerEvents, "none"); assert.equal(f.ariaHidden, "true"); assert.equal(f.hiddenTarget, true);
        const end = center(f.end), dest = center(f.destination), startCenter=center(f.start), midCenter=center(f.middle);
        const travelled=Math.hypot(midCenter[0]-startCenter[0],midCenter[1]-startCenter[1]);
        const remaining=Math.hypot(dest[0]-midCenter[0],dest[1]-midCenter[1]);
        const direct=Math.hypot(dest[0]-startCenter[0],dest[1]-startCenter[1]);
        assert.ok(travelled>1 && remaining>1 && Math.abs(travelled+remaining-direct)<3, "middle frame must traverse the continuous source-to-target path");
        assert.ok(Math.hypot(end[0] - dest[0], end[1] - dest[1]) < 2, "flight center must reach rotated river face");
        assert.ok(Math.abs(f.end.w - f.destination.w) < 2 && Math.abs(f.end.h - f.destination.h) < 2, "final footprint must match rotated face");
        if (source) { const start = center(f.start), from = center({ x: source.x, y: source.y, w: source.width, h: source.height });
          assert.ok(Math.hypot(start[0] - from[0], start[1] - from[1]) < 3, "same-face flight must originate from selected physical tile"); }
        if (rack) {
          const expectedAngle=actor===1?-90:variant==="sanma"||actor===3?90:180;
          const angleDelta=((f.startAngle-expectedAngle+540)%360)-180;
          assert.ok(Math.abs(angleDelta)<1,"opponent first frame must preserve public back rack rotation");
          const start=center(f.start); assert.ok(start[0] >= rack.x-3 && start[0] <= rack.x+rack.width+3 && start[1] >= rack.y-3 && start[1] <= rack.y+rack.height+3, "opponent flight must start at the previous public back rack"); }
        await page.waitForTimeout(40);
        assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0);
        await page.evaluate(after => (window as any).motionApi.update(structuredClone(after)), fixture.after);
        await page.waitForTimeout(40); assert.equal(await page.getByTestId("mahjong-discard-flight").count(), 0, "duplicate snapshot must not replay");
        if (actor === 0 && riichi && width === 844) await page.screenshot({ path: `.local/mahjong-motion-${engine.name()}-${variant}-final.png` });
        passed++; console.log(`PASS ${engine.name()} ${variant} ${width} actor=${actor} riichi=${riichi}: source, path, rotated footprint, dedupe`);
      }
    }
    {
      const fixture=scene("sanma",0,false);await mount(page,fixture,844);
      const tile=page.getByTestId("mahjong-hand").locator('[data-tile-face="p1"]').nth(1);
      await tile.hover();await page.waitForTimeout(160);
      const source=await tile.boundingBox(),target=await page.locator(".mahjong-table__center").boundingBox();assert.ok(source&&target);
      await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();
      await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:8});
      await page.waitForTimeout(50);
      await page.waitForFunction(()=>document.querySelector('[data-testid="mahjong-board"]')?.classList.contains('is-discard-target'));
      await page.waitForTimeout(100);
      const dragged=await tile.evaluate(el=>{const r=el.getBoundingClientRect(),m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return{x:r.x,y:r.y,w:r.width,h:r.height,angle:Math.atan2(m.b,m.a)*180/Math.PI};});
      const hit=await page.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return{hit:e?.className,drag:document.querySelector('.is-dragging')?.className,drop:document.querySelector('[data-testid="mahjong-board"]')?.className};},{x:target.x+target.width/2,y:target.y+target.height/2});
      await page.mouse.up();
      const submitted=await page.evaluate(()=>(window as any).motionApi.lastChoice);
      assert.ok(submitted,JSON.stringify({source,target,dragged,hit,fixtureChoice:fixture.choice}));
      assert.equal((await page.evaluate(()=>(window as any).motionApi.lastChoice)).id,fixture.choice!.id);
      const f=await captureFlight(page,fixture),from=center(dragged),actual=center(f.start);
      assert.ok(Math.hypot(from[0]-actual[0],from[1]-actual[1])<3,"drag flight must start at the released physical tile");
      assert.ok(Math.abs(f.start.w-dragged.w)<2&&Math.abs(f.start.h-dragged.h)<2&&Math.abs(f.startAngle-dragged.angle)<1,"drag flight must preserve the released tile dimensions and rotation");
      await page.waitForTimeout(40);console.log(`PASS ${engine.name()} actual pointer drag pose`);cancellations++;
    }
    {
      const fixture=scene("sanma",0,false);await mount(page,fixture,844);
      const tile=page.getByTestId("mahjong-hand").locator('[data-tile-face="p1"]').nth(1);
      await tile.click();await page.waitForTimeout(120);await tile.click();
      await page.setViewportSize({width:846,height:390});await page.waitForTimeout(60);
      await page.evaluate(after=>(window as any).motionApi.update(after),fixture.after);
      await page.waitForTimeout(60);
      assert.equal(await page.getByTestId("mahjong-discard-flight").count(),0,"pending intent from old viewport must not fly after confirmation");
      assert.equal(await page.locator('[data-discard-event-id]').filter({has:page.locator('[data-tile-face="p1"]')}).evaluate(el=>getComputedStyle(el).opacity),"1");
      console.log(`PASS ${engine.name()} stale pending source after resize`);cancellations++;
    }
    for(const reason of ["disconnect","reduced-motion","resize","visibility","claimed"]){
      const fixture=scene("sanma",0,false);await mount(page,fixture,844);
      const id=await holdFlight(page,fixture);
      await page.evaluate(after=>(window as any).motionApi.quietUpdate(structuredClone(after)),fixture.after);
      assert.equal(await page.evaluate(()=>document.querySelector('[data-testid="mahjong-discard-flight"]')===(window as any).heldFlightNode),true,"quiet duplicate GET must preserve an in-progress flight without restarting");
      if(reason==="disconnect")await page.evaluate(()=>(window as any).motionApi.connected(false));
      if(reason==="reduced-motion")await page.emulateMedia({reducedMotion:"reduce"});
      if(reason==="resize")await page.setViewportSize({width:846,height:390});
      if(reason==="visibility")await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));});
      if(reason==="claimed"){
        const claimed=structuredClone(fixture.after);claimed.version++;claimed.game!.players[0].discards[0]+="+";
        await page.evaluate(value=>(window as any).motionApi.update(value),claimed);
      }
      await page.waitForTimeout(60);
      assert.equal(await page.getByTestId("mahjong-discard-flight").count(),0,reason+" must cancel without replay");
      if(reason!=="claimed"){
        const cell=page.locator('[data-discard-event-id]').filter({has:page.locator('[data-tile-face="p1"]')});
        assert.equal(await cell.evaluate(el=>getComputedStyle(el).opacity),"1",reason+" must reveal confirmed target");
      }
      if(reason==="visibility")await page.evaluate(()=>{Reflect.deleteProperty(document,"visibilityState");document.dispatchEvent(new Event("visibilitychange"));});
      console.log(`PASS ${engine.name()} cancellation=${reason} event=${id}`);cancellations++;
    }
  } finally { await browser.close(); }
}
writeFileSync('.local/mahjong-motion-browser-proof.json', JSON.stringify({ cases: passed, extraCases: cancellations, kinds: ['authority snapshot', 'physical source', 'rotated target', 'dedupe'], realSocket: false }, null, 2) + '\n');
console.log(`${passed}/84 real-engine snapshot animation geometry cases and ${cancellations} drag/pending/cancellation cases passed.`);
