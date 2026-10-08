// Real legal calls, mounted feedback lifecycle, and rendered cut-in geometry.
import assert from "node:assert/strict";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {build} from "esbuild";
import {chromium, webkit} from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import {RiichiGame} from "../../src/modules/mahjong/engine";
import {SanmaGame} from "../../src/modules/mahjong/sanma";
import {SanmaWall, sanmaTiles} from "../../src/modules/mahjong/sanma-wall";
import type {RoomView} from "../../src/modules/mahjong/types";
import {northReplacementFixture} from "../fixtures/mahjong-view-game";

const tiles=(s:string)=>[...s.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>m[1]+n));
function fixture(kind:"chi"|"pon"|"kan") {
  const variant=kind==="kan"?"sanma":"yonma";
  const hand=kind==="chi"?"p12m456s123789z12":kind==="pon"?"p55m456s123789z12":"z777p123456s123z1";
  const called=kind==="chi"?"p3":kind==="pon"?"p0":"z7";
  const makeWall=(physical:string[])=>{
    const pool=physical.slice(),take=(t:string)=>{const i=pool.indexOf(t);assert.ok(i>=0,`physical wall missing ${t}`);return pool.splice(i,1)[0]};
    const hands=Array.from({length:variant==="sanma"?3:4},()=>[] as string[]);
    hands[1]=tiles(hand).map(take);
    assert.equal(hands[1].length,13);
    const draw=take(called);
    for(let i=0;i<hands.length;i++)if(i!==1)hands[i]=pool.splice(0,13);
    return {hands,draw,pool};
  };
  const names=variant==="sanma"?["甲","乙 · 朋友","丙"]:["甲","乙 · 朋友","丙","丁"];
  const game=variant==="sanma"?new SanmaGame("east",names,{dealer:0,wallFactory:()=>{
    const physical=sanmaTiles(),{hands,draw,pool}=makeWall(physical);
    const reserve=pool.splice(0,4),indicators=pool.splice(0,10),wall=[...hands.flat(),draw,...pool,...reserve,...indicators];
    assert.deepEqual(wall.slice().sort(),physical.slice().sort());return new SanmaWall(wall);
  }}):new RiichiGame("east",names,{dealer:0,wallFactory:rule=>{
    const wall=new Majiang.Shan(rule),physical=wall._pai.slice(),{hands,draw,pool}=makeWall(physical);
    wall._pai=[...pool,...[...hands.flat(),draw].reverse()];
    assert.deepEqual(wall._pai.slice().sort(),physical.slice().sort());
    wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];return wall;
  }});
  const room=(version:number):RoomView=>({id:`call-${kind}`,code:"ABCDEFGH",hostUserId:"0",mode:"east",variant,status:"playing",version,mySeat:0,game:game.view(0),members:names.map((displayName,seat)=>({userId:String(seat),displayName,seat,kind:"human",ready:true,connected:true}))});
  const initial=game.view(0),discard=initial.choices.find(c=>c.type==="discard"&&c.value?.slice(0,2)===called);
  assert.ok(discard);game.respond(0,initial.decisionId,discard.id);
  const before=room(2),caller=game.view(1),choice=caller.choices.find(c=>c.type===kind);
  assert.ok(choice,`real ${kind} choice`);game.respond(1,caller.decisionId,choice.id);
  const after=room(3);assert.equal(after.game!.players[1].melds.length,1);
  return {kind,label:kind==="chi"?"吃":kind==="pon"?"碰":"杠",actorSeat:1,actor:"乙 · 朋友",before,after};
}

