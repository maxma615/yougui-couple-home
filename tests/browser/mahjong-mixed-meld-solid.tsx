// Native geometry audit of accepted, engine-produced public melds.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import type { RoomView } from "../../src/modules/mahjong/types";

const touch=process.env.MIXED_MELD_TOUCH!=="false";
const out = `.local/audit/mahjong-mixed-meld-solid-${touch?"touch":"mouse"}-${Date.now()}`;
mkdirSync(out, { recursive: false });
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const tiles = (encoded: string) => [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));
const names = ["甲", "乙", "丙", "丁"];
type Fixture = {game:RiichiGame;actor:1;variant:"yonma";kind:"mixed"|"added-mixed";meldCount:number;sourceChoice:string};

const sourceFiles = [
  "src/components/mahjong/mahjong-meld.tsx",
  "src/components/mahjong/use-public-call-motion.tsx",
  "src/app/mahjong/mahjong-meld.css",
  "tests/component/mahjong-meld.test.tsx",
  "tests/browser/mahjong-mixed-meld-solid.tsx",
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
  const members = names.map((displayName, seat) => ({
    userId: String(seat), displayName, seat, kind: "human" as const, ready: true, connected: true,
  }));
  return {
    id: `solid-${fixture.variant}-${fixture.kind}`, code: "ABCDEFGH", hostUserId: "0", mode: "east",
    variant: fixture.variant, status: "playing", version: 1, mySeat: viewer,
    game: fixture.game.view(viewer), members,
  };
}

