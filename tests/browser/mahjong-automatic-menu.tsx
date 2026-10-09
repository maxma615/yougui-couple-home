import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
const out='.local/audit/automatic-menu-'+Date.now();mkdirSync(out);
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import \"\.\/(mahjong[^\"\n]*\.css)\";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['tests/browser/mahjong-automatic-menu.tsx','tests/fixtures/mahjong-settlement-game.ts','src/components/mahjong/mahjong-client.tsx','src/components/mahjong/use-automatic-play.ts','src/components/mahjong/tablecloth.tsx',...cssFiles];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));const sources=hashes();
const bundle = (await build({stdin: {contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.renderRoom=room=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={0} connected host={false} busy={false} motionCanAnimate onChoice={()=>window.commands++} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/></div></main>));window.commands=0;`, resolveDir: process.cwd(), loader: 'tsx'}, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"'}, plugins: []})).outputFiles[0].text;
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();try{for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}]){
  const game=physicalEngine(variant,{0:'p123456789s123z2'},'z2'),g=game.view(0);assert(g.choices.some(c=>c.type==='tsumo'));
  const room={id:'menu',code:'ABCDEFGH',hostUserId:'0',mode:'east',status:'playing',variant,version:1,mySeat:0,game:g,members:g.players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))};
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://menu.local/**',route=>{const p=new URL(route.request().url()).pathname;if(p.startsWith('/images/')||p.startsWith('/fonts/'))return route.fulfill({body:readFileSync('public'+p),contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp'});return route.fulfill({contentType:'text/html; charset=utf-8',body:`<meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`});});
  try{
   await page.goto('http://menu.local/');await page.evaluate(r=>(window as any).renderRoom(r),room);await page.evaluate(()=>document.fonts.ready);
   const menu=page.locator('.mahjong-automatic'),summary=menu.locator('summary'),isOpen=()=>menu.evaluate(e=>(e as HTMLDetailsElement).open);
   await summary.click();assert(await isOpen());await page.getByRole('button',{name:/^不鸣牌\s*关$/}).click();assert(await isOpen());
   await page.getByRole('button',{name:/^不鸣牌\s*开$/}).focus();await page.keyboard.press('Escape');assert.equal(await isOpen(),false);assert(await summary.evaluate(e=>document.activeElement===e));
   await summary.click();await page.locator('.mahjong-hand button[data-choice-id]').first().focus();assert.equal(await isOpen(),false,'focus outside dismisses the menu');
   await summary.click();await page.getByRole('button',{name:'更换桌布',exact:true}).click();assert.equal(await isOpen(),false,'native pointer outside dismisses the menu');await page.getByRole('dialog',{name:'桌布',exact:true}).waitFor();await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>(window as any).commands),0);await page.getByRole('button',{name:'自摸',exact:true}).click();assert.equal(await page.evaluate(()=>(window as any).commands),1,'the native manual win stays reachable after dismissal');assert.deepEqual(errors,[]);
   await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}.png`});results.push({engine:engine.name(),variant,viewport,escape:true,focus:true,pointer:true,manualWin:1});console.log('PASS',engine.name(),variant,viewport.width,'menu keyboard/focus/pointer and native manual win');
  }catch(e){await page.screenshot({path:out+'/failure.png'});throw e;}finally{await context.close();}
 }}finally{await browser.close();}
}
assert.equal(results.length,8);assert.deepEqual(hashes(),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,results},null,2));console.log('PASS8 native automatic menu',out);
