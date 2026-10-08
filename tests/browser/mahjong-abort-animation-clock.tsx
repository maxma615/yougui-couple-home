import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {SettlementSequenceGame} from '../../src/modules/mahjong/settlement-sequence';
import {abortEngine,playAbort} from '../fixtures/mahjong-abort-game';
import type {RoomView} from '../../src/modules/mahjong/types';
const out=`.local/audit/abort-animation-clock-${Date.now()}`;mkdirSync(out,{recursive:true});
const css=['mahjong.css','mahjong-river.css','mahjong-meld.css','mahjong-interaction.css','mahjong-discard-motion.css','mahjong-table-center.css','mahjong-table-edge.css','mahjong-camera.css','mahjong-call-announcement.css','mahjong-standing-tile.css','mahjong-abort-announcements.css'].map(f=>readFileSync(`src/app/mahjong/${f}`,'utf8')).join('\n');
const harness=`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.acks=0;window.paintClock=(room,connected=true)=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={0} host={false} connected={connected} busy={false} motionCanAnimate={false} onChoice={()=>window.acks++} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/></div></main>));`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic'});
function fixture(age:number,declare=false):RoomView{
 const game=new SettlementSequenceGame(abortEngine('ron','yonma',0,declare),4);playAbort(game,'ron',0,declare);
 const v=game.view(0);v.settlementFlow!.elapsedMs=age;
 return {id:'clock',code:'ABCDEFGH',hostUserId:'0',variant:'yonma',mode:'east',status:'playing',version:1,mySeat:0,game:v,members:Array.from({length:4},(_,seat)=>({userId:String(seat),seat,displayName:'玩家'+seat,kind:'human',ready:true,connected:true}))};
}
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const c of [
  {kind:'ron',age:800,declare:false,selector:'[data-abort-ron-seat="1"] b',duration:200},
  {kind:'riichi',age:300,declare:true,selector:'[data-abort-riichi-seat="0"] b',duration:200},
  {kind:'flip',age:2000,declare:false,selector:'[data-draw-reveal-seat="1"] .mahjong-draw-rack__tile',duration:300},
  {kind:'cause',age:3000,declare:false,selector:'.mahjong-settlement-panel.is-abort',duration:500},
 ]){
  const context=await browser.newContext({viewport:{width:667,height:375}});
  try{const page=await context.newPage();
   await page.route('https://mahjong.local/images/**',async route=>{const path=new URL(route.request().url()).pathname;await route.fulfill({status:200,contentType:path.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync(`public${path}`)});});
   await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;--font-body:sans-serif;--font-display:serif}*,*:before,*:after{box-sizing:border-box}${css}</style><div id="root"></div>`);
   await page.addScriptTag({content:`globalThis.process={env:{NODE_ENV:'development'}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});\n${bundle.outputFiles[0].text}`});
   const room=fixture(c.age,c.declare);await page.evaluate(r=>(window as any).paintClock(r),room);
   const proof=await page.evaluate(async({selector,room,age,duration})=>{
    const el=document.querySelector<HTMLElement>(selector)!;
    const animation=el.getAnimations()[0];if(!animation)throw Error('Real CSS animation missing');
    for(let n=0;n<30&&Number(animation.currentTime)<duration*.4;n++)await new Promise(requestAnimationFrame);
    const before={time:Number(animation.currentTime),progress:Number(animation.effect!.getComputedTiming().progress),opacity:Number(getComputedStyle(el).opacity),transform:getComputedStyle(el).transform};
    const next={...room,game:{...room.game!,settlementFlow:{...room.game!.settlementFlow!,elapsedMs:age+before.time}}};
    (window as any).paintClock(next);
    const afterAnimation=el.getAnimations()[0];
    const after={time:Number(afterAnimation.currentTime),progress:Number(afterAnimation.effect!.getComputedTiming().progress),opacity:Number(getComputedStyle(el).opacity),transform:getComputedStyle(el).transform};
    return {before,after,sameAnimation:animation===afterAnimation};
   },{selector:c.selector,room,age:c.age,duration:c.duration});
   assert.equal(proof.sameAnimation,true);
   assert.ok(proof.before.time<c.duration*.85,'Sample must occur during the real animation');
   assert.ok(Math.abs(proof.after.progress-proof.before.progress)<.12,`${engine.name()} ${c.kind}: refresh double-counted time ${JSON.stringify(proof)}`);
   results.push({engine:engine.name(),kind:c.kind,...proof});console.log(`PASS ${engine.name()} ${c.kind}: same CSS animation ${proof.before.progress}->${proof.after.progress}`);
   if(c.kind==='ron'||c.kind==='riichi'){
    await page.evaluate(r=>(window as any).paintClock(r,false),room);await page.waitForTimeout(2500);
    assert.equal(await page.locator('[data-abort-ron-seat],[data-abort-riichi-seat]').count(),0);
    assert.equal(await page.evaluate(()=>(window as any).acks),0);
    console.log(`PASS ${engine.name()} ${c.kind}: offline expiration without ACK`);
   }
  }finally{await context.close();}
 }}finally{await browser.close();}
}
writeFileSync(`${out}/summary.json`,JSON.stringify({results},null,2));console.log(`PASS ${results.length} real animation clocks in ${out}`);
