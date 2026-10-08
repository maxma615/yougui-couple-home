import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {RoomView} from '../../src/modules/mahjong/types';
const out='.local/audit/hand-hover-browser-'+Date.now();mkdirSync(out,{recursive:true});
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['tests/browser/mahjong-hand-hover.tsx','src/components/mahjong/use-hand-hover.ts','src/components/mahjong/mahjong-client.tsx','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts','tests/fixtures/mahjong-settlement-game.ts',...cssFiles];
const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.renderRoom=(room,opts={})=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={room.mySeat} connected={opts.connected??true} host={false} busy={opts.busy??false} motionCanAnimate onChoice={(c,intent)=>window.respond(c,intent)} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/></div></main>));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text;
const results:any[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const kind of ['desktop','touch','two-click','interrupted','riichi']){
  const game=physicalEngine(variant,{0:kind==='riichi'?'p123456789s123z2':'p123456789s124z2'},kind==='riichi'?'z3':'s2');
  const room:RoomView={id:'hand-hover-native',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version:1,mySeat:0,game:game.view(0),members:game.view(0).players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))};
  const commands:any[]=[],errors:string[]=[];
  const context=await browser.newContext({viewport,hasTouch:kind==='touch'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  if(kind==='two-click')await context.addInitScript(()=>localStorage.setItem('yougui.mahjong.confirmClick','1'));
  await page.route('http://hand-hover.local/**',route=>{const p=new URL(route.request().url()).pathname;if(p.startsWith('/fonts/')||p.startsWith('/images/'))return route.fulfill({body:readFileSync('public'+p),contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp'});return route.fulfill({contentType:'text/html',body:`<style>*{box-sizing:border-box}body{margin:0}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`});});
  await page.exposeFunction('respond',(choice:any,intent:any)=>{
   const g=game.view(0);assert(g.choices.some(c=>c.id===choice.id),'native offered choice');assert.equal(commands.length,0);
   assert(intent&&intent.choiceId===choice.id&&intent.decisionId===g.decisionId&&intent.sourceRect.width>0&&intent.sourceTileId);
   game.respond(0,g.decisionId,choice.id);commands.push({choice,intent});
  });
  try{
   await page.goto('http://hand-hover.local/');await page.evaluate(r=>(window as any).renderRoom(r),room);await page.getByTestId('mahjong-board').waitFor();await page.evaluate(()=>document.fonts.ready);
   if(kind==='riichi')await page.getByRole('button',{name:'立直',exact:true}).click();
   const tile=page.locator('.mahjong-hand button[data-choice-id]:enabled').first();await tile.waitFor();const id=await tile.getAttribute('data-choice-id');
   if(kind==='touch'){
    await tile.tap();assert.equal(commands.length,0,'first touch only selects');assert.equal(await tile.getAttribute('aria-pressed'),'true');await tile.tap();
   }else if(kind==='two-click'){
    await tile.hover();await page.waitForTimeout(30);assert.equal(await tile.getAttribute('aria-pressed'),'false');await tile.click();assert.equal(commands.length,0,'first desktop click only selects in configured mode');await tile.click();
   }else{
    await tile.hover();await page.waitForFunction(()=>document.querySelector('.mahjong-hand button.is-selected')!==null);assert.equal(commands.length,0,'hover never submits');
    if(kind==='interrupted'){
     await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await tile.getAttribute('aria-pressed'),'false');await page.mouse.move(1,1);await tile.hover();await page.waitForFunction(()=>document.querySelector('.mahjong-hand button.is-selected')!==null);
    }
    await tile.click();
   }
   await page.waitForFunction(()=>document.querySelector('.mahjong-hand button.is-selected')===null);for(let i=0;i<100&&!commands.length;i++)await page.waitForTimeout(20);
   assert.equal(commands.length,1);assert.equal(commands[0].choice.id,id);assert.equal(commands[0].choice.type,kind==='riichi'?'riichi':'discard');assert.deepEqual(errors,[]);
   await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${kind}.png`});results.push({engine:engine.name(),variant,viewport,kind,commands});console.log('PASS',engine.name(),variant,viewport.width,kind);
  }catch(error){await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${kind}-failure.png`});writeFileSync(out+'/failure.json',JSON.stringify({error:String(error),commands,errors},null,2));throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}
assert.equal(results.length,40);assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS 40 native hand-hover scenes',out);
