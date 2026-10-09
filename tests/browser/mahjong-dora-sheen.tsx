import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import {tileMatchKey} from '../../src/components/mahjong/mahjong-tile';
import Majiang from '@kobalab/majiang-core';
import {doraKanSequence} from '../fixtures/mahjong-dora-game';
import type {RoomView} from '../../src/modules/mahjong/types';
const out='.local/audit/dora-sheen-browser-'+Date.now();mkdirSync(out,{recursive:true});
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['tests/browser/mahjong-dora-sheen.tsx','src/components/mahjong/mahjong-tile.tsx','src/components/mahjong/use-hand-hover.ts','tests/fixtures/mahjong-dora-game.ts','src/components/mahjong/mahjong-client.tsx','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts','tests/fixtures/mahjong-settlement-game.ts',...cssFiles];
const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.renderRoom=(room,opts={})=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={room.mySeat} connected={opts.connected??true} host={false} busy={opts.busy??false} motionCanAnimate onChoice={(c,intent)=>window.respond(c,intent)} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/></div></main>));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text;

function prepare(variant:'sanma'|'yonma',kind:string){
 const game=kind==='pon'?physicalEngine(variant,{0:'p5s123456789z123',1:'p05p123s123456z12'},'p5'):
 (kind==='river'||kind==='red-hand')?physicalEngine(variant,{0:kind==='red-hand'?'p0s123456789z123':'p5s123456789z123',1:'p123456789s123z4'},kind==='red-hand'?'p5':'p0',1):
 kind==='north'?physicalEngine(variant,{0:'p123s123456789z4',1:'p123456789s1z444'},'s2',1):
 physicalEngine(variant,{0:'p123s123z1234567'},'s4');
 const capacity=variant==='sanma'?3:4;
 const choose=(seat:number,type:string,value?:string)=>{const g=game.view(seat),c=g.choices.find(c=>c.type===type&&(value===undefined||c.value===value));assert(c,`${kind}: legal ${type}`);game.respond(seat,g.decisionId,c.id);};
 const pass=()=>{for(let seat=0;seat<capacity;seat++){const g=game.view(seat),c=g.choices.find(c=>c.type==='pass');if(c)game.respond(seat,g.decisionId,c.id);}};
 if(kind==='pon'){choose(0,'discard','p5_');choose(1,'pon');pass();choose(1,'discard');pass();}
 if(kind==='river'||kind==='red-hand'){choose(1,'discard',kind==='red-hand'?'p5_':'p0_');pass();}
 if(kind==='north'){for(let i=0;i<3;i++){choose(1,'nuki');pass();}choose(1,'discard');pass();}
 for(let i=0;game.view(0).turnSeat!==0&&i<12;i++){const seat=game.view(0).turnSeat;choose(seat,'discard');pass();}
 const g=game.view(0);assert.equal(g.turnSeat,0);assert.equal(g.settlement,null);
 const family=kind==='indicator'?tileMatchKey(g.doraIndicators[0]):kind==='north'?'z4':'p5';assert(family);
 const choice=g.choices.find(c=>c.type==='discard'&&tileMatchKey(c.value)===family&&!c.value?.endsWith('_'));assert(choice);
 if(kind==='pon')assert(g.players.some(p=>p.melds.some(m=>m.includes('0'))));
 if(kind==='north')assert.equal(g.players[1].nuki,3);
 return {game,family,choice};
}
const bonus=(value:string,variant:string)=>variant==='sanma'&&value==='m1'?'m9':Majiang.Shan.zhenbaopai(value);
const results:any[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const variant of ['sanma','yonma'] as const)for(const kind of ['red-hand','bonus-hand','river','pon','closed-kan',...(variant==='sanma'?['north']:[])])for(const viewport of [{width:667,height:375},{width:1440,height:810}]){
  const sequence=kind==='closed-kan'?doraKanSequence(variant):null;
  const g=sequence?sequence[0].game!:prepare(variant,kind==='bonus-hand'?'indicator':kind).game.view(0);
  const room:RoomView=sequence?sequence[0]:{id:'dora-sheen-native',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version:1,mySeat:0,game:g,members:g.players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))};
  const context=await browser.newContext({viewport,hasTouch:true}),page=await context.newPage(),commands:any[]=[],errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));await page.exposeFunction('respond',(c:any)=>commands.push(c));
  await page.route('http://tile-match.local/**',route=>{const p=new URL(route.request().url()).pathname;if(p.startsWith('/fonts/')||p.startsWith('/images/'))return route.fulfill({body:readFileSync('public'+p),contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp'});return route.fulfill({contentType:'text/html',body:`<style>*{box-sizing:border-box}body{margin:0}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`});});
  try {
   await page.goto('http://tile-match.local/');await page.emulateMedia({reducedMotion:'no-preference'});
   const inspect=async(r:RoomView)=>{
    await page.evaluate(r=>(window as any).renderRoom(r),r);await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth>0));
    const families=[...new Set(r.game!.doraIndicators.map(t=>bonus(t,variant)))];
    const samples=await page.locator('[data-testid="mahjong-board"] [data-tile-face]').evaluateAll(els=>els.map(e=>({tile:e.getAttribute('data-tile-face'),content:getComputedStyle(e,'::before').content,animation:getComputedStyle(e,'::before').animationName,position:getComputedStyle(e,'::before').backgroundPosition,pointerEvents:getComputedStyle(e,'::before').pointerEvents,scope:e.closest('.mahjong-table__surface,.mahjong-hand')?'player':'hud'})));
    for(const sample of samples){const expected=sample.scope==='player'&&(sample.tile?.[1]==='0'||families.includes(tileMatchKey(sample.tile)!));assert.equal(sample.content!=='none',expected,JSON.stringify(sample));if(expected){assert.equal(sample.animation,'mahjong-dora-sheen');assert.equal(sample.pointerEvents,'none');}}
    return {samples,families};
   };
   const initial=await inspect(room);
   if(kind==='bonus-hand')assert(initial.samples.some(s=>s.scope==='player'&&s.tile?.[1]!=='0'&&s.content!=='none'),'an actual ordinary dora face glows');
   if(kind==='red-hand')assert(initial.samples.some(s=>s.scope==='player'&&s.tile==='p0'&&s.content!=='none'));
   if(kind==='river')assert.equal(await page.locator('.mahjong-river [data-tile-face="p0"]').count(),1);
   if(kind==='pon')assert.equal(await page.locator('.mahjong-meld [data-tile-face="p0"]').count(),1);
   let paintedSheen=false;
   if(kind==='bonus-hand'){
    const face=page.locator('.mahjong-hand [data-tile-face="'+initial.families[0]+'"]').first();
    const bounds=await face.boundingBox();
    const seek=async(time:number)=>face.evaluate(async(e,time)=>{const animations=e.getAnimations({subtree:true}).filter(a=>(a as CSSAnimation).animationName==='mahjong-dora-sheen');if(animations.length!==1)throw Error('one actual CSS pseudo-element animation');animations[0].pause();animations[0].currentTime=time;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));},time);
    await seek(0);const before=await face.screenshot();await seek(1000);const after=await face.screenshot();assert.notEqual(sha(after),sha(before),'ordinary dora changes actual painted face pixels');assert.deepEqual(await face.boundingBox(),bounds,'light never changes the tile rectangle');
    writeFileSync(out+`/${engine.name()}-${variant}-${viewport.width}-ordinary-dora-before.png`,before);writeFileSync(out+`/${engine.name()}-${variant}-${viewport.width}-ordinary-dora-after.png`,after);paintedSheen=true;
    await face.evaluate(e=>e.getAnimations({subtree:true}).filter(a=>(a as CSSAnimation).animationName==='mahjong-dora-sheen').forEach(a=>a.play()));
   }
   const geometry=await page.locator('.mahjong-table__surface [data-tile-face]').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
   let final=initial;
   if(sequence){for(const frame of sequence.slice(1))final=await inspect(frame);assert.equal(sequence.at(-1)!.game!.doraIndicators.length,2);assert(initial.samples.some(s=>s.scope==='player'&&s.tile==='z7'&&s.content==='none'));assert(final.samples.some(s=>s.scope==='player'&&s.tile==='z7'&&s.content!=='none'),'new kan indicator activates the real ordinary hand tile');}
   const glowing=page.locator('.mahjong-hand [data-tile-face="p0"]').first();
   if(await glowing.count()){
    const before=await glowing.evaluate(e=>getComputedStyle(e,'::before').backgroundPosition);await page.waitForTimeout(600);const after=await glowing.evaluate(e=>getComputedStyle(e,'::before').backgroundPosition);assert.notEqual(after,before,'native CSS shimmer actually advances');
    await glowing.tap();assert.equal(commands.length,0,'shimmer never blocks or submits the first touch');
    assert.equal(await page.getByTestId('mahjong-board').getAttribute('data-matching-tile'),'p5');assert.equal(await glowing.evaluate(e=>getComputedStyle(e,'::before').animationName),'mahjong-dora-sheen');assert.notEqual(await glowing.evaluate(e=>getComputedStyle(e,'::after').content),'none','same-family tint composes with dora sheen');
   }
   await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${kind}-motion.png`});
   await page.emulateMedia({reducedMotion:'reduce'});
   const reduced=await page.locator('.mahjong-table :is(.mahjong-hand,.mahjong-table__surface) [data-tile-face]').evaluateAll(els=>els.filter(e=>getComputedStyle(e,'::before').content!=='none').map(e=>getComputedStyle(e,'::before').animationName));assert(reduced.every(a=>a==='none'));
   if(!sequence){const after=await page.locator('.mahjong-table__surface [data-tile-face]').evaluateAll(els=>{return els.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});});assert.deepEqual(after,geometry,'sheen never changes physical placement');}
   await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${kind}.png`});
   const last=sequence?.at(-1)??room;await page.evaluate(r=>(window as any).renderRoom(r,{connected:false}),last);assert.equal(commands.length,0);assert.deepEqual(errors,[]);
   results.push({engine:engine.name(),variant,viewport,kind,initial,final,nativeMotionChecked:await glowing.count()>0,paintedSheen,reducedMotion:true,geometryUnchanged:!sequence,commands:commands.length});console.log('PASS',engine.name(),variant,viewport.width,kind);
  }catch(error){await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${kind}-failure.png`});writeFileSync(out+'/failure.json',JSON.stringify({error:String(error),commands,errors},null,2));throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}
assert.equal(results.length,44);assert.equal(new Set(results.map(r=>[r.engine,r.variant,r.viewport.width,r.kind].join(':'))).size,44);assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS44 native dora-sheen scenes',out);
