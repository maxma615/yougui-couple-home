import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {RoomView} from '../../src/modules/mahjong/types';
const out='.local/audit/touch-drag-browser-'+Date.now();mkdirSync(out,{recursive:true});
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['src/components/mahjong/hand-rack.ts','src/components/mahjong/use-opening-sort.ts','tests/browser/mahjong-touch-drag.tsx','src/components/mahjong/use-hand-hover.ts','src/components/mahjong/mahjong-client.tsx','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts','tests/fixtures/mahjong-settlement-game.ts',...cssFiles];
const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.renderRoom=(room,opts={})=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={room.mySeat} connected={opts.connected??true} host={false} busy={opts.busy??false} motionCanAnimate onChoice={(c,intent)=>window.respond(c,intent)} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/></div></main>));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text;

const results:any[]=[];const browser=await chromium.launch();
try {
 for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:844,height:390},{width:915,height:412}])for(const kind of ['valid','dragBack','smallMove','exactBoundary','cancel','disconnected']) {
  const game=physicalEngine(variant,{0:'p123456789s124z2'},'s2');
  const room:RoomView={id:'touch-drag-native',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version:1,mySeat:0,game:game.view(0),members:game.view(0).players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))};
  const commands:any[]=[],errors:string[]=[];
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:viewport.width===844?3:2,userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://touch-drag.local/**',route=>{
   const p=new URL(route.request().url()).pathname;
   if(p.startsWith('/fonts/')||p.startsWith('/images/'))return route.fulfill({body:readFileSync('public'+p),contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp'});
   return route.fulfill({contentType:'text/html',body:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`});
  });
  await page.exposeFunction('respond',(choice:any,intent:any)=>{
   const g=game.view(0);assert(g.choices.some(c=>c.id===choice.id),'native offered choice');assert.equal(commands.length,0);
   assert(intent&&intent.choiceId===choice.id&&intent.decisionId===g.decisionId&&intent.sourceRect.width>0&&intent.sourceTileId);
   game.respond(0,g.decisionId,choice.id);commands.push({choice,intent});
  });
  try {
   await page.goto('http://touch-drag.local/');await page.evaluate(r=>(window as any).renderRoom(r),room);
   await page.evaluate(()=>{(window as any).nativeTouchEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,event=>{const e=event as PointerEvent;(window as any).nativeTouchEvents.push({type,trust:e.isTrusted,pointerType:e.pointerType,x:e.clientX,y:e.clientY});},true);});
   await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth>0));await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.evaluate(()=>innerWidth),viewport.width);
   assert.equal(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches),true);
   const offered=page.locator('.mahjong-hand button[data-choice-id]:enabled').nth(5),tileId=await offered.getAttribute('data-hand-instance-id');assert(tileId);
   const tile=page.locator('[data-hand-instance-id='+JSON.stringify(tileId)+']'),id=await tile.getAttribute('data-choice-id'),box=await tile.boundingBox();assert(box);
   assert.equal(await tile.evaluate(e=>getComputedStyle(e).touchAction),'none');
   const start={x:Math.floor(box.x+box.width/2),y:Math.floor(box.y+box.height/2)},rackTop=await page.locator('.mahjong-hand').evaluate(e=>e.getBoundingClientRect().top);
   const target=kind==='smallMove'?{x:start.x+12,y:start.y}:kind==='exactBoundary'?{x:start.x+20,y:start.y}:{x:start.x,y:rackTop-box.height-20};
   const cdp=await context.newCDPSession(page);
   const touch=async(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',p=start)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{...p,id:1,radiusX:4,radiusY:4,force:1}]});
   await touch('touchStart');await page.waitForTimeout(30);assert.equal(commands.length,0,'press alone never submits');
   await touch('touchMove',target);await page.waitForTimeout(30);
   assert.equal(await tile.evaluate(e=>e.classList.contains('is-dragging')),!['smallMove','exactBoundary'].includes(kind));
   if(kind==='dragBack')await touch('touchMove',start);
   if(kind==='disconnected')await page.evaluate(r=>(window as any).renderRoom(r,{connected:false}),room);
   await touch(kind==='cancel'?'touchCancel':'touchEnd');await page.waitForTimeout(100);
   assert.equal(commands.length,kind==='valid'?1:0,kind);
   if(kind==='valid')assert.equal(commands[0].choice.id,id);
   assert.equal(await page.locator('.is-dragging').count(),0);assert.equal(await page.locator('.is-discard-target').count(),0);
   const events=await page.evaluate(()=>(window as any).nativeTouchEvents);
   assert(events.length>=3&&events.every((e:any)=>e.trust&&e.pointerType==='touch'),'browser-native trusted touch events');
   if(kind==='cancel')assert(events.some((e:any)=>e.type==='pointercancel'));
   if(['dragBack','cancel','disconnected'].includes(kind)) {
    assert.equal(await tile.getAttribute('aria-pressed'),'false','cancelled touch has no leftover selected tile');
    if(kind==='disconnected')await page.evaluate(r=>(window as any).renderRoom(r,{connected:true}),room);
    await tile.tap();await page.waitForTimeout(30);assert.equal(commands.length,0,'fresh touch after cancellation only selects');
    assert.equal(await tile.getAttribute('aria-pressed'),'true');
    await tile.tap();await page.waitForFunction(()=>!document.querySelector('.mahjong-hand .is-selected'));assert.equal(commands.length,1,'second fresh touch alone confirms');
    assert.equal(commands[0].choice.id,id);
   }
   assert.deepEqual(errors,[]);
   await page.screenshot({path:out+`/${variant}-${viewport.width}-${kind}.png`});results.push({variant,viewport,kind,events,commands});console.log('PASS',variant,viewport.width,kind);
  } catch(error) {await page.screenshot({path:out+`/${variant}-${viewport.width}-${kind}-failure.png`});writeFileSync(out+'/failure.json',JSON.stringify({error:String(error),commands,errors},null,2));throw error;}finally{await context.close();}
 }
} finally {await browser.close();}
assert.equal(results.length,36);assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS 36 native touch drag scenes',out);
