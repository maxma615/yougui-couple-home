// Native fresh-page input and projected/compositor geometry regression.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium, webkit, type Page} from '@playwright/test';
import Majiang from '@kobalab/majiang-core';
import {RiichiGame} from '../../src/modules/mahjong/engine';
import {SanmaGame} from '../../src/modules/mahjong/sanma';
import {SanmaWall, sanmaTiles} from '../../src/modules/mahjong/sanma-wall';
import {northReplacementFixture} from '../fixtures/mahjong-view-game';
import {projectedSampleScript} from './projected-samples';
import type {RoomView} from '../../src/modules/mahjong/types';

const out = `.local/audit/drag-threshold-${Date.now()}`;
mkdirSync(out, {recursive: true});
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const cssFiles = [...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>m[1]);
const sourceFiles = ['public/fonts/mahjong-brush.woff2','tests/browser/mahjong-drag-threshold.tsx','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts','tests/fixtures/mahjong-view-game.ts','src/components/mahjong/mahjong-client.tsx', ...cssFiles.map(f => 'src/app/mahjong/'+f)];
const sources = Object.fromEntries(sourceFiles.map(f => [f, sha(readFileSync(f))]));
const css = cssFiles.map(f => readFileSync('src/app/mahjong/'+f,'utf8')).join('\n');
const harness = `import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.choices=[];window.renderRoom=(room,opts={})=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,ownSeat:room.mySeat,host:true,busy:opts.busy??false,connected:opts.connected??true,motionCanAnimate:false,onChoice:(choice,intent)=>window.choices.push({choice,intent}),onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))));`;
const bundle = (await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text;
writeFileSync(out+'/bundle.js',bundle); writeFileSync(out+'/style.css',css);
const names = ['甲','乙','丙','丁'];
function room(game: RiichiGame | SanmaGame, viewer = 0, version = 1): RoomView {
  const gameView = structuredClone(game.view(viewer));
  return {id:'seat-drag-real-engine',code:'ABCDEFGH',hostUserId:'user-0',mode:'east',variant:gameView.players.length===3?'sanma':'yonma',status:'playing',version,mySeat:viewer,game:gameView,members:names.slice(0,gameView.players.length).map((displayName,seat)=>({userId:'user-'+seat,displayName,seat,kind:'human',ready:true,connected:true}))};
}
// Identical physical deal to retained seat-drag audit; no hand DTO mutation.
function ordinaryGame() {
  return new RiichiGame('east',names,{dealer:0,wallFactory:rule=>{
    const wall=new Majiang.Shan(rule),available=wall._pai.slice();
    const take=(tile:string)=>{const i=available.indexOf(tile);assert.ok(i>=0,`physical tile ${tile}`);return available.splice(i,1)[0];};
    const hand=[...'z777p123s123m19z12'.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>take(m[1]+n)));
    const draw=take('z7'),hands=[hand,...[1,2,3].map(()=>available.splice(0,13))];
    wall._pai=[...available,...[...hands.flat(),draw].reverse()];wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];return wall;
  }});
}
async function mount(page: Page, r: RoomView) {
  await page.route('https://mahjong.local/fonts/**',route=>route.fulfill({body:readFileSync('public'+new URL(route.request().url()).pathname),contentType:'font/woff2'}));
  await page.route('https://mahjong.local/images/**',route=>route.fulfill({body:readFileSync('public'+new URL(route.request().url()).pathname),contentType:route.request().url().endsWith('.svg')?'image/svg+xml':'image/webp'}));
  await page.setContent(`<base href="https://mahjong.local/"><style>*{box-sizing:border-box}body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}${css}</style><div id="root"></div>`);
  await page.addScriptTag({content:`globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}\n${projectedSampleScript}`});
  await page.evaluate(r=>(window as any).renderRoom(r),r);
  await page.evaluate(()=>window.addEventListener('pointermove',event=>{(window as any).lastPointerPosition={x:event.clientX,y:event.clientY};},true));
  await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth===300));
  await page.evaluate(()=>document.fonts.ready);
}

const records: any[]=[];
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 try {
  for(const viewport of [{width:667,height:375},{width:844,height:390},{width:1440,height:810}]) {
   for(const [dx,dy,dragged] of [[12,0,false],[19,0,false],[20,0,false],[21,0,true],[12,-16,false],[12,-17,true]] as const) {
    const page=await browser.newPage({viewport}),errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    try {
     const r=room(ordinaryGame());await mount(page,r);
     await page.locator('details.mahjong-automatic > summary').click();
     await page.getByRole('button',{name:/桌面二次点击出牌/}).click();
     await page.locator('details.mahjong-automatic > summary').click();
     const tile=page.locator('.mahjong-hand > button:not([disabled])').nth(5);
     const box=(await tile.boundingBox())!;assert.ok(box);
     const choiceId=await tile.getAttribute('data-choice-id');
     const start={x:Math.floor(box.x+box.width/2),y:Math.floor(box.y+box.height/2)};
     await page.mouse.move(start.x,start.y);await page.waitForTimeout(30);
     assert.equal(await tile.getAttribute('aria-pressed'),'false');
     await page.mouse.down();await page.mouse.move(start.x+dx,start.y+dy);await page.waitForTimeout(30);
     assert.equal(await tile.evaluate(e=>e.classList.contains('is-dragging')),dragged,`native (${dx},${dy})`);
     assert.equal(await page.evaluate(()=>(window as any).choices.length),0,'no command while held');
     if(dragged) {
      const rackTop=await page.locator('.mahjong-hand').evaluate(e=>e.getBoundingClientRect().top);
      await page.mouse.move(start.x,rackTop-box.height-20,{steps:8});
      assert.equal(await page.locator('[data-testid="mahjong-board"]').evaluate(e=>e.classList.contains('is-discard-target')),true);
     }
     await page.mouse.up();await page.waitForTimeout(30);
     const choices=await page.evaluate(()=>(window as any).choices);
     assert.equal(choices.length,dragged?1:0);
     if(dragged)assert.equal(choices[0].choice.id,choiceId);
     assert.equal(await page.locator('.is-dragging').count(),0);
     assert.deepEqual(errors,[]);
     records.push({engine:engine.name(),viewport,dx,dy,dragged,commands:choices.length,pass:true});
    } finally {await page.close();}
   }
  }
 } finally {await browser.close();}
}
writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleHash:sha(bundle),cssHash:sha(css),records},null,2));
assert.equal(records.length,36);console.log(JSON.stringify({out,scenes:records.length,allPassed:true}));