function multipleFixture(meldCount:number):Fixture {
 const pool=(new Majiang.Shan(Majiang.rule()))._pai.slice().sort();
 const take=(tile:string)=>{const index=pool.indexOf(tile);assert.ok(index>=0,`physical tile ${tile}`);return pool.splice(index,1)[0]};
 const hands=Array.from({length:4},()=>[] as string[]);hands[1]=tiles("p1222s444z111m123").map(take);
 // Ordinary draws pop from the live wall; two distinct replacement tiles
 // shift from the dead-wall end. Every tile is taken from one conserved pool.
 const draws=["p3","z2","z3","p2","z2","z3","z4","s4","z2","z3","z1"].map(take);
 const replacements=["z5","z6"].map(take);
 for(const hand of hands)if(!hand.length)hand.push(...pool.splice(0,13));
 const wall=new Majiang.Shan(Majiang.rule());wall._pai=[...replacements,...pool,...[...hands.flat(),...draws].reverse()];wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];
 assert.equal(wall._pai.length,136);assert.deepEqual(wall._pai.slice().sort(),new Majiang.Shan(Majiang.rule())._pai.slice().sort());
 const game=new RiichiGame("east",names,{dealer:0,wallFactory:()=>wall});
 const act=(seat:number,id:string)=>{const v=game.view(seat);assert.ok(v.choices.some(c=>c.id===id));game.respond(seat,v.decisionId,id)};
 const pass=()=>{for(let seat=0;seat<4;seat++){const choice=game.view(seat).choices.find(c=>c.type==="pass");if(choice)act(seat,choice.id)}};
 const discard=(seat:number,value:string)=>{const c=game.view(seat).choices.find(c=>c.type==="discard"&&c.value===value);assert.ok(c,`legal discard ${seat}:${value}`);act(seat,c.id)};
 const call=(type:"chi"|"pon"|"kan",value:string)=>{const c=game.view(1).choices.find(c=>c.type===type&&c.value===value);assert.ok(c,`native ${type}:${value}`);act(1,c.id);pass()};
 const tsumogiri=(seat:number,respond=true)=>{const t=game.view(seat).drawnTile;assert.ok(t,`drawn seat ${seat}`);discard(seat,t+"_");if(respond)pass()};
 const expected=["p123-","p222-","s4444","z1111-"];
 tsumogiri(0,false);call("chi","p123-");discard(1,"m1");pass();
 if(meldCount>=2){tsumogiri(2);tsumogiri(3);tsumogiri(0,false);call("pon","p222-");discard(1,"m2");pass()}
 if(meldCount>=3){tsumogiri(2);tsumogiri(3);tsumogiri(0,false);call("kan","s4444");discard(1,"m3");pass()}
 if(meldCount>=4){tsumogiri(2);tsumogiri(3);tsumogiri(0,false);call("kan","z1111-");tsumogiri(1)}
 assert.deepEqual(game.view(1).players.find(p=>p.seat===1)!.melds,expected.slice(0,meldCount));
 assert.equal(game.view(1).doraIndicators.length,Math.max(1,meldCount-1));
 return {game,actor:1,variant:"yonma",kind:"mixed",meldCount,sourceChoice:`native-${expected.slice(0,meldCount).join("+")}`};
}
function addedMixedFixture(stage:number):Fixture {
 const pool=(new Majiang.Shan(Majiang.rule()))._pai.slice().sort();
 const take=(tile:string)=>{const index=pool.indexOf(tile);assert.ok(index>=0,`physical tile ${tile}`);return pool.splice(index,1)[0]};
 const hands=Array.from({length:4},()=>[] as string[]);hands[1]=tiles("m12p11s444z111p345").map(take);
 const draws=["m3","z2","z3","p1","z2","z3","z4","p1","z2","z3","z4","s4","z2","z3","z1"].map(take);
 const replacements=["z5","z6","z7"].map(take);
 for(const hand of hands)if(!hand.length)hand.push(...pool.splice(0,13));
 const wall=new Majiang.Shan(Majiang.rule());wall._pai=[...replacements,...pool,...[...hands.flat(),...draws].reverse()];wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];
 assert.equal(wall._pai.length,136);assert.deepEqual(wall._pai.slice().sort(),new Majiang.Shan(Majiang.rule())._pai.slice().sort());
 const game=new RiichiGame("east",names,{dealer:0,wallFactory:()=>wall});
 const act=(seat:number,id:string)=>{const v=game.view(seat);assert.ok(v.choices.some(c=>c.id===id));game.respond(seat,v.decisionId,id)};
 const pass=()=>{for(let seat=0;seat<4;seat++){const choice=game.view(seat).choices.find(c=>c.type==="pass");if(choice)act(seat,choice.id)}};
 const discard=(seat:number,value:string)=>{const c=game.view(seat).choices.find(c=>c.type==="discard"&&c.value===value);assert.ok(c,`legal discard ${seat}:${value}`);act(seat,c.id)};
 const call=(type:"chi"|"pon"|"kan",value:string)=>{const c=game.view(1).choices.find(c=>c.type===type&&c.value===value);assert.ok(c,`native ${type}:${value}`);act(1,c.id);pass()};
 const tsumogiri=(seat:number,respond=true)=>{const t=game.view(seat).drawnTile;assert.ok(t);discard(seat,t+"_");if(respond)pass()};
 tsumogiri(0,false);call("chi","m123-");discard(1,"p3");pass();
 if(stage>=2){tsumogiri(2);tsumogiri(3);tsumogiri(0,false);call("pon","p111-");discard(1,"p4");pass()}
 if(stage>=3){tsumogiri(2);tsumogiri(3);tsumogiri(0);call("kan","p111-1");tsumogiri(1)}
 if(stage>=4){tsumogiri(2);tsumogiri(3);tsumogiri(0);call("kan","s4444");discard(1,"p5");pass()}
 if(stage>=5){tsumogiri(2);tsumogiri(3);tsumogiri(0,false);call("kan","z1111-");tsumogiri(1)}
 const expected=stage===1?["m123-"]:stage===2?["m123-","p111-"]:stage===3?["m123-","p111-1"]:stage===4?["m123-","p111-1","s4444"]:["m123-","p111-1","s4444","z1111-"];
 assert.deepEqual(game.view(1).players.find(p=>p.seat===1)!.melds,expected);
 assert.equal(game.view(1).doraIndicators.length,Math.max(1,stage-1));
 return {game,actor:1,variant:"yonma",kind:"added-mixed",meldCount:expected.length,sourceChoice:`native-${expected.join("+")}`};
}
const sceneCount={renders:0,choices:0};const scenes:any[]=[];const cases=[...[1,2,3,4].map(multipleFixture),...[1,2,3,4,5].map(addedMixedFixture)];
const runCases=cases;

