import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import reference from '../fixtures/mahjong-deal-arrival-reference.json';
import type {RoomView} from '../../src/modules/mahjong/types';
const out='.local/audit/deal-arrival-'+Date.now();mkdirSync(out,{recursive:true});
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['tests/browser/mahjong-deal-arrival.tsx','tests/fixtures/mahjong-deal-arrival-reference.json','src/components/mahjong/mahjong-client.tsx','src/components/mahjong/mahjong-standing-tile.tsx','src/components/mahjong/use-round-opening.ts','src/components/mahjong/hand-rack.ts','src/components/mahjong/use-opening-sort.ts','src/modules/mahjong/round-opening.ts',...cssFiles];
const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';import{openingKey}from'./src/modules/mahjong/round-opening';const root=createRoot(document.getElementById('root'));window.paintDeal=(room,live=true,connected=true)=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={room.mySeat} openingIntent={live?openingKey(room):null} connected={connected} host={false} busy={false} motionCanAnimate onChoice={()=>{throw Error('presentation submitted a choice')}} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/></div></main>));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text;
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const mode of ['live','baseline','reduced'] as const){
  const game=physicalEngine(variant,{0:'p23987654s321z22'},'p1').view(0);
  const room:RoomView={id:'deal-arrival',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version:1,mySeat:0,game,members:game.players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))};
  const context=await browser.newContext({viewport,reducedMotion:mode==='reduced'?'reduce':'no-preference'}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://deal-arrival.local/**',route=>{
   const p=new URL(route.request().url()).pathname;
   if(p.startsWith('/fonts/')||p.startsWith('/images/'))return route.fulfill({body:readFileSync('public'+p),contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp'});
   return route.fulfill({contentType:'text/html',body:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`});
  });
  try{
   await page.goto('http://deal-arrival.local/');
   // Complete initial viewport/font layout before introducing a live animation.
   await page.evaluate(r=>(window as any).paintDeal(r,false),room);
   await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
   await page.clock.install();await page.clock.pauseAt(new Date());await page.evaluate(({room,live})=>(window as any).paintDeal(room,live),{room,live:mode!=='baseline'});
   if(mode!=='live'){
    assert.equal(await page.locator('[data-deal-wave]').count(),0);assert.equal(await page.locator('[data-deal-visible="false"]').count(),0);
    assert.deepEqual(errors,[]);results.push({engine:engine.name(),variant,viewport,mode});continue;
   }
   const waves:unknown[]=[];
   for(let wave=0;wave<4;wave++){
    if(wave)await page.clock.runFor(300);
    const samples=await page.evaluate(({wave,reference})=>{
     const tiles=[...document.querySelectorAll<HTMLElement>(`[data-deal-wave="${wave}"]:not([data-deal-visible="false"])`)];
     return tiles.map(tile=>{
      const standing=tile.classList.contains('mahjong-standing-tile'),faces=[...tile.querySelectorAll<HTMLElement>('[data-standing-face]')];
      const animation=tile.getAnimations().find(a=>a.effect instanceof KeyframeEffect&&a.effect.target===tile);
      if(!animation)throw Error('visible wave has no native arrival');animation.pause();
      const materials=faces.map(face=>{const a=face.getAnimations().find(a=>a.effect instanceof KeyframeEffect&&a.effect.target===face);a?.pause();return {face,animation:a};});
      const parent=tile.closest(standing?'.mahjong-player__hidden':'.mahjong-hand')!;
      const pitch=parseFloat(getComputedStyle(tile).width)+parseFloat(getComputedStyle(parent).gap);
      const transformBefore=faces.map(face=>getComputedStyle(face).transform);
      const points=reference.samples.map(point=>{
       animation.currentTime=point.timeMs;materials.forEach(x=>{if(x.animation)x.animation.currentTime=point.timeMs;});
       const style=getComputedStyle(tile),tokens=style.translate==='none'?[]:style.translate.split(' ');
       return {time:point.timeMs,alpha:parseFloat(style.opacity),rise:standing?parseFloat(tokens[2]??'0'):-parseFloat(tokens[1]??'0'),faceAlpha:faces.map(face=>parseFloat(getComputedStyle(face).opacity)),faceTransforms:faces.map(face=>getComputedStyle(face).transform),root3d:style.transformStyle,body3d:standing?getComputedStyle(tile.querySelector('[data-standing-body]')!).transformStyle:null};
      });
      return {standing,pitch,duration:animation.effect!.getTiming().duration,easing:animation.effect!.getTiming().easing,materials:materials.map(x=>x.animation?.effect?.getTiming()??null),transformBefore,points};
     });
    },{wave,reference});
    assert.equal(samples.length,wave<3?(variant==='sanma'?12:16):(variant==='sanma'?4:5),`wave ${wave} ${engine.name()} ${variant}`);assert(samples.some(x=>x.standing));assert(samples.some(x=>!x.standing));
    for(const tile of samples){assert.equal(tile.duration,reference.durationMs);assert.equal(tile.easing,reference.easing);
     if(tile.standing){assert.equal(tile.materials.length,6);for(const m of tile.materials){assert(m);assert.equal(m.duration,reference.durationMs);assert.equal(m.easing,reference.easing);}}
     for(let i=0;i<reference.samples.length;i++){const expected=reference.samples[i],actual=tile.points[i];assert(Math.abs(actual.rise-tile.pitch*expected.height/reference.normalPitch)<.1,JSON.stringify({expected,actual,pitch:tile.pitch}));
      if(tile.standing){assert.equal(actual.alpha,1);assert.equal(actual.root3d,'preserve-3d');assert.equal(actual.body3d,'preserve-3d');assert.deepEqual(actual.faceTransforms,tile.transformBefore);for(const alpha of actual.faceAlpha)assert(Math.abs(alpha-expected.alpha)<.01);}
      else assert(Math.abs(actual.alpha-expected.alpha)<.01);
     }
    }
    if(wave===0){
     await page.locator('.mahjong-game').evaluate(root=>{for(const a of root.getAnimations({subtree:true}))if(a instanceof CSSAnimation&&a.animationName.startsWith('mahjong-deal-'))a.currentTime=100;});
     await page.screenshot({path:`${out}/${engine.name()}-${variant}-${viewport.width}-half.png`});
     await page.locator('.mahjong-game').evaluate(root=>{for(const a of root.getAnimations({subtree:true}))if(a instanceof CSSAnimation&&a.animationName.startsWith('mahjong-deal-'))a.currentTime=200;});
    }
    waves.push({wave,samples});
   }
   await page.evaluate(r=>(window as any).paintDeal(r,true,false),room);
   assert.equal(await page.locator('[data-deal-wave]').count(),0);
   const canceled=await page.locator('.mahjong-standing-tile__face').evaluateAll(xs=>xs.every(x=>getComputedStyle(x).opacity==='1'));assert(canceled);assert.equal(await page.locator('.mahjong-game').evaluate(root=>root.getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation&&a.animationName.startsWith('mahjong-deal-')).length),0);
   await page.screenshot({path:`${out}/${engine.name()}-${variant}-${viewport.width}.png`});
   results.push({engine:engine.name(),variant,viewport,mode,waves});assert.deepEqual(errors,[]);console.log('PASS',engine.name(),variant,viewport.width,mode);
  }catch(error){writeFileSync(out+'/failure.json',JSON.stringify({error:String(error),engine:engine.name(),variant,viewport,mode},null,2));throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}
assert.equal(results.length,24);for(const [n,h]of Object.entries(sources))assert.equal(sha(readFileSync(n)),h);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS 24 native material/rise and baseline scenes',out);
