import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {rankingPair} from '../fixtures/mahjong-ranking-game';
const out=`.local/audit/ranking-audio-browser-${Date.now()}`;mkdirSync(out,{recursive:true});
const css=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>readFileSync(`src/app/mahjong/${m[1]}`,'utf8')).join('\n');
const harness=`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.paintRank=(room,live=true,connected=true)=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={0} host connected={connected} busy={false} motionCanAnimate={live} onChoice={()=>{}} onLeave={()=>{}} onRematch={()=>{}} onFinish={()=>{}}/></div></main>));window.closeRank=()=>flushSync(()=>root.unmount());`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,metafile:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const sha=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
writeFileSync(`${out}/manifest.json`,JSON.stringify({cssSha:sha(css),bundleSha:sha(bundle.outputFiles[0].text),nativeFixtureSha:sha(readFileSync('tests/fixtures/mahjong-ranking-game.ts')),sources:Object.keys(bundle.metafile!.inputs).filter(p=>!p.startsWith('<')).map(path=>({path,sha256:sha(readFileSync(path))}))},null,2));
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const scene of [
 ...(['sanma','yonma'] as const).flatMap(variant=>[false,true].flatMap(bot=>[667,1440].map(width=>({variant,bot,width,mode:'none'})))),
 ...['mute','disconnect','get','resize','unmount','late-join'].map(mode=>({variant:'sanma' as const,bot:false,width:844,mode}))
 ]){
  const {variant,bot,width,mode}=scene,label=`${engine.name()}-${variant}-${bot?'bot':'human'}-${width}-${mode}`,pair=rankingPair(variant,bot);
  if(process.env.RANKING_SHORT_ONLY==='1'&&(mode!=='none'||bot||width!==667))continue;
  const height=process.env.RANKING_SHORT_ONLY==='1'?375:width===1440?810:390;
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(label,e.message);});
  try{
   await page.route('https://mahjong.local/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
   await page.route('https://mahjong.local/fonts/**',route=>route.fulfill({contentType:'font/woff2',body:readFileSync('public'+new URL(route.request().url()).pathname)}));
   await page.route('https://mahjong.local/images/**',route=>{const p=new URL(route.request().url()).pathname;return route.fulfill({contentType:p.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync('public'+p)});});
   await page.goto('https://mahjong.local/');await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*:before,*:after{box-sizing:border-box}${css}</style><div id="root"></div>`);
   await page.addScriptTag({content:`window.rankAudio=[];window.contexts=[];const Real=window.AudioContext;window.AudioContext=function(...args){const c=new Real(...args);window.contexts.push(c);const create=c.createBufferSource.bind(c);c.createBufferSource=()=>{const s=create(),start=s.start;s.start=function(...args){window.rankAudio.push({at:performance.now(),duration:s.buffer.duration,visible:[...document.querySelectorAll('[data-ranking-visible="true"]')].map(e=>Number(e.querySelector('.mahjong-ranking__place').textContent)),rankingId:document.querySelector('[data-ranking-id]')?.getAttribute('data-ranking-id')});return start.apply(s,args);};return s;};return c;};globalThis.process={env:{NODE_ENV:'development'}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});\n${bundle.outputFiles[0].text}`});
   await page.evaluate(r=>(window as any).paintRank(r),pair.before);
   const toolbarHit=await page.getByRole('button',{name:'关闭音效'}).evaluate(el=>{const b=el.getBoundingClientRect(),panel=document.querySelector('.mahjong-settlement-panel')!.getBoundingClientRect();return {width:b.width,height:b.height,bottom:b.bottom,panelTop:panel.top,panelBottom:panel.bottom,hits:[[.5,.5],[.1,.1],[.9,.1],[.1,.9],[.9,.9]].map(([x,y])=>{const target=document.elementFromPoint(b.left+b.width*x,b.top+b.height*y);return !!target&&(el===target||el.contains(target));})};});
   assert(toolbarHit.width>=44&&toolbarHit.height>=44&&toolbarHit.hits.every(Boolean),JSON.stringify(toolbarHit));assert(toolbarHit.panelTop>=toolbarHit.bottom+4,'result must clear toolbar');assert(toolbarHit.panelBottom<=height,'short landscape result stays on screen');
   await page.getByRole('button',{name:'关闭音效'}).click();await page.getByRole('button',{name:'开启音效'}).click();await page.waitForFunction(()=>(window as any).contexts.some((c:AudioContext)=>c.state==='running'));
   assert.equal(await page.evaluate(()=>(window as any).rankAudio.length),0,'before final ACK remains silent');
   if(mode==='late-join')pair.advance(1800);
   await page.evaluate(r=>{(window as any).rankAccepted=performance.now();(window as any).paintRank(r);},mode==='late-join'?pair.view():pair.after);
   if(mode==='none'){
    const count=pair.after.game!.ranking!.length;await page.waitForFunction(n=>(window as any).rankAudio.length===n,count);
    const proof=await page.evaluate(()=>({at:(window as any).rankAccepted,sounds:(window as any).rankAudio}));assert.equal(proof.sounds.length,count);
    proof.sounds.forEach((s:any,index:number)=>{assert.equal(s.duration,index===0?.26:.12);assert.deepEqual(s.visible,Array.from({length:index+1},(_,i)=>i+1));assert.equal(s.rankingId,pair.after.game!.rankingFlow!.id);assert(s.at-proof.at>=1800+800*index-10);});
    for(let i=1;i<count;i++)assert(proof.sounds[i].at-proof.sounds[i-1].at>=650,'separate visible rank beats');
    await page.evaluate(r=>(window as any).paintRank(r,false),pair.after);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>(window as any).rankAudio.length),count,'GET stays silent');
   }else{
    if(mode==='mute'){await page.getByRole('button',{name:'关闭音效'}).click();await page.getByRole('button',{name:'开启音效'}).click();}
    if(mode==='disconnect'){await page.evaluate(r=>(window as any).paintRank(r,true,false),pair.after);await page.evaluate(r=>(window as any).paintRank(r),pair.after);}
    if(mode==='get'){await page.evaluate(r=>(window as any).paintRank(r,false),pair.after);await page.evaluate(r=>(window as any).paintRank(r),pair.after);}
    if(mode==='resize')await page.setViewportSize({width:width+10,height:390});
    if(mode==='unmount')await page.evaluate(()=>(window as any).closeRank());
    await page.waitForTimeout(4500);assert.equal(await page.evaluate(()=>(window as any).rankAudio.length),0,`${label}: no final catch-up`);
   }
   if(mode!=='unmount')await page.evaluate(()=>(window as any).closeRank());await page.waitForFunction(()=>(window as any).contexts.every((c:AudioContext)=>c.state==='closed'));
   assert.deepEqual(errors,[]);const proof={label,...scene,viewport:{width,height},toolbarHit,rankings:pair.after.game!.ranking,sounds:await page.evaluate(()=>(window as any).rankAudio)};results.push(proof);writeFileSync(`${out}/${label}.json`,JSON.stringify(proof,null,2));console.log(`PASS ${label}: native final ACK, real audio/painted rank, no catch-up, closed context`);
  }finally{await context.close();}
 }}finally{await browser.close();}
}
writeFileSync(`${out}/summary.json`,JSON.stringify({results},null,2));console.log(`PASS ${results.length} actual ranking audio scenes in ${out}`);