function special(kind:"nuki"|"riichi"|"tsumo"){
  const game=northReplacementFixture();
  if(kind==="tsumo"){
    const opening=game.view(0);game.respond(0,opening.decisionId,"nuki");
  }
  const room=(version:number):RoomView=>({id:`call-${kind}`,code:"ABCDEFGH",hostUserId:"0",mode:"east",variant:"sanma",status:"playing",version,mySeat:0,game:game.view(0),members:["甲","乙","丙"].map((displayName,seat)=>({userId:String(seat),displayName,seat,kind:"human",ready:true,connected:true}))});
  const before=room(1),current=game.view(0),choice=current.choices.find(c=>c.type===kind);
  assert.ok(choice,`real legal ${kind} choice`);game.respond(0,current.decisionId,choice.id);
  const after=room(2);
  if(kind==="nuki")assert.equal(after.game!.players[0].nuki,1);
  if(kind==="riichi")assert.equal(after.game!.players[0].riichi,true);
  if(kind==="tsumo")assert.equal(after.game!.settlement?.winMethod,"tsumo");
  return {kind,label:kind==="nuki"?"拔北":kind==="riichi"?"立直":"自摸",actorSeat:0,actor:"你",before,after};
}
const fixtures=[fixture("chi"),fixture("pon"),fixture("kan"),special("nuki"),special("riichi"),special("tsumo")];
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.callApi={render:(room,connected=true,canAnimate=true)=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,connected,motionCanAnimate:canAnimate,ownSeat:0,host:true,busy:false,onChoice:()=>{},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))))};`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'}});
const css=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>readFileSync(`src/app/mahjong/${m[1]}`,'utf8')).join('\n');
mkdirSync(".local/audit",{recursive:true});
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
  const browser=await engine.launch();
  try{
    for(const size of [{width:667,height:375},{width:844,height:390},{width:1440,height:810}]){
      const page=await browser.newPage({viewport:size});
      await page.route("https://mahjong.local/images/**",route=>{const pathname=new URL(route.request().url()).pathname;return route.fulfill({status:200,contentType:pathname.endsWith(".svg")?"image/svg+xml":"image/webp",body:readFileSync(`public${pathname}`)});});
      await page.setContent(`<base href="https://mahjong.local/"><style>*{box-sizing:border-box}body{margin:0;--font-body:sans-serif;--font-display:serif}${css}</style><div id="root"></div>`);
      await page.addScriptTag({content:'globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};'});
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      const render=(room:RoomView,connected=true,canAnimate=true)=>page.evaluate(async({room,connected,canAnimate})=>{
        (window as any).callApi.render(room,connected,canAnimate);
        // Observe after passive effects commit, including WebKit's scheduler.
        await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      },{room,connected,canAnimate});
      for(const f of fixtures){
        await render(f.after,true,false);assert.equal(await page.getByRole("status",{name:"牌桌动作"}).count(),0,"cold snapshot must not replay a call");
        await render(f.before,true,false);await render(f.after);
        if(f.kind==="riichi"){
          const declaration=page.locator('[data-declaration-seat="0"]');
          await declaration.waitFor();
          assert.equal(await declaration.getAttribute('aria-label'),'你 · 立直');
          assert.equal(await page.locator('.mahjong-call-announcement.is-riichi').count(),0,'desk declaration replaces the duplicate generic cut-in');
          const metric=await declaration.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,pointer:getComputedStyle(el).pointerEvents};});
          assert(metric.x>=0&&metric.y>=0&&metric.x+metric.w<=size.width+.5&&metric.y+metric.h<=size.height+.5);
          assert.equal(metric.pointer,'none');
          await render(f.after);assert.equal(await declaration.count(),1,'duplicate state does not restart declaration');
          await page.screenshot({path:`.local/audit/call-announcement-${engine.name()}-${f.kind}-${size.width}.png`});
          await page.waitForTimeout(1050);assert.equal(await declaration.count(),0);
          await render(f.before,true,false);await render(f.after,false,true);assert.equal(await declaration.count(),0);
          await render(f.after,true,false);await render(f.after);await page.waitForTimeout(350);assert.equal(await declaration.count(),0);
          await page.emulateMedia({reducedMotion:'reduce'});await render(f.before,true,false);await render(f.after);await declaration.waitFor();
          assert.equal(await declaration.locator('b').evaluate(el=>getComputedStyle(el).animationName),'none');
          await page.emulateMedia({reducedMotion:'no-preference'});
          results.push({browser:engine.name(),kind:f.kind,viewport:size,...metric});
          console.log(`PASS ${engine.name()} ${f.kind} ${size.width}: live desk declaration, geometry, duplicate/disconnect/reconnect/reduced-motion`);
          continue;
        }
        const cut=page.locator(".mahjong-call-announcement");
        assert.equal(await cut.count(),1,"confirmed legal calls need a prominent portrait-and-label cut-in instead of the old small pill");
        assert.equal(await cut.locator(".mahjong-call-announcement__label").innerText(),f.label);
        assert.equal(await cut.locator(".mahjong-call-announcement__actor").innerText(),f.actor);
        assert.equal(await cut.getAttribute("data-feedback-seat"),String(f.actorSeat));
        await cut.evaluate(el=>{
          for(const animation of el.getAnimations()){
            animation.pause();animation.currentTime=350;
          }
        });
        const metric=await cut.evaluate(el=>{
          const rect=el.getBoundingClientRect(),label=el.querySelector("strong")!,style=getComputedStyle(el);
          return {x:rect.x,y:rect.y,w:rect.width,h:rect.height,font:parseFloat(getComputedStyle(label).fontSize),pointer:style.pointerEvents,animation:style.animationName};
        });
        assert.ok(metric.font>=35.9,"call lettering must remain prominent on a short phone landscape viewport");
        assert.ok(metric.w>=size.width*.3&&metric.h>=size.height*.15,"cut-in must have a substantial character-and-word area");
        assert.ok(metric.x>=0&&metric.y>=0&&metric.x+metric.w<=size.width+.5&&metric.y+metric.h<=size.height*.6,"cut-in stays in the upper board and clear of the touch lane");
        assert.equal(metric.pointer,"none","announcement must not capture touch choices");
        assert.notEqual(metric.animation,"none");
        const portrait=await cut.locator(".mahjong-call-announcement__portrait").evaluate(el=>getComputedStyle(el).backgroundImage);
        assert.ok(portrait.includes("mahjong-seat-portraits-v1.webp"),"use locally owned portrait artwork");
        await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(i=>i.complete&&i.naturalWidth===300));
        await page.screenshot({path:`.local/audit/call-announcement-${engine.name()}-${f.kind}-${size.width}.png`});
        await render(f.after);assert.equal(await cut.count(),1,"duplicate snapshot must not replace or duplicate the call");
        await page.waitForTimeout(950);assert.equal(await cut.count(),0,"call expires without staying on the board");
        if((f.after.game!.players[0].nuki??0)>0)assert.equal(await page.getByTestId("nuki-tiles-0").locator('[data-tile-face="z4"]').count(),1,"acknowledged North stays visible after the announcement expires");
        await render(f.before,true,false);await render(f.after,false,true);assert.equal(await cut.count(),0,"disconnected delivery cannot play a historical call");
        await render(f.after,true,false);await render(f.after);assert.equal(await cut.count(),0,"reconnect establishes a baseline without replay");
        await page.emulateMedia({reducedMotion:"reduce"});await render(f.before,true,false);await render(f.after);
        assert.equal(await cut.evaluate(el=>getComputedStyle(el).animationName),"none","reduced motion preserves information without a sweep");
        await page.emulateMedia({reducedMotion:"no-preference"});
        results.push({browser:engine.name(),kind:f.kind,viewport:size,...metric});
        console.log(`PASS ${engine.name()} ${f.kind} ${size.width}: real call, portrait/label, visible geometry, lifecycle`);
      }
      await page.close();
    }
  }finally{await browser.close();}
}
writeFileSync(".local/audit/call-announcement-browser-proof.json",JSON.stringify({cases:results.length,results},null,2));
console.log(`${results.length} real call cut-in browser cases passed.`);
