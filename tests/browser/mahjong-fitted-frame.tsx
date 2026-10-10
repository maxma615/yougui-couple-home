// Native geometry proof: centered integer frame, letterbox hit isolation and
// dialogs. Synthetic game state; not Android/GPU or production socket proof.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {RoomView} from '../../src/modules/mahjong/types';
const out=`.local/audit/fitted-frame-browser-${Date.now()}`;mkdirSync(out,{recursive:true});
const css=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>readFileSync(`src/app/mahjong/${m[1]}`,'utf8')).join('\n');
const harness=`import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';window.renderTable=room=>flushSync(()=>createRoot(document.getElementById('root')).render(<main className="mahjong-page"><button id="behind">页面导航</button><div className="mahjong-shell"><GameRoom room={room} ownSeat={0} host connected busy={false} motionCanAnimate={false} onChoice={()=>{}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/></div></main>));`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,metafile:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
writeFileSync(`${out}/manifest.json`,JSON.stringify({css:sha(css),bundle:sha(bundle.outputFiles[0].text),sources:Object.keys(bundle.metafile!.inputs).filter(f=>!f.startsWith('<')).map(file=>({file,sha:sha(readFileSync(file))})),test:sha(readFileSync('tests/browser/mahjong-fitted-frame.tsx'))},null,2));
const cases=[{w:1440,h:810,touch:false,lw:1440,lh:810},{w:1920,h:1200,touch:false,lw:1920,lh:1080},{w:768,h:1024,touch:false,lw:768,lh:432},{w:1024,h:768,touch:true,lw:1024,lh:576}];
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const c of cases){
  const game=physicalEngine('yonma',{0:'p123456789s124z2'},'s2');const view=game.view(0);
  const room:RoomView={id:'frame',code:'ABCDEFGH',hostUserId:'0',variant:'yonma',mode:'east',status:'playing',version:1,mySeat:0,game:view,members:view.players.map(p=>({userId:String(p.seat),seat:p.seat,displayName:['甲','乙','丙','丁'][p.seat],kind:'human',ready:true,connected:true}))};
  const context=await browser.newContext({viewport:{width:c.w,height:c.h},hasTouch:c.touch});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const path of ['images','fonts'])await page.route(`https://mahjong.local/${path}/**`,r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync('public'+p)});});
  await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*:before,*:after{box-sizing:border-box}#behind{position:fixed;inset:0;width:100%;height:100%}${css}</style><div id="root"></div>`);
  await page.addScriptTag({content:`globalThis.process={env:{NODE_ENV:'development'}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});\n${bundle.outputFiles[0].text}`});
  await page.evaluate(r=>(window as any).renderTable(r),room);
  const table=page.locator('.mahjong-game[data-table-fitted="true"]');await table.waitFor();const box=(await table.boundingBox())!;
  assert.ok(Math.abs(box.x-(c.w-c.lw)/2)<1&&Math.abs(box.y-(c.h-c.lh)/2)<1&&Math.abs(box.width-c.lw)<1&&Math.abs(box.height-c.lh)<1,JSON.stringify(box));
  assert.equal(await page.locator('.mahjong-portrait-gate').count(),0);
  const tiles=page.locator('.mahjong-hand button[data-choice-id]');assert.equal(await tiles.count(),view.hand.length);
  for(const tile of await tiles.all()){const b=(await tile.boundingBox())!;assert.ok(b.x>=box.x-1&&b.y>=box.y-1&&b.x+b.width<=box.x+box.width+1&&b.y+b.height<=box.y+box.height+1,JSON.stringify({c,b,box}));}
  if(box.y>1)assert.notEqual(await page.evaluate(()=>document.elementFromPoint(5,5)?.id),'behind');
  await page.getByRole('button',{name:'更换桌布'}).click();const dialog=page.getByRole('dialog',{name:'桌布',exact:true});await dialog.waitFor();const modal=(await dialog.boundingBox())!;
  assert.ok(modal.x>=box.x-1&&modal.y>=box.y-1&&modal.x+modal.width<=box.x+box.width+1&&modal.y+modal.height<=box.y+box.height+1,JSON.stringify({modal,box}));
  await dialog.getByRole('button',{name:'完成',exact:true}).click();await page.screenshot({path:`${out}/${engine.name()}-${c.w}-${c.h}.png`});assert.deepEqual(errors,[]);
  results.push({browser:engine.name(),...c,box,modal});writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));await context.close();console.log(`PASS ${engine.name()} ${c.w}x${c.h} frame, rack, margin and modal`);
 }}finally{await browser.close();}
}
console.log(`PASS ${results.length} fitted frame scenes ${out}`);