const errors: string[] = [];
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const fixture of runCases) {
      const capacity=4;
      const viewers = Array.from({ length: capacity }, (_, seat) => seat);
      const viewports=[{width:844,height:390,viewers},{width:667,height:375,viewers},{width:1440,height:810,viewers}];
      for (const size of viewports) {
        const context=await browser.newContext({viewport:{width:size.width,height:size.height},hasTouch:touch});
        const page = await context.newPage();
        assert.equal(await page.evaluate(()=>matchMedia("(pointer:coarse)").matches),touch);
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
            assert.equal(await page.locator(`[data-meld-seat="${fixture.actor}"]`).count(),fixture.meldCount);
            if(engine===chromium&&fixture.meldCount===4)await page.screenshot({path:`${out}/${fixture.kind}-four-mixed-${viewer}-${size.width}.png`});
            const groups:any[]=[];
            for(let meldIndex=0;meldIndex<fixture.meldCount;meldIndex++){
            const group = page.locator(`[data-meld-seat="${fixture.actor}"][data-meld-index="${meldIndex}"]`);
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
                  const style=getComputedStyle(side);
                  const m=new DOMMatrixReadOnly(style.transform==="none"?undefined:style.transform);
                  const det=m.m11*(m.m22*m.m33-m.m23*m.m32)-m.m12*(m.m21*m.m33-m.m23*m.m31)+m.m13*(m.m21*m.m32-m.m22*m.m31);
                  if(style.visibility!=="visible"||parseFloat(style.opacity)<=0||!Number.isFinite(det)||Math.abs(det)<1e-6||parseFloat(style.width)<=0||parseFloat(style.height)<=0||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite))
                    problems.push(`invalid physical side ${side.dataset.meldSide}: ${rect.width.toFixed(2)}×${rect.height.toFixed(2)}`);
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
              writeFileSync(`${out}/failure.json`, JSON.stringify({ variant: fixture.variant, kind: fixture.kind, viewer, size, sourceChoice: fixture.sourceChoice, meldIndex, geometry }, null, 2));
            }
            assert.deepEqual(geometry.problems, [], `${engine.name()} ${fixture.variant}/${fixture.kind} viewer ${viewer} ${size.width}: physical faces project, stay inside the table, and own their hit target`);
            const encoded=room.game!.players.find(p=>p.seat===fixture.actor)!.melds[meldIndex];
            assert.equal(geometry.projections.length,(encoded.match(/\d/g)??[]).length,"each physical meld tile has its own volume");
            assert.equal(geometry.backs,encoded==="s4444"?2:0,"closed kan keeps two physical back tiles");
            if(encoded==="p111-1")assert.deepEqual(geometry.layers.map(layer=>layer.layer).sort(),["added","called"],"added fourth tile remains in its public slot");
            for (const projection of geometry.projections) {
              assert.ok(projection.depth > 0, `${fixture.kind}: public table depth is 0.4 × tile height`);
              assert.ok(projection.lift > 1, `${fixture.kind}: the rendered cap rises above its floor marker`);
              assert.deepEqual(projection.sides.map(side => side.side).sort(), ["bottom", "left", "right", "top"]);
            }
            sceneCount.choices++;groups.push({meldIndex,...geometry});
            }
            sceneCount.renders++;scenes.push({engine:engine.name(),touch,viewer,viewport:{width:size.width,height:size.height},meldCount:fixture.meldCount,groups,acceptedMelds:room.game!.players.find(p=>p.seat===fixture.actor)!.melds});
          }
        } finally {
          await context.close();
        }
      }
    }
  } finally { await browser.close(); }
}
assert.deepEqual(errors, [], "no mounted-game browser exceptions");
writeFileSync(`${out}/summary.json`, JSON.stringify({ ...sceneCount, scenes, cases: cases.map(fixture => ({ variant: fixture.variant, kind: fixture.kind, meldCount:fixture.meldCount, sourceChoice:fixture.sourceChoice })), errors }, null, 2));
console.log(`PASS ${sceneCount.renders} native Chromium/WebKit renders; ${sceneCount.choices} accepted public meld geometry checks.`);
console.log(`Evidence directory: ${out}`);
