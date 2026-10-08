import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {declarationPair,nukiRonPair} from '../fixtures/mahjong-declaration-game';
import type {RoomView} from '../../src/modules/mahjong/types';
const out=`.local/audit/declaration-browser-${Date.now()}`;mkdirSync(out,{recursive:true});
const css=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>readFileSync(`src/app/mahjong/${m[1]}`,'utf8')).join('\n');
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';import {TableAudioPlayer} from './src/components/mahjong/table-audio';
const root=createRoot(document.getElementById('root'));window.audioLog=[];window.unlocked=false;const play=TableAudioPlayer.prototype.play,unlock=TableAudioPlayer.prototype.unlock;
TableAudioPlayer.prototype.unlock=async function(){const ok=await unlock.call(this);if(ok)window.unlocked=true;return ok;};
TableAudioPlayer.prototype.play=function(cue){const ok=play.call(this,cue);if(ok)window.audioLog.push({cue,at:performance.now(),visible:[...document.querySelectorAll('[data-declaration-event]')].map(n=>n.dataset.declarationEvent)});return ok;};
window.api={render:(room,connected=true,canAnimate=true)=>{window.renderAt=performance.now();flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} connected={connected} motionCanAnimate={canAnimate} ownSeat={0} host={false} busy={false} onChoice={()=>{}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/></div></main>));},reset:()=>{window.audioLog=[];},unmount:()=>flushSync(()=>root.render(null))};`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  for(const variant of ['sanma','yonma'] as const)for(const kind of [...(['riichi','ron','tsumo'] as const),...(variant==='sanma'?(['rob-nuki','rob-nuki-double','rob-nuki-kokushi'] as const):[])]){
   const page=await browser.newPage({viewport:{width:844,height:390}});
   await page.route('https://mahjong.local/images/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({status:200,contentType:path.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync(`public${path}`)});});
   await page.route('https://mahjong.local/',route=>route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;--font-body:sans-serif;--font-display:serif}${css}</style><div id="root"></div>`}));
   await page.goto('https://mahjong.local/');await page.addScriptTag({content:'globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};'});await page.addScriptTag({content:bundle.outputFiles[0].text});
   const {before,after}=kind==='rob-nuki'?nukiRonPair():kind==='rob-nuki-double'?nukiRonPair('double'):kind==='rob-nuki-kokushi'?nukiRonPair('kokushi'):declarationPair(variant,kind);
   const soundKind=kind.startsWith('rob-nuki')?'ron':kind;
   const render=(room:RoomView,connected=true,canAnimate=true)=>page.evaluate(({room,connected,canAnimate})=>(window as any).api.render(room,connected,canAnimate),{room,connected,canAnimate});
   await render(after,true,false);await page.waitForTimeout(400);assert.equal(await page.locator('[data-declaration-event]').count(),0,'cold result has no catch-up declaration');
   await render(before,true,false);await page.locator('.mahjong-game').click({position:{x:422,y:90}});await page.waitForFunction(()=>(window as any).unlocked);
   await page.evaluate(()=>(window as any).api.reset());await render(after);
   const started=await page.evaluate(()=>(window as any).renderAt as number),expected=after.game?.settlementFlow?.winDeclarations?.length??1;
   await page.waitForFunction(n=>document.querySelectorAll('[data-declaration-event]').length===n,expected);
   const markers=await page.locator('[data-declaration-event]').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {seat:node.getAttribute('data-declaration-seat'),id:node.getAttribute('data-declaration-event'),x:r.x,y:r.y,w:r.width,h:r.height,pointer:getComputedStyle(node).pointerEvents};}));
   assert(markers.every(m=>m.x>=0&&m.y>=0&&m.x+m.w<=844&&m.y+m.h<=390&&m.pointer==='none'),'desk labels visible and do not capture input');
   if(kind!=='riichi'){assert.equal(await page.locator('.mahjong-settlement-panel').count(),0,'winner panel waits for intro');assert.equal(await page.locator('.mahjong-call-announcement.is-win').count(),0,'no duplicate generic winner banner');}
   await page.waitForFunction(n=>(window as any).audioLog.filter((e:any)=>['riichi','ron','tsumo'].includes(e.cue.kind)).length===n,expected);
   const sounds=await page.evaluate(()=>(window as any).audioLog.filter((e:any)=>['riichi','ron','tsumo'].includes(e.cue.kind))) as {cue:{id:string;kind:string;seat:number};at:number;visible:string[]}[];
   assert(sounds.every(s=>s.cue.kind===soundKind&&s.visible.includes(s.cue.id)),'actual player cue starts only with its matching visual marker');
   assert(sounds.every(s=>s.at-started>=280&&s.at-started<800),'native declaration timing');
   if(soundKind==='ron'){assert.deepEqual(sounds.map(s=>s.cue.seat),after.game!.settlementFlow!.winDeclarations!.map(d=>d.seat));if(expected>1)assert(sounds[1].at-sounds[0].at>=10&&sounds[1].at-sounds[0].at<120,'ordered multi-ron sound spacing');}
   await page.waitForFunction(()=>[...document.querySelectorAll<HTMLElement>('[data-declaration-event] b')].every(node=>Number(getComputedStyle(node).opacity)>.99));
   await page.screenshot({path:`${out}/${engine.name()}-${variant}-${kind}.png`});
   await page.waitForFunction(()=>document.querySelectorAll('[data-declaration-event]').length===0);
   if(kind!=='riichi')await page.waitForFunction(()=>!!document.querySelector('.mahjong-settlement-panel'));
   await render(after);await page.waitForTimeout(80);assert.equal((await page.evaluate(()=>(window as any).audioLog.filter((e:any)=>['riichi','ron','tsumo'].includes(e.cue.kind)))).length,expected,'duplicate snapshot silent');
   await render(before,true,false);await page.evaluate(()=>(window as any).api.reset());await render(after,false);await page.waitForTimeout(400);
   assert.equal(await page.locator('[data-declaration-event]').count(),0);assert.equal((await page.evaluate(()=>(window as any).audioLog)).length,0);
   await render(after,true,false);await render(after);await page.waitForTimeout(350);assert.equal((await page.evaluate(()=>(window as any).audioLog)).length,0,'reconnect silent');
   const interruptions:string[]=[];
   if(kind==='ron')for(const stop of ['mute','offline','get','resize','unmount']){
    await render(before,true,false);await page.evaluate(()=>(window as any).api.reset());await render(after);await page.waitForTimeout(80);
    if(stop==='mute')await page.getByRole('button',{name:'关闭音效'}).click();
    if(stop==='offline')await render(after,false);
    if(stop==='get')await render(after,true,false);
    if(stop==='resize')await page.setViewportSize({width:850,height:390});
    if(stop==='unmount')await page.evaluate(()=>(window as any).api.unmount());
    await page.waitForTimeout(450);assert.equal((await page.evaluate(()=>(window as any).audioLog)).length,0,`${stop} cancels both pending ron sources`);
    if(stop==='mute')await page.getByRole('button',{name:'开启音效'}).click();
    if(stop==='resize')await page.setViewportSize({width:844,height:390});
    interruptions.push(stop);
   }
   results.push({browser:engine.name(),variant,kind,markers,sounds,started,interruptions});console.log(`PASS ${engine.name()} ${variant} ${kind}: real GameRoom markers/audio/intro/duplicate/offline/reconnect ${interruptions.join('/')}`);await page.close();
  }
 }finally{await browser.close();}
}
writeFileSync(`${out}/summary.json`,JSON.stringify({results},null,2));console.log(`PASS ${results.length} actual declaration scenes in ${out}`);
