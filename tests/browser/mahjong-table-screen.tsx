// Real mounted GameRoom and viewport/media changes. Fullscreen/orientation API
// outcomes are controlled boundary stubs; this is not Android hardware proof.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {RoomView} from '../../src/modules/mahjong/types';
const out=`.local/audit/table-screen-browser-${Date.now()}`;mkdirSync(out,{recursive:true});
const css=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>readFileSync(`src/app/mahjong/${m[1]}`,'utf8')).join('\n');
const harness=`import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.screenChoices=[];window.screenProbe={render:room=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={0} host connected busy={false} motionCanAnimate={false} onChoice={choice=>window.screenChoices.push(choice)} onFinish={()=>flushSync(()=>root.render(<p>已解散</p>))} onLeave={()=>{}} onRematch={()=>{}}/></div></main>)),dispose:()=>root.unmount()};`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,metafile:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
writeFileSync(`${out}/manifest.json`,JSON.stringify({css:sha(css),bundle:sha(bundle.outputFiles[0].text),sources:Object.keys(bundle.metafile!.inputs).filter(f=>!f.startsWith('<')).map(file=>({file,sha:sha(readFileSync(file))})),test:sha(readFileSync('tests/browser/mahjong-table-screen.tsx')),scope:'Real React, native game view, actual portrait/landscape viewport and media; mocked browser fullscreen and lock boundaries'},null,2));
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const width of [375,390])for(const variant of ['sanma','yonma'] as const){
  const game=physicalEngine(variant,{0:'p123456789s124z2'},'s2');const view=game.view(0);
  const room:RoomView={id:'screen',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version:1,mySeat:0,game:view,members:view.players.map(p=>({userId:String(p.seat),seat:p.seat,displayName:['甲','乙','丙','丁'][p.seat],kind:'human',ready:true,connected:true}))};
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const path of ['images','fonts'])await page.route(`https://mahjong.local/${path}/**`,r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync('public'+p)});});
  await page.setContent(`<base href="https://mahjong.local/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*:before,*:after{box-sizing:border-box}${css}</style><div id="root"></div>`);
  await page.addScriptTag({content:`globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});`});
  await page.evaluate(()=>{
   const probe=(window as any).screenBoundary={full:null as Element|null,requests:0,exits:0,locks:0,unlocks:0};
   Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>probe.full});
   Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:async()=>{probe.requests++;probe.full=document.documentElement;document.dispatchEvent(new Event('fullscreenchange'));}});
   Object.defineProperty(document,'exitFullscreen',{configurable:true,value:async()=>{probe.exits++;probe.full=null;document.dispatchEvent(new Event('fullscreenchange'));}});
   const orientation=screen.orientation??new EventTarget();Object.defineProperty(screen,'orientation',{configurable:true,value:orientation});
   Object.defineProperty(orientation,'lock',{configurable:true,value:async()=>{probe.locks++;throw new Error('unsupported boundary');}});
   Object.defineProperty(orientation,'unlock',{configurable:true,value:()=>{probe.unlocks++;}});
  });
  await page.addScriptTag({content:`globalThis.process={env:{NODE_ENV:'development'}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});\n${bundle.outputFiles[0].text}`});
  await page.evaluate(r=>(window as any).screenProbe.render(r),room);
  const gate=page.getByRole('complementary',{name:'请横屏打牌'});
  const table=page.locator('.mahjong-game');await table.locator(':scope[data-table-rotated="true"]').waitFor();
  assert.equal(await gate.count(),0);
  const frame=(await table.boundingBox())!;assert.ok(Math.abs(frame.x)<1&&Math.abs(frame.y)<1&&Math.abs(frame.width-width)<1&&Math.abs(frame.height-844)<1,JSON.stringify(frame));
  const tile=page.locator('.mahjong-hand button[data-choice-id]:enabled').nth(5);
  const id=await tile.getAttribute('data-choice-id');await tile.tap();
  assert.equal(await page.evaluate(()=>(window as any).screenChoices.length),0);await tile.tap();
  assert.equal(await page.evaluate(()=>(window as any).screenChoices[0]?.id),id);
  await page.screenshot({path:`${out}/${engine.name()}-${variant}-${width}-portrait.png`});
  await page.getByRole('button',{name:'更换桌布'}).tap();
  const clothDialog=page.getByRole('dialog',{name:'桌布',exact:true});await clothDialog.waitFor();
  const modal=(await clothDialog.boundingBox())!;assert.ok(modal.x>=-.5&&modal.y>=-.5&&modal.x+modal.width<=width+.5&&modal.y+modal.height<=844+.5,JSON.stringify(modal));
  await clothDialog.locator('button[data-tablecloth="graphite"]').tap();assert.equal(await table.getAttribute('data-tablecloth'),'graphite');
  await clothDialog.getByRole('button',{name:'完成',exact:true}).tap();assert.equal(await clothDialog.count(),0);

  await page.getByRole('button',{name:'全屏横屏',exact:true}).tap();
  await page.waitForFunction(()=>(window as any).screenBoundary.locks===1);
  assert.equal(await table.getAttribute('data-table-rotated'),'true');assert.equal(await gate.count(),0);
  await page.setViewportSize({width:844,height:width});await page.waitForFunction(()=>!document.querySelector('[data-table-rotated="true"]'));
  await page.waitForFunction(()=>!document.querySelector('[aria-label="屏幕方向提示"]'));
  assert.equal(await page.getByTestId('mahjong-hand').locator('[data-tile-face]').count(),view.hand.length);
  // Unsupported lock while already landscape must leave the normal table clear.
  await page.getByRole('button',{name:'全屏横屏',exact:true}).tap();
  await page.waitForFunction(()=>(window as any).screenBoundary.locks===2);
  assert.equal(await page.locator('[aria-label="屏幕方向提示"]').count(),0);
  await page.screenshot({path:`${out}/${engine.name()}-${variant}-${width}-landscape.png`});
  // Return to portrait: the old failed-attempt warning does not reappear.
  await page.setViewportSize({width,height:844});await page.waitForFunction(()=>document.querySelector('[data-table-rotated="true"]'));
  assert.equal(await gate.getByText('当前浏览器无法自动横屏，请旋转手机后继续。',{exact:true}).count(),0);
  await page.getByRole('button',{name:'结束并解散牌桌'}).tap();await page.getByText('已解散',{exact:true}).waitFor();
  const boundary=await page.evaluate(()=>(window as any).screenBoundary);assert.equal(boundary.requests,1);assert.equal(boundary.exits,1);assert.equal(boundary.full,null);assert.deepEqual(errors,[]);
  results.push({browser:engine.name(),variant,width,handCount:view.hand.length,requests:boundary.requests,exits:boundary.exits,locks:boundary.locks});writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
  await context.close();console.log(`PASS ${engine.name()} ${width}: portrait fallback + two taps → unsupported native lock → natural landscape → rotated return → table exit`);
 }}finally{await browser.close();}
}
console.log(`PASS ${results.length} actual viewport / mounted table cases in ${out}`);
