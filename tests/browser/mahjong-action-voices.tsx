import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {actionVoiceSequence,type ActionFixtureKind} from '../fixtures/mahjong-action-voice-game';
import type {GameVariant,RoomView} from '../../src/modules/mahjong/types';
const out=`.local/audit/action-voices-${Date.now()}`;mkdirSync(out,{recursive:true});
const paths=['src/components/mahjong/action-voices.ts','src/components/mahjong/use-table-audio.ts','src/components/mahjong/table-audio.ts','src/components/mahjong/voice-samples.ts','src/components/mahjong/mahjong-call-announcement.tsx','src/components/mahjong/use-table-feedback.ts','src/components/mahjong/public-call-motion.ts','src/components/mahjong/nuki-motion.ts','tests/fixtures/mahjong-action-voice-game.ts','tests/browser/mahjong-action-voices.tsx'];
const sources=Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const assets=Object.fromEntries(['riichi','ron','tsumo','chi','pon','kan','north'].map(kind=>[kind,{bytes:readFileSync(`public/audio/mahjong/voices/${kind}.wav`).length,sha256:createHash('sha256').update(readFileSync(`public/audio/mahjong/voices/${kind}.wav`)).digest('hex')}]));assert.equal(new Set(Object.values(assets).map(a=>a.bytes)).size,7);
const css=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>readFileSync(`src/app/mahjong/${m[1]}`,'utf8')).join('\n');
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';
window.nativeVoices=[];window.decoded=[];window.contexts=[];const buffers=new WeakMap(),decode=AudioContext.prototype.decodeAudioData;
AudioContext.prototype.decodeAudioData=async function(bytes){if(!window.contexts.includes(this))window.contexts.push(this);const length=bytes.byteLength,b=await decode.call(this,bytes);buffers.set(b,length);window.decoded.push(length);return b;};
const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){const bytes=buffers.get(this.buffer);if(bytes)window.nativeVoices.push({bytes,at:performance.now(),acceptedAt:window.acceptedAt,duration:this.buffer.duration,markers:[...document.querySelectorAll('[data-action-voice-kind]')].map(n=>({kind:n.dataset.actionVoiceKind,decision:n.dataset.feedbackDecision,seat:Number(n.dataset.feedbackSeat),label:n.querySelector('strong')?.textContent}))});return start.apply(this,args);};
const root=createRoot(document.getElementById('root'));window.api={render:(room,canAnimate=true,connected=true)=>{window.acceptedAt=performance.now();flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={room.mySeat} host={false} connected={connected} busy={false} motionCanAnimate={canAnimate} onChoice={()=>{}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/></div></main>));},reset:()=>window.nativeVoices=[],unmount:()=>flushSync(()=>root.unmount())};`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const cases: [GameVariant,ActionFixtureKind][]=[...(['chi','pon','open-kan','closed-kan','kakan-pass','kakan-robbed'] as const).map(kind=>['yonma',kind] as [GameVariant,ActionFixtureKind]),...(['pon','open-kan','closed-kan','north-own','north-opponent','north-pass','north-robbed','closed-kan-pass','closed-kan-robbed'] as const).map(kind=>['sanma',kind] as [GameVariant,ActionFixtureKind])];
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const [variant,kind] of cases){
  const page=await browser.newPage({viewport});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://mahjong.local/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;--font-body:sans-serif;--font-display:serif}${css}</style><div id="root"></div>`});
   const contentType=path.endsWith('.wav')?'audio/wav':path.endsWith('.woff2')?'font/woff2':path.endsWith('.svg')?'image/svg+xml':'image/webp';return route.fulfill({contentType,body:readFileSync('public'+path)});
  });
  await page.goto('https://mahjong.local/');await page.addScriptTag({content:'globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};'});await page.addScriptTag({content:bundle.outputFiles[0].text});
  const {frames}=actionVoiceSequence(variant,kind),last=frames.at(-1)!;
  const render=(room:RoomView,animate=true,connected=true)=>page.evaluate(({room,animate,connected})=>(window as any).api.render(room,animate,connected),{room,animate,connected});
  await render(last,false);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>(window as any).contexts.length),0,'cold state never creates audio context');
  await render(frames[0],false);await page.locator('.mahjong-game').click({position:{x:100,y:20}});await page.waitForFunction(()=>(window as any).decoded.length===7);await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>r())));await page.evaluate(()=>(window as any).api.reset());
  let screenshot:string|undefined;
  for(const frame of frames.slice(1)){await render(frame);await page.waitForTimeout(60);if(!screenshot&&await page.evaluate(()=>(window as any).nativeVoices.length>0)){screenshot=`${out}/${engine.name()}-${viewport.width}-${variant}-${kind}.png`;await page.screenshot({path:screenshot});}}
  const voiceKind=kind.startsWith('north')?'north':kind==='chi'||kind==='pon'?kind:'kan';
  await page.waitForFunction(bytes=>(window as any).nativeVoices.some((v:any)=>v.bytes===bytes),assets[voiceKind].bytes);
  const voices=await page.evaluate(()=>(window as any).nativeVoices) as {bytes:number;at:number;acceptedAt:number;duration:number;markers:{kind:string;decision:string;seat:number;label:string}[]}[];
  const actionVoices=voices.filter(v=>['chi','pon','kan','north'].some(k=>assets[k].bytes===v.bytes));assert.equal(actionVoices.length,1,'one public action declaration even after kan resolution');
  const voice=actionVoices[0];assert.equal(voice.bytes,assets[voiceKind].bytes);const expectedSeat=kind==='chi'||kind==='pon'||kind==='open-kan'||kind.startsWith('kakan')?1:0;
  assert(voice.markers.some(m=>m.kind===voiceKind&&m.seat===expectedSeat&&m.decision),'native voice uses matching actual GameRoom announcement');assert(voice.at-voice.acceptedAt>=0&&voice.at-voice.acceptedAt<250,'voice belongs to announcement onset, not later group landing');
  await page.waitForTimeout(1000);await render(structuredClone(last));await page.waitForTimeout(80);assert.equal((await page.evaluate(()=>(window as any).nativeVoices)).length,voices.length,'duplicate result silent');
  await render(last,true,false);await render(last,false,true);await render(last);await page.waitForTimeout(80);assert.equal((await page.evaluate(()=>(window as any).nativeVoices)).length,voices.length,'GET/reconnect cannot replay');
  await page.evaluate(()=>(window as any).api.unmount());await page.waitForFunction(()=>(window as any).contexts.every((c:AudioContext)=>c.state==='closed'));assert.deepEqual(errors,[]);
  results.push({engine:engine.name(),viewport,variant,kind,versions:frames.map(f=>f.version),voiceKind,expectedSeat,voice,voices,screenshot});console.log(`PASS ${engine.name()} ${viewport.width} ${variant} ${kind}: true decoded voice, public sequential frames, actual declaration marker, no replay`);await page.close();
 }}finally{await browser.close();}
}
writeFileSync(`${out}/proof.json`,JSON.stringify({sources,assets,scenes:results.length,results},null,2));console.log(`PASS ${results.length} actual action-voice scenes in ${out}`);
