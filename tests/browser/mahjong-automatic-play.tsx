import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {RoomView} from '../../src/modules/mahjong/types';
const out='.local/audit/automatic-browser-'+Date.now();mkdirSync(out,{recursive:true});
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['public/fonts/mahjong-brush.woff2','tests/browser/mahjong-automatic-play.tsx','tests/fixtures/mahjong-settlement-game.ts','src/components/mahjong/mahjong-client.tsx','src/components/mahjong/automatic-choice.ts','src/components/mahjong/use-automatic-play.ts','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts',...cssFiles];
const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.renderRoom=(room)=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={room.mySeat} connected host={false} busy={false} motionCanAnimate onChoice={(c,intent)=>window.respond(c,intent)} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/></div></main>));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text;
const results:any[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const kind of ['win','cut','calls','special',...(variant==='sanma'?['north']:[])]){
  const game=physicalEngine(variant,kind==='calls'?{0:'p789s234567z1234',1:'p11s123456789z23'}:{0:kind==='win'||kind==='special'?'p123456789s123z2':'p123456789s124z2'},kind==='calls'?'p1':kind==='win'?'z2':kind==='special'?'z3':kind==='north'?'z4':'s2');
  const seat=kind==='calls'?1:0;if(kind==='calls'){const g=game.view(0);game.respond(0,g.decisionId,g.choices.find(c=>c.value==='p1_')!.id);}
  let version=1;const commands:any[]=[],errors:string[]=[];
  const room=():RoomView=>({id:'auto-native',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:seat,game:game.view(seat),members:game.view(seat).players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))});
  const context=await browser.newContext({viewport}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://automatic.local/**',route=>{const p=new URL(route.request().url()).pathname;if(p.startsWith('/fonts/')||p.startsWith('/images/'))return route.fulfill({body:readFileSync('public'+p),contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp'});return route.fulfill({contentType:'text/html',body:`<style>*{box-sizing:border-box}body{margin:0}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`});});
  await page.exposeFunction('respond',async(choice:any,intent:any)=>{const g=game.view(seat);assert(g.choices.some(c=>c.id===choice.id),'native offered choice');if(choice.type==='discard'){assert(intent&&intent.choiceId===choice.id&&intent.sourceTileId.startsWith('drawn:')&&intent.decisionId===g.decisionId,'automated discard uses real tile flight geometry');}game.respond(seat,g.decisionId,choice.id);commands.push({...choice,decisionId:g.decisionId});version++;await page.evaluate(r=>(window as any).renderRoom(r),room());});
  try{
   await page.goto('http://automatic.local/');await page.evaluate(r=>(window as any).renderRoom(r),room());await page.getByTestId('mahjong-board').waitFor();await page.evaluate(()=>document.fonts.ready);await page.locator('.mahjong-automatic summary').click();
   assert.equal(await page.getByRole('button',{name:/^自动拔北\s*关$/}).count(),variant==='sanma'?1:0);
   const labels=['自动和牌','不鸣牌','自动摸切',...(variant==='sanma'?['自动拔北']:[])];
   for(const label of labels){const b=page.getByRole('button',{name:new RegExp('^'+label+'\\s*关$')});const box=await b.boundingBox();assert(box&&box.width>=44&&box.height>=44&&box.y>=0&&box.y+box.height<=viewport.height);}
   await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${kind}-menu.png`});
   const label=kind==='win'?'自动和牌':kind==='calls'?'不鸣牌':kind==='north'?'自动拔北':'自动摸切';await page.getByRole('button',{name:new RegExp('^'+label+'\\s*关$')}).click();
   if(kind==='special'){await page.waitForTimeout(900);assert.equal(commands.length,0);assert(game.view(seat).choices.some(c=>c.type==='riichi'));}
   else{await page.waitForFunction(()=>!(document.querySelector('.mahjong-automatic button[aria-pressed="true"]')===null));for(let i=0;i<100&&!commands.length;i++)await page.waitForTimeout(25);assert(kind==='north'?commands.length>=1&&commands.length<=4:commands.length===1);assert.equal(new Set(commands.map(c=>c.decisionId)).size,commands.length);assert.equal(commands[0].type,kind==='win'?'tsumo':kind==='calls'?'pass':kind==='north'?'nuki':'discard');if(kind==='cut')assert.equal(commands[0].value,'s2_');if(kind==='north')assert.equal(game.view(seat).players[seat].nuki,commands.length);if(kind==='win')assert.equal(game.view(seat).settlement?.winMethod,'tsumo');await page.waitForTimeout(100);assert(kind==='north'?commands.every(c=>c.type==='nuki'):commands.length===1);if(kind==='north')assert.equal(game.view(seat).players[seat].nuki,commands.length);}
   assert.deepEqual(errors,[]);results.push({engine:engine.name(),variant,viewport,kind,commands});console.log('PASS',engine.name(),variant,viewport.width,kind);
  }finally{await context.close();}
 }}finally{await browser.close();}
}
assert.equal(results.length,36);assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS 36 mounted native automatic scenes',out);
