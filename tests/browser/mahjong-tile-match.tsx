import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import {tileMatchKey} from '../../src/components/mahjong/mahjong-tile';
import type {RoomView} from '../../src/modules/mahjong/types';
const out='.local/audit/tile-match-browser-'+Date.now();mkdirSync(out,{recursive:true});
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['tests/browser/mahjong-tile-match.tsx','src/components/mahjong/mahjong-tile.tsx','src/components/mahjong/use-hand-hover.ts','src/components/mahjong/mahjong-client.tsx','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts','tests/fixtures/mahjong-settlement-game.ts',...cssFiles];
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
const results:any[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const variant of ['sanma','yonma'] as const)for(const kind of ['indicator','river','red-hand','pon',...(variant==='sanma'?['north']:[])])for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const input of ['hover','touch']){
  const {game,family,choice}=prepare(variant,kind),g=game.view(0);
  const room:RoomView={id:'tile-match-native',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version:1,mySeat:0,game:g,members:g.players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))};
  const context=await browser.newContext({viewport,hasTouch:input==='touch'}),page=await context.newPage(),commands:any[]=[],errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));await page.exposeFunction('respond',(c:any)=>commands.push(c));
  await page.route('http://tile-match.local/**',route=>{const p=new URL(route.request().url()).pathname;if(p.startsWith('/fonts/')||p.startsWith('/images/'))return route.fulfill({body:readFileSync('public'+p),contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp'});return route.fulfill({contentType:'text/html',body:`<style>*{box-sizing:border-box}body{margin:0}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`});});
  try {
   await page.goto('http://tile-match.local/');await page.evaluate(r=>(window as any).renderRoom(r),room);
   await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth>0));await page.evaluate(()=>document.fonts.ready);
   const rects=await page.locator('.mahjong-table__surface [data-tile-face]').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
   const tile=page.locator('.mahjong-hand button[data-choice-id='+JSON.stringify(choice.id)+']').first();
   if(input==='touch')await tile.tap();else{await tile.hover();await page.waitForTimeout(30);}
   assert.equal(await page.getByTestId('mahjong-board').getAttribute('data-matching-tile'),family);
   const samples=await page.locator('[data-testid="mahjong-board"] [data-tile-face]').evaluateAll(els=>els.map(e=>({tile:e.getAttribute('data-tile-face'),content:getComputedStyle(e,'::after').content,color:getComputedStyle(e,'::after').backgroundColor,blend:getComputedStyle(e,'::after').mixBlendMode,scope:e.closest('.mahjong-table__surface,.mahjong-hand')?'player':'hud'})));
   for(const sample of samples){const match=sample.scope==='player'&&tileMatchKey(sample.tile)===family;assert.equal(sample.content!=='none',match,JSON.stringify(sample));if(match){assert.equal(sample.color,'rgb(157, 211, 249)');assert.equal(sample.blend,'multiply');}}
   const publicSamples=samples.filter(s=>s.scope==='player'&&tileMatchKey(s.tile)===family);
   assert(publicSamples.length>0);
   if(kind==='pon')assert(publicSamples.some(s=>s.tile==='p0'),'red meld five matches ordinary selected five');
   if(kind==='red-hand'){assert(choice.value?.startsWith('p0'));assert(publicSamples.some(s=>s.tile==='p5'),'ordinary river five matches selected red five');}
   if(kind==='river')assert.equal(await page.locator('.mahjong-river [data-tile-face="p0"]').count(),1);
   if(kind==='north')assert.equal(await page.locator('[data-nuki-volume] [data-tile-face="z4"]').count(),3);
   if(kind==='indicator')assert(samples.some(s=>s.scope==='hud'&&tileMatchKey(s.tile)===family&&s.content==='none'));
   const after=await page.locator('.mahjong-table__surface [data-tile-face]').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));assert.deepEqual(after,rects,'highlight never changes public physical placement');
   assert.equal(commands.length,0,'selection and highlights never submit');
   await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${kind}-${input}.png`});
   await page.evaluate(r=>(window as any).renderRoom(r,{connected:false}),room);assert.equal(await page.getByTestId('mahjong-board').getAttribute('data-matching-tile'),null);
   assert.equal(await page.locator('.mahjong-table__surface [data-tile-face]').evaluateAll(els=>els.filter(e=>getComputedStyle(e,'::after').content!=='none').length),0);
   assert.deepEqual(errors,[]);results.push({engine:engine.name(),variant,viewport,kind,input,family,samples,publicGeometryUnchanged:true});console.log('PASS',engine.name(),variant,viewport.width,kind,input);
  }catch(error){await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${kind}-${input}-failure.png`});writeFileSync(out+'/failure.json',JSON.stringify({error:String(error),commands,errors},null,2));throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}
assert.equal(results.length,72);assert.equal(new Set(results.map(r=>[r.engine,r.variant,r.viewport.width,r.kind,r.input].join(':'))).size,72);assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS 72 native tile-match scenes',out);
