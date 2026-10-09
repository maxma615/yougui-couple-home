import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium, webkit} from '@playwright/test';
import {doraKanSequence} from '../fixtures/mahjong-dora-game';
const out = '.local/audit/tablecloth-browser-' + Date.now(); mkdirSync(out, {recursive: true});
const cssFiles = [...readFileSync('src/app/mahjong/page.tsx', 'utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m => 'src/app/mahjong/' + m[1]);
const sources = Object.fromEntries(['tests/browser/mahjong-tablecloth.tsx', 'tests/fixtures/mahjong-dora-game.ts', 'src/components/mahjong/mahjong-client.tsx', 'src/components/mahjong/tablecloth.tsx', 'public/images/mahjong-tablecloth-weave-v1.webp', ...cssFiles].map(f => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]));
const red = process.env.TABLECLOTH_RED === '1';
const bundle = (await build({stdin: {contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.renderRoom=room=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={0} connected host={false} busy={false} motionCanAnimate onChoice={()=>window.commands++} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/></div></main>));window.commands=0;`, resolveDir: process.cwd(), loader: 'tsx'}, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"'}, plugins: red ? [{name: 'old-product', setup(b) { b.onLoad({filter: /mahjong-client\.tsx$/}, () => ({contents: execFileSync('git', ['show', '8f05e38:src/components/mahjong/mahjong-client.tsx'], {encoding:'utf8'}), loader:'tsx'})); }}] : []})).outputFiles[0].text;
const results: unknown[] = [];
for (const engine of [chromium, webkit]) {
 const browser = await engine.launch();
 try {
  for (const variant of ['sanma','yonma'] as const) for (const viewport of [{width:667,height:375},{width:1440,height:810}]) {
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://tablecloth.local/**',route=>{
    const p=new URL(route.request().url()).pathname;
    if(p.startsWith('/images/')||p.startsWith('/fonts/'))return route.fulfill({body:readFileSync('public'+p),contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp'});
    return route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`});
   });
   try {
    const room=doraKanSequence(variant)[0];
    await page.goto('http://tablecloth.local/');await page.evaluate(r=>(window as any).renderRoom(r),room);await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth>0));
    assert.equal(await page.locator('.mahjong-game').getAttribute('data-tablecloth'),'midnight','the original fixed cloth has no selectable appearance');
    const geometry=()=>page.locator('.mahjong-table__surface,.mahjong-hand,.mahjong-opponent-rack,.mahjong-river').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height,getComputedStyle(e).transform];}));
    const before=await geometry(),colors:string[]=[];
    for(const [id,name]of [['midnight','海夜'],['plum','暮紫'],['graphite','石墨']]) {
     const trigger=page.getByRole('button',{name:'更换桌布',exact:true});const triggerRect=await trigger.boundingBox();assert(triggerRect&&triggerRect.width>=44&&triggerRect.height>=44&&triggerRect.x>=0&&triggerRect.x+triggerRect.width<=viewport.width,JSON.stringify({triggerRect,viewport,style:await trigger.evaluate(e=>({width:getComputedStyle(e).width,height:getComputedStyle(e).height,minHeight:getComputedStyle(e).minHeight}))}));await trigger.click();
     const modal=page.getByRole('dialog',{name:'桌布',exact:true});await modal.waitFor({state:'visible'});
     await modal.getByRole('button',{name:new RegExp(name)}).click();
     assert.equal(await page.locator('.mahjong-game').getAttribute('data-tablecloth'),id);
     assert.equal(await modal.getByRole('button',{name:new RegExp(name)}).getAttribute('aria-pressed'),'true');
     const sample=await page.locator('.mahjong-table__surface').evaluate(e=>({background:getComputedStyle(e).backgroundImage,transform:getComputedStyle(e).transform,grain:getComputedStyle(e.querySelector('.mahjong-table__grain')!).backgroundImage}));
     colors.push(sample.background);assert(sample.grain.includes('mahjong-tablecloth-weave-v1.webp'));
     const rect=await modal.boundingBox();assert(rect&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=viewport.width&&rect.y+rect.height<=viewport.height);
     const close=await modal.getByRole('button',{name:'完成',exact:true}).boundingBox();assert(close&&close.height>=44&&close.y>=rect.y&&close.y+close.height<=rect.y+rect.height);
     await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${id}-picker.png`});
     await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});assert(await trigger.evaluate(e=>document.activeElement===e));
     assert.deepEqual(await geometry(),before,'appearance must preserve projected racks, rivers, hand and camera');assert.equal(await page.evaluate(()=>(window as any).commands),0,'changing appearance must never submit a game choice');
     await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${id}-table.png`});
    }
    assert.equal(new Set(colors).size,3);assert.equal(await page.evaluate(()=>localStorage.getItem('yougui.mahjong.tablecloth')),'graphite');
    await page.reload();await page.evaluate(r=>(window as any).renderRoom(r),room);await page.waitForFunction(()=>document.querySelector('.mahjong-game')?.getAttribute('data-tablecloth')==='graphite');
    await page.evaluate(()=>localStorage.setItem('yougui.mahjong.tablecloth','invalid'));await page.reload();await page.evaluate(r=>(window as any).renderRoom(r),room);assert.equal(await page.locator('.mahjong-game').getAttribute('data-tablecloth'),'midnight');
    await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new DOMException('Denied','SecurityError')};Storage.prototype.setItem=()=>{throw new DOMException('Denied','SecurityError')};});
    await page.reload();await page.evaluate(r=>(window as any).renderRoom(r),room);await page.getByRole('button',{name:'更换桌布',exact:true}).click();await page.getByRole('dialog',{name:'桌布',exact:true}).getByRole('button',{name:/暮紫/}).click();assert.equal(await page.locator('.mahjong-game').getAttribute('data-tablecloth'),'plum');await page.getByRole('button',{name:'完成',exact:true}).click();
    assert.equal(await page.evaluate(()=>(window as any).commands),0);assert.deepEqual(errors,[]);
    results.push({engine:engine.name(),variant,viewport,colors,geometry:before,persistence:true,commands:0});console.log('PASS',engine.name(),variant,viewport.width,'three cloths, geometry, native modal focus and persisted reload');
   }catch(e){writeFileSync(out+'/failure.json',JSON.stringify({errors,error:String(e)},null,2));await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-failure.png`});throw e;}finally{await context.close();}
  }
 }finally{await browser.close();}
}
for(const [f,h]of Object.entries(sources))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h);
assert.equal(results.length,8);writeFileSync(out+'/proof.json',JSON.stringify({sources,results},null,2));console.log('PASS8 tablecloth browser',out);
