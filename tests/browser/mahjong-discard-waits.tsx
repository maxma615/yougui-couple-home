import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import Majiang from '@kobalab/majiang-core';
import {RiichiGame} from '../../src/modules/mahjong/engine';
import {SanmaGame} from '../../src/modules/mahjong/sanma';
import {SanmaWall,sanmaTiles} from '../../src/modules/mahjong/sanma-wall';
import type {RoomView,GameVariant} from '../../src/modules/mahjong/types';
const out=`.local/audit/discard-waits-browser-${Date.now()}`;mkdirSync(out);
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const files=['src/components/mahjong/discard-waits.ts','src/components/mahjong/mahjong-client.tsx','tests/browser/mahjong-discard-waits.tsx'];
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const css=cssFiles.map(f=>readFileSync(f,'utf8')).join('\n');
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.calls=[];window.show=(room)=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,ownSeat:0,connected:true,motionCanAnimate:false,host:true,busy:false,onChoice:c=>window.calls.push(c),onRematch:()=>{},onFinish:()=>{},onLeave:()=>{}})))));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
writeFileSync(out+'/manifest.json',JSON.stringify({files:Object.fromEntries([...files,...cssFiles].map(f=>[f,sha(readFileSync(f))])),bundle:sha(bundle.outputFiles[0].text)},null,2));
type Pattern='ittsuu'|'no-yaku'|'orphans';
function fixture(variant:GameVariant,pattern:Pattern){
 const pool=(variant==='sanma'?sanmaTiles():new Majiang.Shan(Majiang.rule())._pai).slice().sort();
 const original=pool.slice();const take=(t:string)=>{const i=pool.indexOf(t);assert(i>=0);return pool.splice(i,1)[0]};
 const hands=Array.from({length:variant==='sanma'?3:4},()=>[] as string[]);const encoded=pattern==='ittsuu'?'p123456789s123z1':pattern==='no-yaku'?'p123s456789z2223':'m19p19s19z1234567';hands[0]=[...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>m[1]+n)).map(take);const draws=[pattern==='ittsuu'?'z1':pattern==='no-yaku'?'z3':'m1'].map(take);for(const h of hands)if(!h.length)h.push(...pool.splice(0,13));
 let game:RiichiGame|SanmaGame;
 if(variant==='sanma'){const replacements=pool.splice(0,4),indicators=pool.splice(-10);const physical=[...hands.flat(),...draws,...pool,...replacements,...indicators];assert.deepEqual(physical.slice().sort(),original);game=new SanmaGame('east',['A','B','C'],{dealer:0,wallFactory:()=>new SanmaWall(physical)})}
 else{const wall=new Majiang.Shan(Majiang.rule());wall._pai=[...pool,...[...hands.flat(),...draws].reverse()];assert.deepEqual(wall._pai.slice().sort(),original);wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];game=new RiichiGame('east',['A','B','C','D'],{dealer:0,wallFactory:()=>wall})}
 const room=():RoomView=>({id:'waits-'+variant,code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version:1,mySeat:0,game:game.view(0),members: hands.map((_,seat)=>({seat,userId:String(seat),displayName:String(seat),kind:'human',ready:true,connected:true}))});return {game,room};
}
const results:any[]=[];
for(const engine of [chromium,webkit]){const browser=await engine.launch();try{for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const touch of [true,false])for(const pattern of ['ittsuu','no-yaku','orphans'] as const){
 const context=await browser.newContext({viewport,hasTouch:touch});try{const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://waits.local/images/**',r=>r.fulfill({body:readFileSync('public'+new URL(r.request().url()).pathname),contentType:'image/svg+xml'}));await page.route('https://waits.local/fonts/**',r=>r.fulfill({body:readFileSync('public'+new URL(r.request().url()).pathname),contentType:'font/woff2'}));await page.setContent(`<base href="https://waits.local/"><style>body{margin:0}*,*::before,*::after{box-sizing:border-box}${css}</style><div id="root"></div>`);await page.addScriptTag({content:`globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle.outputFiles[0].text}`});
 const f=fixture(variant,pattern);await page.evaluate(r=>(window as any).show(r),f.room());const button=page.locator('.mahjong-hand .is-drawn[data-choice-type="discard"]');await button.click();const hint=page.getByRole('status',{name:'待牌预览'});await hint.waitFor();assert.equal(await hint.locator('.mahjong-tile').count(),pattern==='orphans'?13:1);const text=await hint.textContent();assert(text?.includes('振听'));assert.equal(text?.includes('无役'),pattern==='no-yaku');assert(text?.includes('2 张'));assert.equal(await page.evaluate(()=>(window as any).calls.length),0);
 const geometry=await hint.evaluate(el=>{const r=el.getBoundingClientRect(),hand=document.querySelector('.mahjong-hand')!.getBoundingClientRect(),button=document.querySelector('.mahjong-hand .is-drawn')!.getBoundingClientRect();const hit=document.elementFromPoint(button.left+button.width/2,button.top+button.height/2);return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,handTop:hand.top,hit:!!hit?.closest('.mahjong-hand')}});assert(geometry.left>=0&&geometry.right<=viewport.width);assert(geometry.top>=0&&geometry.bottom<=geometry.handTop);assert(geometry.hit);await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${touch}-${pattern}.png`});
 await button.click();const choice=await page.evaluate(()=>(window as any).calls[0]);assert(choice);f.game.respond(0,f.game.view(0).decisionId,choice.id);await page.evaluate(r=>(window as any).show(r),f.room());assert.equal(await page.getByRole('status',{name:'待牌预览'}).count(),0);assert.deepEqual(errors,[]);results.push({engine:engine.name(),variant,viewport,touch,pattern,geometry,choiceId:choice.id});
 }finally{await context.close()}}
 }finally{await browser.close()}}
writeFileSync(out+'/summary.json',JSON.stringify({results},null,2));console.log(`PASS ${results.length} native wait-preview browser cases ${out}`);
