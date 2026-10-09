import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {SanmaGame} from '../../src/modules/mahjong/sanma';
import {SanmaWall,sanmaTiles} from '../../src/modules/mahjong/sanma-wall';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {RoomView,GameVariant} from '../../src/modules/mahjong/types';
const out='.local/audit/sheen-flight-'+Date.now();mkdirSync(out,{recursive:true});const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['tests/browser/mahjong-sheen-flight.tsx','src/components/mahjong/mahjong-client.tsx','src/components/mahjong/use-discard-motion.tsx','src/components/mahjong/discard-motion.ts','src/components/mahjong/use-public-call-motion.tsx','src/components/mahjong/use-nuki-motion.tsx','src/components/mahjong/mahjong-solid-flight-tile.tsx','src/components/mahjong/tile-sheen-motion.ts','src/modules/mahjong/sanma-wall.ts',...cssFiles];const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';let currentIntent=null;const root=createRoot(document.getElementById('root'));window.api={render:(room,connected=true)=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={0} host={false} connected={connected} busy={false} motionCanAnimate motionIntent={currentIntent} onChoice={(c,intent)=>{currentIntent=intent;window.lastIntent=intent;window.respond(c);}} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/></div></main>))};`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text;
function northScene(){
 return new SanmaGame('east',['A','B','C'],{dealer:0,wallFactory:()=>{
  const physical=sanmaTiles(),available=physical.slice(),take=(tile:string)=>{const i=available.indexOf(tile);assert(i>=0);return available.splice(i,1)[0];};
  const own=['p1','p2','p3',...'123456789'].map((t,i)=>i<3?t:'s'+t).concat(['z4']).map(take),draw=take('p4'),indicator=take('z3');
  const dealt=[own,...Array.from({length:2},()=>available.splice(0,13))],reserve=available.splice(0,4),indicators=[indicator,...available.splice(0,9)];
  const ordered=[...dealt.flat(),draw,...available,...reserve,...indicators];assert.deepEqual(ordered.slice().sort(),physical.slice().sort());return new SanmaWall(ordered);
 }});
}
const results:any[]=[];
for(const engine of [chromium,webkit]){const browser=await engine.launch();try{for(const variant of ['sanma','yonma'] as const)for(const kind of ['own-red','own-dora','own-matte','opponent-red','red-pon','red-pon-overlap',...(variant==='sanma'?['north']:[])])for(const viewport of [{width:667,height:375},{width:1440,height:810}]){
 const actor=kind==='opponent-red'?1:0;
 const hands:Record<number,string>={[actor]:'p0s123456789z167'};if(kind.startsWith('red-pon'))hands[1]='p55p123s123456z12';
 const game=kind==='north'?northScene():physicalEngine(variant,hands,'p4',actor);let version=1;
 const room=():RoomView=>({id:'sheen-flight-native',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:0,game:game.view(0),members:game.view(0).players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))});
 const desired=kind==='own-dora'?(variant==='sanma'?'z6':'z7'):kind==='own-matte'?'z1':kind==='north'?'z4':'p0';const g=game.view(actor),choice=g.choices.find(c=>c.type===(kind==='north'?'nuki':'discard')&&(kind==='north'||c.value===desired));assert(choice);
 const context=await browser.newContext({viewport,hasTouch:true}),page=await context.newPage(),commands:any[]=[],errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.exposeFunction('respond',(c:any)=>commands.push(c));
 await page.route('http://sheen-flight.local/**',route=>{const p=new URL(route.request().url()).pathname;if(p.startsWith('/fonts/')||p.startsWith('/images/'))return route.fulfill({body:readFileSync('public'+p),contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp'});return route.fulfill({contentType:'text/html',body:`<style>*{box-sizing:border-box}body{margin:0}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};localStorage.setItem('yougui.mahjong.confirmClick','1');${bundle}</script>`});});
 try{
  await page.goto('http://sheen-flight.local/');await page.evaluate(r=>(window as any).api.render(r),room());await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth>0));await page.waitForTimeout(270);
  let intent:any=null;
  let sourcePhase:any=null;
  if(actor===0&&kind==='north'){
   const hand=page.locator('.mahjong-hand [data-tile-face="z4"]').first();await page.waitForTimeout(650);
   sourcePhase=await hand.evaluate(e=>{const a=e.getAnimations({subtree:true}).find(a=>(a as CSSAnimation).animationName==='mahjong-dora-sheen');if(!a)throw Error('indicated north source glows');return {elapsed:a.currentTime,capturedAt:performance.now()};});
   await page.getByRole('button',{name:'拔北',exact:true}).click();assert.equal(commands.length,1);
  }else if(actor===0){const hand=page.locator('.mahjong-hand button[data-choice-id='+JSON.stringify(choice.id)+']').first();if(kind!=='own-matte')await hand.evaluate(e=>{const a=e.getAnimations({subtree:true}).find(a=>(a as CSSAnimation).animationName==='mahjong-dora-sheen');if(!a)throw Error('real glowing source');a.pause();a.currentTime=900;});await hand.tap();assert.equal(commands.length,0);await hand.tap();assert.equal(commands.length,1);assert.equal(commands[0].id,choice.id);intent=await page.evaluate(()=>(window as any).lastIntent);assert(intent);sourcePhase=intent.sourceSheen;}
  game.respond(actor,g.decisionId,choice.id);version++;
  const inspect=async(r:RoomView,testId:string)=>page.evaluate(async({r,testId})=>{(window as any).api.render(r);for(let i=0;i<12;i++){await new Promise(requestAnimationFrame);const flight=document.querySelector<HTMLElement>('[data-testid="'+testId+'"]');if(!flight)continue;const move=flight.getAnimations()[0];if(!move)throw Error('native flight animation');move.pause();move.currentTime=110;const face=flight.querySelector<HTMLElement>('[data-tile-face]')!;const style=getComputedStyle(face,'::before');const sheen=face.getAnimations({subtree:true}).find(a=>(a as CSSAnimation).animationName==='mahjong-dora-sheen');return {tile:face.dataset.tileFace,content:style.content,animation:style.animationName,sheenTime:sheen?.currentTime,at:performance.now(),event:flight.dataset.motionEvent,source:flight.dataset.motionSource,backContent:flight.querySelector('[data-flight-face="back"]')?getComputedStyle(flight.querySelector('[data-flight-face="back"]')!,'::before').content:null};}throw Error('actual flight missing');},{r,testId});
  const flightId=kind==='north'?'mahjong-nuki-flight':'mahjong-discard-flight';const flight=await inspect(room(),flightId);assert.equal(flight.content!=='none',kind!=='own-matte','only actual travelling dora keeps sheen');assert.equal(flight.animation,kind==='own-matte'?'none':'mahjong-dora-sheen');assert.equal(flight.tile,desired);if(actor!==0)assert.equal(flight.backContent,'none');
  if(actor===0&&kind!=='own-matte'){assert(sourcePhase);assert(Math.abs(Number(flight.sheenTime)-sourcePhase.elapsed-(flight.at-sourcePhase.capturedAt))<45,'source phase continues during flight');}
  await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${kind}.png`});
  if(kind!=='red-pon-overlap'){
   await page.evaluate(flightId=>{const node=document.querySelector('[data-testid="'+flightId+'"]')!;const move=node.getAnimations()[0];move.currentTime=229;move.play();},flightId);await page.getByTestId(flightId).waitFor({state:'detached'});
  }
  const target=page.locator((kind==='north'?'.mahjong-nuki-tray':'.mahjong-river')+' [data-tile-face='+JSON.stringify(desired)+']').first();assert.equal((await target.evaluate(e=>getComputedStyle(e,'::before').content))!=='none',kind!=='own-matte');
  const landed=await target.evaluate(e=>{const a=e.getAnimations({subtree:true}).find(a=>(a as CSSAnimation).animationName==='mahjong-dora-sheen');return {elapsed:a?.currentTime,capturedAt:performance.now()};});
  if(sourcePhase)assert(Math.abs(Number(landed.elapsed)-sourcePhase.elapsed-(landed.capturedAt-sourcePhase.capturedAt))<45,'destination continues the same source phase after landing');
  let call:any=null;
  if(kind.startsWith('red-pon')){
   const select=(seat:number,type:string)=>{const g=game.view(seat),c=g.choices.find(c=>c.type===type);assert(c);game.respond(seat,g.decisionId,c.id);version++;};select(1,'pon');
   for(let i=0;i<8&&!game.view(0).players[1].melds.length;i++){const seat=game.view(0).players.map(p=>p.seat).find(s=>game.view(s).choices.some(c=>c.type==='pass'));assert(seat!==undefined);select(seat,'pass');}
   call=await inspect(room(),'mahjong-call-flight');assert.equal(call.tile,'p0');assert.notEqual(call.content,'none');assert.equal(call.animation,'mahjong-dora-sheen');assert(Math.abs(Number(call.sheenTime)-Number(landed.elapsed)-(call.at-landed.capturedAt))<45,'called red tile keeps its previous river phase even before discard landing');assert.equal(await page.getByTestId('mahjong-discard-flight').count(),0);
   await page.evaluate(r=>(window as any).api.render(r,false),room());assert.equal(await page.getByTestId('mahjong-call-flight').count(),0);
  }else{await page.evaluate(r=>(window as any).api.render(r,false),room());assert.equal(await page.getByTestId('mahjong-discard-flight').count(),0);}
  assert.deepEqual(errors,[]);results.push({engine:engine.name(),variant,viewport,kind,flight,call,actualIntent:intent,sourcePhase,landed,commands:commands.length});console.log('PASS',engine.name(),variant,viewport.width,kind);
 }catch(e){await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${kind}-failure.png`});throw e;}finally{await context.close();}
}}finally{await browser.close();}}
assert.equal(results.length,52);assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,results},null,2));console.log('PASS52 native source-flight-target sheen continuity',out);
