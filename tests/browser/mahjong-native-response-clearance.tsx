import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {actionPlacementProtectedSelector} from "../../src/components/mahjong/use-action-placement";
import {build} from "esbuild";
import { chromium, webkit } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import type { RoomView } from "../../src/modules/mahjong/types";

const delayedFont=process.env.NATIVE_RESPONSE_FONT_DELAY==="true";
const resizeTable=process.env.NATIVE_RESPONSE_RESIZE==="true";
const notice=process.env.NATIVE_RESPONSE_NOTICE==="true";
const closed=process.env.NATIVE_RESPONSE_MELD==="closed";
const across=process.env.NATIVE_RESPONSE_FROM==="across";
const rounds=Number(process.env.NATIVE_RESPONSE_ROUNDS??"0");assert.ok(Number.isInteger(rounds)&&rounds>=0&&rounds<=14);
const out=`.local/audit/mahjong-native-response-clearance-r${rounds}-${across?"across":"upstream"}-${closed?"closed":process.env.NATIVE_RESPONSE_MELD==="added"?"added":"pon"}-${notice?"notice":"clear"}-${delayedFont?"late-font":"font"}-${resizeTable?"resize":"fixed"}-${Date.now()}`;
mkdirSync(out,{recursive:false});
const added=process.env.NATIVE_RESPONSE_MELD==="added";
const tiles=(encoded:string)=>[...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match=>[...match[2]].map(rank=>match[1]+rank));
const pool=(new Majiang.Shan(Majiang.rule()))._pai.slice().sort();
const take=(tile:string)=>{const i=pool.indexOf(tile);assert.ok(i>=0,`physical tile exists: ${tile}`);return pool.splice(i,1)[0]};
const hands=Array.from({length:4},()=>[] as string[]);
hands[1]=tiles(closed?"p12333456z11155":"p12333456z11557").map(take);
const draws=(closed?(across?["s9","s8","p3"]:["p3"]):added?(across?["z5","s9","s8","p9","z5","p3"]:["z5","s9","s8","p9","z5","s7","s6","p3"]):(across?["z5","p3"]:["z5","s9","s8","p3"])).map(take);
const replacementTile=added?take("s1"):null;
for(const hand of hands)if(!hand.length)hand.push(...pool.splice(0,13));
// Preserve a non-furiten legal response after real late-round discards.
const prefix=new Array<string>(rounds*4);
for(let i=1;i<prefix.length;i+=4){
 const index=pool.findIndex(tile=>!tile.startsWith("p")&&tile!=="z1");
 assert.ok(index>=0,"safe physical draw for response actor");prefix[i]=pool.splice(index,1)[0];
}
for(let i=0;i<prefix.length;i++)if(!prefix[i])prefix[i]=pool.shift()!;
assert.ok(prefix.every(Boolean));
const wall=new Majiang.Shan(Majiang.rule());
wall._pai=[...(replacementTile?[replacementTile]:[]),...pool,...[...hands.flat(),...prefix,...draws].reverse()];
wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];
const game=new RiichiGame("east",["甲","乙","丙","丁"],{dealer:0,wallFactory:()=>wall});
const act=(seat:number,id:string)=>{const view=game.view(seat);assert.ok(view.choices.some(c=>c.id===id),`engine offers ${id}`);game.respond(seat,view.decisionId,id)};
const pass=()=>{for(const seat of [0,1,2,3]){const view=game.view(seat),choice=view.choices.find(c=>c.type==="pass");if(choice)act(seat,choice.id)}};
const discard=(seat:number,condition:(value:string)=>boolean)=>{const view=game.view(seat),choice=view.choices.find(c=>c.type==="discard"&&condition(c.value??""));assert.ok(choice,`engine offers a discard to seat ${seat}: ${JSON.stringify(view.choices)}`);act(seat,choice.id)};
for(let i=0;i<prefix.length;i++){
 const seat=game.view(0).turnSeat;const drawn=game.view(seat).drawnTile;assert.ok(drawn);discard(seat,value=>value===drawn+"_");pass();
}
assert.ok(game.view(1).players.every(p=>p.discards.length===rounds));
if(!closed){
discard(0,value=>value==="z5_");
const pon=game.view(1).choices.find(c=>c.type==="pon");assert.ok(pon,"engine offers white dragon pon");act(1,pon.id);pass();
assert.deepEqual(game.view(1).players.find(p=>p.seat===1)?.melds,["z555-"],"accepted own meld exists");
discard(1,value=>value==="z7");pass();
if(added||!across){discard(2,()=>true);pass();discard(3,()=>true);pass();}
if(added){
 discard(0,value=>value==="p9_");pass();
 const kan=game.view(1).choices.find(c=>c.type==="kan");assert.ok(kan,"engine offers added white kan");act(1,kan.id);pass();
 assert.deepEqual(game.view(1).players.find(p=>p.seat===1)?.melds,["z555-5"]);
 const replacement=game.view(1).drawnTile;assert.ok(replacement);discard(1,value=>value===replacement+"_");pass();
 if(!across){discard(2,()=>true);pass();discard(3,()=>true);pass();}
}
}else if(across){discard(0,value=>value==="s9_");pass();discard(1,value=>value==="s8_");pass();}
discard(across?2:0,value=>value==="p3_");
const view=game.view(1);
assert.deepEqual([...new Set(view.choices.map(c=>c.type))],(across?["ron","pon","kan","pass"]:["ron","chi","pon","kan","pass"]));
assert.equal(view.choices.filter(c=>c.type==="chi").length,across?0:3);
const room:RoomView={id:"native-legal-response",code:"ABCDEFGH",hostUserId:"0",mode:"east",variant:"yonma",status:"playing",version:1,mySeat:1,game:view,
  members:["甲","乙","丙","丁"].map((displayName,seat)=>({userId:String(seat),seat,displayName,kind:"human",ready:true,connected:true}))};
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.mount=room=>flushSync(()=>root.render(React.createElement(GameRoom,{room,ownSeat:1,host:true,connected:true,busy:false,motionCanAnimate:false,onChoice:()=>{},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});

const cssFiles=[...readFileSync("src/app/mahjong/page.tsx","utf8").matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>m[1]);
const css=cssFiles.map(file=>readFileSync(`src/app/mahjong/${file}`,"utf8")).join("\n");
assert.deepEqual(view.choices.map(c=>c.type),(across?["ron","pon","kan","pass"]:["ron","chi","chi","chi","pon","kan","pass"]));
assert.deepEqual(view.players.find(p=>p.seat===1)?.melds,closed?[]:[added?"z555-5":"z555-"]);
const summary:any={closed,across,rounds,notice,delayedFont,resizeTable,bundleSha256:createHash("sha256").update(bundle.outputFiles[0].text).digest("hex"),sourceHashes:Object.fromEntries(["src/components/mahjong/mahjong-client.tsx","src/components/mahjong/action-placement.ts","src/components/mahjong/use-action-placement.ts","public/fonts/mahjong-brush.woff2"].map(p=>[p,createHash("sha256").update(readFileSync(p)).digest("hex")])),riverCounts:view.players.map(p=>p.discards.length),testSha256:createHash("sha256").update(readFileSync("tests/browser/mahjong-native-response-clearance.tsx")).digest("hex"),cssSha256:createHash("sha256").update(css).digest("hex"),cssFiles,choices:view.choices,ownMeld:view.players.find(p=>p.seat===1)?.melds,scenes:[]};
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{
  for(const size of [{width:667,height:375},{width:844,height:390},{width:1440,height:810},{width:960,height:540},{width:1440,height:540}]){
   const page=await browser.newPage({viewport:size,hasTouch:true});
   await page.addInitScript(`globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});`);
   const pendingFonts:Array<()=>Promise<void>>=[];
   await page.route('https://mahjong.local/fonts/**',route=>{
    const fulfill=()=>route.fulfill({status:200,contentType:'font/woff2',body:readFileSync('public'+new URL(route.request().url()).pathname)});
    if(delayedFont)return new Promise<void>(resolve=>pendingFonts.push(async()=>{await fulfill();resolve();}));
    return fulfill();
   });
   await page.route("https://mahjong.local/images/**",route=>{const file=new URL(route.request().url()).pathname;return route.fulfill({status:200,contentType:file.endsWith(".svg")?"image/svg+xml":"image/webp",body:readFileSync("public"+file)})});
   await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><main class="mahjong-page"><div class="mahjong-shell">${notice?'<div class="mahjong-notice" role="alert"><svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg><span>请求未完成，请重试刚才的操作。</span><button type="button" aria-label="关闭提示" onclick="this.closest(\'.mahjong-notice\').remove()"><svg width="16" height="16" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>':""}<div id="root"></div></div></main>`);
   if(!delayedFont)assert.equal(await page.evaluate(async()=>(await document.fonts.load('40px "Yougui Mahjong Brush"','立直自摸吃碰杠拔北')).length),1);
   await page.addScriptTag({content:`globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};`});
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.evaluate(room=>(window as any).mount(room),room);
   await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(i=>i.complete&&i.naturalWidth===300));
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   if(delayedFont){
    assert.ok(pendingFonts.length>0,'real brush font request held until after mount');
    for(const fulfill of pendingFonts)await fulfill();
    assert.equal(await page.evaluate(async()=>(await document.fonts.load('40px "Yougui Mahjong Brush"','立直自摸吃碰杠拔北')).length),1);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   }
   const placementInput=await page.evaluate(selector=>{
    const rect=(el:Element)=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
    return {actions:[...document.querySelectorAll('.mahjong-action-dock > button')].map((el,i)=>({id:String(i),...rect(el)})),obstacles:[...document.querySelectorAll(selector)].filter(el=>!el.closest('.mahjong-action-dock')).map(rect).filter(r=>r.w>0&&r.h>0),bounds:{x:8,y:8,w:innerWidth-16,h:innerHeight-16}};
   },actionPlacementProtectedSelector);
   writeFileSync(`${out}/${engine.name()}-${size.width}x${size.height}-placement-input.json`,JSON.stringify(placementInput,null,2));
   const measure=()=>page.evaluate(()=>{
    const rect=(e:Element)=>{const r=e.getBoundingClientRect();return{x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1)}};
    const intersects=(a:DOMRect,b:DOMRect)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    const dock=document.querySelector<HTMLElement>(".mahjong-action-dock")!;
    const buttons=[...dock.querySelectorAll("button")];
    const targets=[...document.querySelectorAll(".mahjong-notice,.mahjong-game__topline,.mahjong-table__dora,.mahjong-table__center,.mahjong-table__position .mahjong-player__head,.mahjong-opponent-rack .mahjong-standing-tile,.mahjong-table__position .mahjong-player__melds [data-tile-face],.mahjong-river__tile,.mahjong-hand-public-melds [data-tile-face],.mahjong-hand [data-tile-face]")];
    const overlaps:any[]=[];
    const centerBlocked:any[]=[];
    for(const button of buttons){
     const b=button.getBoundingClientRect();
     for(const target of targets){
      const t=target.getBoundingClientRect();
      if(intersects(b,t))overlaps.push({button:button.getAttribute("data-choice-type")||button.textContent?.trim(),target:target.getAttribute("class"),owner:target.closest(".mahjong-river")?.className??target.closest(".mahjong-table__position")?.className??null,motionSeat:target.getAttribute("data-motion-seat"),rect:rect(target)});
     }
    }
    for(const target of targets){
     const t=target.getBoundingClientRect();
     if(t.width<1||t.height<1)continue;
     const hit=document.elementFromPoint(t.left+t.width/2,t.top+t.height/2);
     if(!target.contains(hit))centerBlocked.push({target:target.getAttribute("class"),owner:target.closest(".mahjong-river")?.className??target.closest(".mahjong-table__position")?.className??null,motionSeat:target.getAttribute("data-motion-seat"),text:target.textContent?.trim().slice(0,20),rect:rect(target),coveredByAction:Boolean(hit?.closest(".mahjong-action-dock")),hit:hit?.getAttribute("class")??hit?.tagName});
    }
    return{layoutState:document.querySelector<HTMLElement>(".mahjong-game")!.dataset.actionLayoutState,layoutMs:document.querySelector<HTMLElement>(".mahjong-game")!.dataset.actionLayoutMs,viewport:{width:innerWidth,height:innerHeight},dock:{...rect(dock),bottomCss:getComputedStyle(dock).bottom,buttons:buttons.map(b=>{const r=b.getBoundingClientRect();const points=[[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.5,.5]].map(([u,v])=>{const x=r.left+r.width*u,y=r.top+r.height*v;return {x,y,valid:b.contains(document.elementFromPoint(x,y))}});return {type:b.getAttribute("data-choice-type"),label:b.textContent?.trim(),...rect(b),points}})},groupTypes:buttons.map(b=>b.getAttribute("data-choice-type")),overlapCount:overlaps.length,overlaps,centerBlocked};
   });
   const result=await measure();
   const label=`${engine.name()}-native-legal-${size.width}x${size.height}`;
   await page.screenshot({path:`${out}/${label}.png`});
   summary.scenes.push({label,...result});
   const idleBefore=await page.locator('.mahjong-game').getAttribute('data-action-layout-runs');
   await page.waitForTimeout(150);
   assert.equal(await page.locator('.mahjong-game').getAttribute('data-action-layout-runs'),idleBefore,'no idle layout polling loop');
   if(resizeTable){
    const resized=size.width===667?{width:844,height:390}:{width:667,height:375};
    await page.setViewportSize(resized);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    summary.scenes.push({label:label+'-resized',...await measure()});
   }
   if(notice){
    const tableBefore=await page.locator('.mahjong-table__surface').boundingBox();
    await page.getByRole('button',{name:'关闭提示',exact:true}).tap();
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    assert.equal(await page.locator('.mahjong-notice').count(),0,'notice fixture dismissed');
    assert.deepEqual(await page.locator('.mahjong-table__surface').boundingBox(),tableBefore,'dismissal preserves table projection');
    summary.scenes.push({label:label+'-dismissed',...await measure()});
   }
   await page.close();
  }
 }finally{await browser.close()}
}
writeFileSync(`${out}/legal-results.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify({choices:summary.choices,ownMeld:summary.ownMeld,scenes:summary.scenes.map((s:any)=>({label:s.label,dock:s.dock,overlapCount:s.overlapCount,firstOverlaps:s.overlaps.slice(0,12),centerBlocked:s.centerBlocked.slice(0,12)}))},null,2));

const blocked=summary.scenes.flatMap((scene:any)=>scene.centerBlocked.filter((item:any)=>item.coveredByAction).map((item:any)=>({scene:scene.label,target:item.target,owner:item.owner,hit:item.hit})));
writeFileSync(`${out}/blocked.json`,JSON.stringify(blocked,null,2));
assert.deepEqual(blocked,[],"Legal multi-response controls must not obscure table information");

assert.ok(summary.scenes.every((s:any)=>s.overlapCount===0),"All action button rectangles must clear the public table, concealed racks and HUD");
assert.ok(summary.scenes.every((s:any)=>s.layoutState==="ready"),"All measured action layouts have a clear placement");
assert.ok(summary.scenes.every((s:any)=>s.dock.buttons.every((b:any)=>b.points.every((p:any)=>p.valid))),"Five points of every action remain clickable");
assert.ok(summary.scenes.every((s:any)=>s.dock.buttons.every((b:any)=>b.w>=43.99&&b.h>=43.99&&b.x>=0&&b.y>=0&&b.right<=s.viewport.width&&b.bottom<=s.viewport.height)),"All touch targets must fit in the viewport and retain 44px targets");
console.log(`PASS ${summary.scenes.length} native ${closed?"closed-hand":added?"added-kan":"pon"} response scenes: ${out}`);

assert.ok(summary.scenes.every((s:any)=>s.dock.buttons.every((b:any)=>b.points.every((p:any)=>p.valid))),"All action centres and corners must retain native pointer targets");
