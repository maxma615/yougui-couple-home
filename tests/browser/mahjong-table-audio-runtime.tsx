import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {kakanSoundFixture} from '../fixtures/mahjong-audio-game';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import {northReplacementFixture} from '../fixtures/mahjong-view-game';
import type {RoomView,GameVariant} from '../../src/modules/mahjong/types';
const out=`.local/audit/table-audio-runtime-${Date.now()}`;mkdirSync(out,{recursive:true});
const css=['mahjong.css','mahjong-river.css','mahjong-meld.css','mahjong-interaction.css','mahjong-discard-motion.css','mahjong-table-center.css','mahjong-table-edge.css','mahjong-camera.css','mahjong-call-announcement.css','mahjong-standing-tile.css','mahjong-abort-announcements.css'].map(f=>readFileSync(`src/app/mahjong/${f}`,'utf8')).join('\n');
const harness=`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.paintSound=(room,canAnimate=true,connected=true)=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={room.mySeat} host={false} connected={connected} busy={false} motionCanAnimate={canAnimate} onChoice={()=>{}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/></div></main>));window.unmountSound=()=>flushSync(()=>root.unmount());`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',write:false,format:'iife',jsx:'automatic'});
function pair(kind:string){
 if(kind.startsWith('kakan')){
  const game=kakanSoundFixture(),view=(version:number):RoomView=>({id:`sound-${kind}`,code:'ABCDEFGH',hostUserId:'0',variant:'yonma',mode:'east',status:'playing',version,mySeat:1,game:game.view(1),members:Array.from({length:4},(_,seat)=>({userId:String(seat),displayName:'玩家'+seat,seat,kind:'human',ready:true,connected:true}))});
  const before=view(1),v=game.view(1),kan=v.choices.find(c=>c.type==='kan'&&!!c.value?.match(/^[mpsz]\d{3}[+\-=]\d$/))!;assert(kan);game.respond(1,v.decisionId,kan.id);const pending=view(2);assert.equal(pending.game!.phase,'gang');const w=game.view(2),choice=w.choices.find(c=>c.type===(kind==='kakan-robbed'?'ron':'pass'))!;assert(choice);game.respond(2,w.decisionId,choice.id);return {before,pending,after:view(3)};
 }
 const variant:GameVariant=kind.startsWith('nuki')?'sanma':'yonma',viewer=kind==='nuki-own'||kind==='kan'?0:1;
 const game=variant==='sanma'?northReplacementFixture():physicalEngine('yonma',kind==='kan'?{0:'p111s123456789z2'}:{0:'p1s123456789z123',1:'p11s123456789z45'},kind==='kan'?'p1':'p9');
 const view=(version:number):RoomView=>({id:`sound-${kind}`,code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:viewer,game:game.view(viewer),members:Array.from({length:variant==='sanma'?3:4},(_,seat)=>({userId:String(seat),displayName:'玩家'+seat,seat,kind:'human',ready:true,connected:true}))});
 const before=view(1);const type=variant==='sanma'?'nuki':kind==='kan'?'kan':'discard';const v=game.view(0),c=v.choices.find(c=>c.type===type&&(type!=='discard'||c.value==='p1'));assert(c);game.respond(0,v.decisionId,c.id);
 if(kind!=='discard')for(let seat=1;seat<(variant==='sanma'?3:4);seat++){const w=game.view(seat),pass=w.choices.find(c=>c.type==='pass');if(pass)game.respond(seat,w.decisionId,pass.id);}
 return {before,after:view(2),pending:undefined};
}
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const kind of ['discard','nuki-own','nuki-opponent','kan','kakan','kakan-robbed'])for(const interruption of viewport.width===667&&['discard','nuki-own'].includes(kind)?['none','mute','disconnect','unmount','resize',...(kind==='nuki-own'?['table-resize']:[])]:['none']){
  const context=await browser.newContext({viewport});
  try{const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://mahjong.local/images/**',async route=>{const path=new URL(route.request().url()).pathname;await route.fulfill({status:200,contentType:path.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync(`public${path}`)});});
   await page.route('https://mahjong.local/',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await page.goto('https://mahjong.local/');
   await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*:before,*:after{box-sizing:border-box}${css}</style><div id="root"></div>`);
   await page.addScriptTag({content:`window.playedSounds=[];window.audioContexts=[];window.motionEnds=[];window.audioCloses=[];
const RealContext=window.AudioContext;window.AudioContext=function(...args){const ctx=new RealContext(...args);window.audioContexts.push(ctx);const close=ctx.close.bind(ctx);ctx.close=()=>{const info={before:ctx.state};window.audioCloses.push(info);return close().then(()=>{info.after=ctx.state;},error=>{info.error=String(error);throw error;});};const create=ctx.createBufferSource.bind(ctx);ctx.createBufferSource=()=>{const s=create(),start=s.start;s.start=function(...args){window.playedSounds.push({at:performance.now(),duration:s.buffer.duration,held:!!document.querySelector(".is-nuki-held"),arriving:!!document.querySelector(".is-draw-arriving"),animations:document.querySelector(".is-draw-arriving")?.getAnimations().map(a=>({state:a.playState,time:a.currentTime}))});return start.apply(s,args);};return s;};return ctx;};
const animate=Element.prototype.animate;Element.prototype.animate=function(...args){const a=animate.apply(this,args);a.addEventListener('finish',()=>{if(this.hasAttribute('data-motion-event')||a.id.startsWith('mahjong-nuki-arrival:'))window.motionEnds.push({at:performance.now(),id:this.dataset.motionEvent||a.id});});return a;};
globalThis.process={env:{NODE_ENV:'development'}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});\n${bundle.outputFiles[0].text}`});
   const {before,after,pending}=pair(kind);await page.evaluate(r=>(window as any).paintSound(r),before);await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth===300));await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>(window as any).audioContexts.length),0,'initial mount stays locked');
   const control=page.getByRole('button',{name:'关闭音效'}),box=await control.boundingBox();assert(box&&box.width>=44&&box.height>=44);
   await control.click();await page.getByRole('button',{name:'开启音效'}).click();await page.waitForFunction(()=>(window as any).audioContexts.some((c:AudioContext)=>c.state==='running'));
   if(pending){await page.evaluate(r=>(window as any).paintSound(r),pending);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>(window as any).playedSounds.length),0,'pending chankan must not sound successful kakan');}
   await page.evaluate(r=>{(window as any).acceptedAt=performance.now();(window as any).paintSound(r);},after);
   if(kind!=='kan'&&!kind.startsWith('kakan')){await page.waitForTimeout(75);assert.equal(await page.evaluate(()=>(window as any).playedSounds.length),0,'impact must wait for actual movement');}
   if(interruption!=='none'){
    const expected=interruption==='table-resize'?1:0;
    if(interruption==='table-resize')await page.waitForFunction(()=>!!document.querySelector('button.mahjong-tile.is-draw-arriving'));
    assert.equal(await page.evaluate(()=>(window as any).playedSounds.length),expected);
    if(interruption!=='table-resize')assert(await page.locator('[data-motion-event]').count()>0,'interrupt an actual flight');
    if(interruption==='mute')await page.getByRole('button',{name:'关闭音效'}).click();
    if(interruption==='disconnect')await page.evaluate(r=>(window as any).paintSound(r,true,false),after);
    if(interruption==='unmount')await page.evaluate(()=>(window as any).unmountSound());
    if(interruption==='table-resize')await page.evaluate(()=>{const table=document.querySelector<HTMLElement>('.mahjong-table')!;table.style.width='90%';});
    if(interruption==='resize')await page.setViewportSize({width:viewport.width+10,height:viewport.height});
    await page.waitForTimeout(650);
    assert.equal(await page.evaluate(()=>(window as any).playedSounds.length),expected,`${interruption} must discard in-flight and dependent replacement cues`);
    if(interruption==='mute')await page.getByRole('button',{name:'开启音效'}).click();
    if(interruption!=='unmount'){
     await page.evaluate(r=>(window as any).paintSound(r,false,true),after);await page.waitForTimeout(100);
     assert.equal(await page.evaluate(()=>(window as any).playedSounds.length),expected,'reconnect/unmute/GET cannot replay canceled sounds');
     await page.evaluate(()=>(window as any).unmountSound());
    }
    await page.waitForFunction(()=>(window as any).audioContexts.every((c:AudioContext)=>c.state==='closed'),null,{timeout:5000});
    assert.deepEqual(errors,[]);results.push({engine:engine.name(),kind,viewport,interruption});console.log(`PASS ${engine.name()} ${kind} ${interruption}: real in-flight cancellation, no dependent/recovery replay, context closed`);continue;
   }
   const count=kind==='kakan-robbed'?0:kind==='discard'?1:2;if(count===0)await page.waitForTimeout(500);await page.waitForFunction(n=>(window as any).playedSounds.length===n,count,{timeout:5000});
   const proof=await page.evaluate(()=>({played:(window as any).playedSounds,ends:(window as any).motionEnds,acceptedAt:(window as any).acceptedAt}));
   writeFileSync(`${out}/${engine.name()}-${kind}-${viewport.width}.json`,JSON.stringify(proof,null,2));
   assert.equal(proof.played.length,count);
   if(kind!=='kan'&&!kind.startsWith('kakan')){assert(proof.ends.length>0);assert(Math.abs(proof.played[0].at-proof.ends[0].at)<30,`${engine.name()} ${kind}: impact does not match movement completion`);}
   if(kind==='nuki-own'||kind==='kan'||kind==='kakan')assert(proof.played[1].at-proof.played[0].at>=150,'own replacement sound waits for its actual arrival');
   if(kind==='nuki-opponent')assert(proof.played[1].at>proof.played[0].at,'replacement is a separate cue');
   await page.evaluate(r=>(window as any).paintSound(r,false),structuredClone(after));await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>(window as any).playedSounds.length),count,'GET must not replay');
   if(kind!=='kakan-robbed'){await page.getByRole('button',{name:'关闭音效'}).click();assert.equal(await page.evaluate(()=>localStorage.getItem('yougui.mahjong.sound')),'off');}
   await page.evaluate(()=>(window as any).unmountSound());try{await page.waitForFunction(()=>(window as any).audioContexts.every((c:AudioContext)=>c.state==='closed'),null,{timeout:5000});}catch(error){writeFileSync(`${out}/${engine.name()}-${kind}-${viewport.width}-close.json`,JSON.stringify(await page.evaluate(()=>({states:(window as any).audioContexts.map((c:AudioContext)=>c.state),closes:(window as any).audioCloses,root:document.getElementById('root')?.innerHTML})),null,2));throw error;}
   assert.deepEqual(errors,[]);results.push({engine:engine.name(),kind,viewport,control:box,...proof});console.log(`PASS ${engine.name()} ${kind} ${viewport.width}: actual native GameRoom/audio, impact/arrival, 44px mute, refresh and close`);
  }finally{await context.close();}
 }}finally{await browser.close();}
}
writeFileSync(`${out}/summary.json`,JSON.stringify({results},null,2));console.log(`PASS ${results.length} actual GameRoom audio scenes in ${out}`);
