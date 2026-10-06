// Render a real engine snapshot through the interactive table and inspect actual CSS animation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import type { RoomView } from "../../src/modules/mahjong/types";

const makeRoom=(game: SanmaGame | RiichiGame,variant: "sanma" | "yonma"): RoomView => ({ id: "draw-lifecycle", code: "ABCDEFGH", hostUserId: "display-0", mode: "east", variant, status: "playing", version: 1, mySeat: 0, game: game.view(0), members: Array.from({length:variant === "sanma" ? 3 : 4},(_,seat)=>({userId:`display-${seat}`,displayName:`玩家${seat}`,seat,kind:"human",ready:true,connected:true})) });
function normal(variant: "sanma" | "yonma") {
 const game=variant==="sanma"?new SanmaGame("east",["甲","乙","丙"],{dealer:0}):new RiichiGame("east",["甲","乙","丙","丁"],{dealer:0});
 const initial=makeRoom(game,variant);assert.ok(initial.game?.drawnTile);
 const current=game.view(0),choice=current.choices.find(c=>c.type==="discard")!;game.respond(0,current.decisionId,choice.id);
 const before=makeRoom(game,variant);
 for(let i=0;i<40;i++){
  const own=game.view(0);
  if(own.turnSeat===0 && own.phase==="zimo" && own.drawnTile)return {initial,before,after:{...makeRoom(game,variant),version:2},kind:variant+" ordinary draw"};
  let answered=false;
  for(let seat=0;seat<initial.members.length;seat++){
   const view=game.view(seat);const c=view.choices.find(c=>c.type==="pass")??view.choices.find(c=>c.type==="discard");
   if(c){game.respond(seat,view.decisionId,c.id);answered=true;break;}
  }
  assert.ok(answered,"engine must progress to next own draw without fake snapshots");
 }
 throw Error("own draw not reached");
}
function replacement(kind:"nuki"|"kan") {
 const values=[...(kind==="nuki"?"p112233s456789z4":"p111s456789z1234").matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>m[1]+n));
 const draw=kind==="nuki"?"z4":"p1";
 const game=new SanmaGame("east",["甲","乙","丙"],{dealer:0,wallFactory:()=>{
  const available=sanmaTiles();const take=(tile:string)=>{const i=available.indexOf(tile);assert.ok(i>=0);return available.splice(i,1)[0]};
  const own=values.map(take);take(draw);const others=available.splice(0,26);const reserve=[take("p9"),...available.splice(0,3)],indicators=available.splice(0,10);
  return new SanmaWall([...own,...others,draw,...available,...reserve,...indicators]);
 }});
 const before=makeRoom(game,"sanma"),view=game.view(0),choice=view.choices.find(c=>c.type===kind);assert.ok(choice,`real ${kind} choice required`);game.respond(0,view.decisionId,choice.id);
 for(let i=0;i<3 && game.view(0).phase!== (kind==="nuki"?"nukizimo":"gangzimo");i++){
  for(const seat of [1,2]){const v=game.view(seat),pass=v.choices.find(c=>c.type==="pass");if(pass)game.respond(seat,v.decisionId,pass.id);}
 }
 const after={...makeRoom(game,"sanma"),version:2};assert.equal(after.game!.phase,kind==="nuki"?"nukizimo":"gangzimo");assert.equal(after.game!.drawnTile,"p9");
 return {initial:before,before,after,kind};
}
const fixtures=[normal("sanma"),normal("yonma"),replacement("nuki"),replacement("kan")];
const harness = `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));window.drawApi={render:(room,connected=true,canAnimate=false)=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,connected,motionCanAnimate:canAnimate,ownSeat:0,host:true,busy:false,onChoice:()=>{},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}}))))),dispose:()=>root.unmount()};`;
const bundle = await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'}});
const css=["mahjong.css","mahjong-river.css","mahjong-meld.css","mahjong-interaction.css","mahjong-discard-motion.css","mahjong-table-center.css","mahjong-table-edge.css"].map(file=>readFileSync("src/app/mahjong/"+file,"utf8")).join("\n");
for (const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 try {
  const page=await browser.newPage({viewport:{width:844,height:390}});
  await page.route("https://mahjong.local/images/**",route=>route.fulfill({status:200,contentType:"image/svg+xml",body:readFileSync("public"+new URL(route.request().url()).pathname)}));
  await page.setContent(`<base href="https://mahjong.local/"><style>*{box-sizing:border-box}body{margin:0;--font-body:sans-serif;--font-display:serif}${css}</style><div id="root"></div>`);
  await page.addScriptTag({content:'globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n'+bundle.outputFiles[0].text});
  for (const fixture of fixtures) {
   // Fresh view uses a real current drawn tile but must never replay history.
   await page.evaluate(()=>{(window as any).drawApi.dispose()});
   await page.goto("about:blank");
   await page.setContent(`<base href="https://mahjong.local/"><style>*{box-sizing:border-box}body{margin:0;--font-body:sans-serif;--font-display:serif}${css}</style><div id="root"></div>`);
   await page.addScriptTag({content:'globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n'+bundle.outputFiles[0].text});
   const render=async (r:RoomView,connected=true,animate=false)=>page.evaluate(({r,connected,animate})=>{
    (window as any).drawApi.render(r,connected,animate);
    const tile=document.querySelector<HTMLElement>('button.is-drawn');
    return {tile:tile?.dataset.tileFace,animations:tile?.getAnimations().filter(a=>(a as CSSAnimation).animationName==="mahjong-tile-arrive").length??0};
   },{r,connected,animate});
   const initial=await render(fixture.initial);assert.ok(initial.tile);assert.equal(initial.animations,0,`${engine.name()}: initial GET must not replay an old draw`);
   await render(fixture.before);
   const arrival=await page.evaluate(async r=>{
    (window as any).drawApi.render(r,true,true);
    for(let i=0;i<8;i++){
     await new Promise(requestAnimationFrame);const tile=document.querySelector<HTMLElement>('button.is-drawn')!;
     const animation=tile.getAnimations().find(a=>(a as CSSAnimation).animationName==="mahjong-tile-arrive");
     if(!animation)continue;
     animation.pause();animation.currentTime=0;await new Promise(requestAnimationFrame);const start=tile.getBoundingClientRect().top;
     animation.currentTime=110;await new Promise(requestAnimationFrame);const middle=tile.getBoundingClientRect().top;
     animation.currentTime=219;await new Promise(requestAnimationFrame);const end=tile.getBoundingClientRect().top;animation.finish();
     return {start,middle,end,duration:Number(animation.effect!.getComputedTiming().duration)};
    }
    throw Error("new live draw must produce an actual browser arrival animation");
   },fixture.after);
   assert.equal(arrival.duration,220);assert.ok(arrival.start>arrival.middle && arrival.middle>arrival.end,"draw must move continuously into its rack position");
   await page.waitForTimeout(230);
   assert.equal((await render(fixture.after,true,true)).animations,0,"duplicate must not replay draw");
   assert.equal((await render(fixture.after,false,false)).animations,0,"disconnect must clear draw");
   assert.equal((await render(fixture.after,true,false)).animations,0,"reconnect baseline must be quiet");
   assert.equal((await render(fixture.after,true,true)).animations,0,"enabling live delivery must not replay reconnect");
   if(fixture.kind==="nuki"){
    assert.equal(await page.getByTestId('nuki-tiles-0').locator('[data-tile-face="z4"]').count(),1,"North remains visible after its replacement draw and reconnect");
    assert.ok((await page.getByTestId('nuki-tiles-0').innerText()).includes("1"));
    await page.screenshot({path:`.local/mahjong-draw-nuki-${engine.name()}.png`});
   }
   await render(fixture.before);
   const selected=await page.evaluate(async r=>{
    (window as any).drawApi.render(r,true,true);await new Promise(requestAnimationFrame);
    const tile=document.querySelector<HTMLButtonElement>('button.is-drawn')!;
    const arrival=tile.getAnimations().find(a=>(a as CSSAnimation).animationName==="mahjong-tile-arrive");if(!arrival)throw Error("expected active arrival before immediate selection");
    arrival.pause();tile.click();await new Promise(requestAnimationFrame);
    return {selected:tile.classList.contains("is-selected"),arrivals:tile.getAnimations().filter(a=>(a as CSSAnimation).animationName==="mahjong-tile-arrive").length};
   },fixture.after);
   assert.ok(selected.selected,"new drawn tile must remain immediately selectable");
   assert.equal(selected.arrivals,0,"selection must cancel arrival so lift and drag are not overridden");
   await page.emulateMedia({reducedMotion:"reduce"});await render(fixture.before);assert.equal((await render(fixture.after,true,true)).animations,0,"reduced motion must suppress arrival");await page.emulateMedia({reducedMotion:"no-preference"});
   console.log(`${engine.name()}: ${fixture.kind} initial/live/duplicate/reconnect/reduced motion verified`);
  }
 } finally {await browser.close();}
}
