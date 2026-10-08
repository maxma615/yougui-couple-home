import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {build} from "esbuild";
import {chromium,webkit} from "@playwright/test";
import {RoomStore} from "../../src/modules/mahjong/rooms";
import {abortEngine} from "../fixtures/mahjong-abort-game";
import type {MahjongCommand} from "../../src/modules/mahjong/types";
const out=`.local/audit/abort-discard-lead-${Date.now()}`;mkdirSync(out,{recursive:true});
const css=["mahjong.css","mahjong-river.css","mahjong-meld.css","mahjong-interaction.css","mahjong-discard-motion.css","mahjong-table-center.css","mahjong-table-edge.css","mahjong-camera.css","mahjong-call-announcement.css","mahjong-standing-tile.css","mahjong-abort-announcements.css"].map(f=>readFileSync(`src/app/mahjong/${f}`,"utf8")).join('\n');
const harness=`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.paintAbort=room=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={0} host connected busy={false} motionCanAnimate onChoice={()=>{}} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/></div></main>));`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic'});
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const viewport of [{width:667,height:375},{width:1440,height:810}]){
  const label=`${engine.name()}-${viewport.width}`;
  const users=Array.from({length:4},(_,seat)=>({userId:randomUUID(),displayName:`玩家${seat}`}));
  const store=new RoomStore({gameFactory:()=>abortEngine('winds')});
  const send=(seat:number,input:object)=>store.execute(users[seat],{nonce:randomUUID(),...input} as MahjongCommand)!;
  const room=send(0,{action:'create',variant:'yonma',mode:'east'});
  for(let seat=1;seat<4;seat++)send(seat,{action:'join',code:room.code});
  for(let seat=0;seat<4;seat++)send(seat,{action:'ready',roomId:room.id,ready:true});send(0,{action:'start',roomId:room.id});
  const view=(seat=0)=>store.view(users[seat].userId)!;
  const discard=(seat:number)=>{const v=view(seat).game!,choice=v.choices.find(c=>c.type==='discard'&&c.value==='z1');assert.ok(choice);send(seat,{action:'respond',roomId:room.id,decisionId:v.decisionId,choiceId:choice.id});
   for(let n=0;n<20;n++){const actor=Array.from({length:4},(_,s)=>s).find(s=>view(s).game!.choices.some(c=>c.type==='pass'));if(actor===undefined)return;const g=view(actor).game!;send(actor,{action:'respond',roomId:room.id,decisionId:g.decisionId,choiceId:g.choices.find(c=>c.type==='pass')!.id});}throw Error('bound');};
  discard(0);discard(1);
  const context=await browser.newContext({viewport,...(engine===webkit?{recordVideo:{dir:`${out}/video`,size:viewport}}:{})});
  try{const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://mahjong.local/images/**',async route=>{const path=new URL(route.request().url()).pathname;await route.fulfill({status:200,contentType:path.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync(`public${path}`)});});
   await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*:before,*:after{box-sizing:border-box}${css}</style><div id="root"></div>`);
   await page.addScriptTag({content:`globalThis.process={env:{NODE_ENV:'development'}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});\n${bundle.outputFiles[0].text}`});
   await page.evaluate(r=>(window as any).paintAbort(r),view());await page.waitForTimeout(300);
   discard(2);await page.evaluate(r=>(window as any).paintAbort(r),view());await page.getByTestId('mahjong-discard-flight').waitFor({state:'attached'});
   await page.waitForTimeout(70);
   discard(3);assert.equal(view().game!.settlement?.name,'四風連打');
   const final=await page.evaluate(r=>{
    const w=window as any;w.finalPaint=performance.now();w.causeAt=null;
    const observer=new MutationObserver(()=>{if(w.causeAt===null&&document.querySelector('.mahjong-settlement-panel.is-abort'))w.causeAt=performance.now();});observer.observe(document.getElementById('root')!,{subtree:true,childList:true});w.paintAbort(r);
    const flight=document.querySelector<HTMLElement>('.mahjong-discard-flight');
    const animations=flight?.getAnimations({subtree:true})??[];
    return {seat:flight?.dataset.discardSeat,remaining:Math.max(0,...animations.map(a=>Number(a.effect?.getComputedTiming().endTime)-Number(a.currentTime)))};
   },view());
   assert.ok(final.remaining>100,`${label}: final real animation missing ${JSON.stringify(final)}`);
   await page.waitForTimeout(1060);
   assert.equal(await page.getByRole('region',{name:'流局原因'}).count(),0,`${label}: cause overtook the final physical discard`);
   await page.getByRole('region',{name:'流局原因'}).waitFor({timeout:1000});
   const actual=await page.evaluate(()=>{const w=window as any;return w.causeAt-w.finalPaint;});
   assert.ok(actual>=1000+final.remaining-35,`${label}: expected final-flight lead ${final.remaining}, cause ${actual}`);
   assert.equal(await page.locator('[data-draw-reveal-seat]').count(),0);
   assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${label}.png`});results.push({label,final,causeAt:actual});console.log(`PASS ${label}: final real discard ${final.remaining}ms, cause ${actual}ms`);
  }finally{await context.close();}
 }}finally{await browser.close();}
}
writeFileSync(`${out}/summary.json`,JSON.stringify({results},null,2));console.log(`PASS ${results.length} continuous native discard scenes in ${out}`);
