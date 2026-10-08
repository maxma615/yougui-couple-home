import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import Majiang from '@kobalab/majiang-core';
import {RiichiGame} from '../../src/modules/mahjong/engine';
import {SanmaGame} from '../../src/modules/mahjong/sanma';
import {SanmaWall,sanmaTiles} from '../../src/modules/mahjong/sanma-wall';
import type {GameVariant,RoomView} from '../../src/modules/mahjong/types';
const out=`.local/audit/yakuman-opportunity-${Date.now()}`;mkdirSync(out);
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);const css=cssFiles.map(f=>readFileSync(f,'utf8')).join('\n');
const files=['src/components/mahjong/discard-waits.ts','src/components/mahjong/mahjong-yakuman-opportunity.tsx','src/components/mahjong/mahjong-client.tsx','src/app/mahjong/page.tsx','tests/browser/mahjong-yakuman-opportunity.tsx','public/fonts/mahjong-brush.woff2',...cssFiles];
const sourceHashes=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.calls=[];window.show=(room,canAnimate=true)=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,ownSeat:room.mySeat,host:false,busy:false,connected:true,motionCanAnimate:canAnimate,onChoice:c=>window.calls.push(c),onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
function fixture(variant:GameVariant,pattern:'certain'|'possible'|'low'){
 const pool=(variant==='sanma'?sanmaTiles():new Majiang.Shan(Majiang.rule())._pai).slice().sort(),original=pool.slice();
 const take=(tile:string)=>{const i=pool.indexOf(tile);assert(i>=0);return pool.splice(i,1)[0]};
 const shape=pattern==='certain'?'m19p19s19z1234567':pattern==='possible'?'p111222333s11z55':'p123456789s123z1';
 const hands=Array.from({length:variant==='sanma'?3:4},()=>[] as string[]);hands[0]=[...shape.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>take(m[1]+n)));const draw=take('z7');for(const h of hands)if(!h.length)h.push(...pool.splice(0,13));
 let game:RiichiGame|SanmaGame;
 if(variant==='sanma'){const reserve=pool.splice(0,4),indicators=pool.splice(-10),physical=[...hands.flat(),draw,...pool,...reserve,...indicators];assert.deepEqual(physical.slice().sort(),original);game=new SanmaGame('east',['A','B','C'],{dealer:0,wallFactory:()=>new SanmaWall(physical)});}
 else{const wall=new Majiang.Shan(Majiang.rule());wall._pai=[...pool,...[...hands.flat(),draw].reverse()];assert.deepEqual(wall._pai.slice().sort(),original);wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];game=new RiichiGame('east',['A','B','C','D'],{dealer:0,wallFactory:()=>wall});}
 const room=():RoomView=>({id:`value-${variant}-${pattern}`,code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version:1,mySeat:0,game:game.view(0),members:hands.map((_,seat)=>({seat,userId:String(seat),displayName:String(seat),kind:'human',ready:true,connected:true}))});return {game,room};
}
const results:any[]=[];
for(const engine of [chromium,webkit]){const browser=await engine.launch();try{for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const pattern of ['certain','possible','low'] as const){
 const context=await browser.newContext({viewport});try{const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://value.local/images/**',r=>r.fulfill({body:readFileSync('public'+new URL(r.request().url()).pathname),contentType:new URL(r.request().url()).pathname.endsWith('.svg')?'image/svg+xml':'image/webp'}));await page.route('https://value.local/fonts/**',r=>r.fulfill({body:readFileSync('public'+new URL(r.request().url()).pathname),contentType:'font/woff2'}));await page.setContent(`<base href="https://value.local/"><style>body{margin:0}*,*::before,*::after{box-sizing:border-box}${css}</style><div id="root"></div>`);await page.addScriptTag({content:`globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle.outputFiles[0].text}`});const f=fixture(variant,pattern);await page.evaluate(r=>(window as any).show(r),f.room());assert.equal(await page.locator('[data-yakuman-event]').count(),0);
 const tile=page.locator('.mahjong-hand .is-drawn[data-choice-type="discard"]');await tile.click();await tile.click();const choice=await page.evaluate(()=>(window as any).calls[0]);assert(choice);const before=f.game.view(0);f.game.respond(0,before.decisionId,choice.id);for(let seat=1;seat<handsCount(variant);seat++){const view=f.game.view(seat),pass=view.choices.find(c=>c.type==='pass');if(pass)f.game.respond(seat,view.decisionId,pass.id);}const after=f.room();assert.equal(after.game!.hand.length,13);assert(!after.game!.settlement);
 const started=Date.now();await page.evaluate(r=>(window as any).show(r),after);let geometry:any=null;
 if(pattern!=='low'){
  const cue=page.getByRole('status',{name:pattern==='certain'?'役满确定':'役满机会'});await cue.waitFor();assert(Date.now()-started>=500,'cue must not reveal immediately');await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.fonts.check('36px "Yougui Mahjong Brush"','役满机会确定')));geometry=await cue.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),hand=document.querySelector('.mahjong-hand')!.getBoundingClientRect(),hit=document.elementFromPoint(hand.left+hand.width/2,hand.top+hand.height/2);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,font:s.fontFamily,pointer:s.pointerEvents,handHit:!!hit?.closest('.mahjong-hand')}});assert(geometry.left>=0&&geometry.right<=viewport.width&&geometry.top>=0&&geometry.bottom<=viewport.height);assert(geometry.font.includes('Yougui Mahjong Brush'));assert.equal(geometry.pointer,'none');assert(geometry.handHit);await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${pattern}.png`});await cue.waitFor({state:'detached'});assert(Date.now()-started>=3500);
 }else{await page.waitForTimeout(3700);assert.equal(await page.locator('[data-yakuman-event]').count(),0);}
 await page.evaluate(r=>(window as any).show(r),after);await page.waitForTimeout(700);assert.equal(await page.locator('[data-yakuman-event]').count(),0);
 // GET restoration of a high-value current hand is silent on first mount.
 await page.evaluate(r=>(window as any).show({...r,id:r.id+'-restore'},false),after);await page.evaluate(r=>(window as any).show({...r,id:r.id+'-restore'},true),after);await page.waitForTimeout(700);assert.equal(await page.locator('[data-yakuman-event]').count(),0);assert.equal(await page.evaluate(()=>(window as any).calls.length),1);assert.deepEqual(errors,[]);results.push({engine:engine.name(),variant,viewport,pattern,geometry,choiceId:choice.id});console.log('PASS',engine.name(),variant,viewport.width,pattern);
 }finally{await context.close()}}
 }finally{await browser.close()}}
function handsCount(v:GameVariant){return v==='sanma'?3:4}
assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sourceHashes,'tested source must remain frozen throughout the run');writeFileSync(out+'/summary.json',JSON.stringify({results,files:sourceHashes,bundleSha256:sha(bundle.outputFiles[0].text)},null,2));console.log(`PASS ${results.length} native high-value browser scenes ${out}`);
