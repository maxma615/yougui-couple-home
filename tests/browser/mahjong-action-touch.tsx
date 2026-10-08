// Browser geometry checks: native sanma actions and explicitly labelled layout stress.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {northReplacementFixture} from '../fixtures/mahjong-view-game';
import type {RoomView,Choice} from '../../src/modules/mahjong/types';

const css=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)]
 .map(match=>readFileSync('src/app/mahjong/'+match[1],'utf8')).join('\n');
const harness=`import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.choices=[];window.renderRoom=room=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,ownSeat:room.mySeat,host:true,busy:false,connected:true,motionCanAnimate:false,onChoice:choice=>window.choices.push(choice),onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))));`;
const bundle=(await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text;
const output=`.local/audit/action-touch-${Date.now()}`;mkdirSync(output,{recursive:true});
const results:unknown[]=[],failures:string[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{
  for(const hasTouch of [true,false])for(const viewport of [{width:667,height:375},{width:844,height:390},{width:1440,height:810}]){
   const context=await browser.newContext({viewport,hasTouch});const page=await context.newPage();
   await page.route('https://mahjong.local/fonts/**',route=>route.fulfill({status:200,contentType:'font/woff2',body:readFileSync('public'+new URL(route.request().url()).pathname)}));
   await page.route('https://mahjong.local/images/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    await route.fulfill({status:200,contentType:path.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync('public'+path)});
   });
   for(const mode of ['native-north','response-layout-stress'] as const){
    const native=northReplacementFixture(),game=native.view(0);
    if(mode==='response-layout-stress')game.choices=[
     {id:'ron',type:'ron'},{id:'kan:p1111',type:'kan',value:'p1111'},
     {id:'kan:s2222',type:'kan',value:'s2222'},{id:'pon:p111+',type:'pon',value:'p111+'},
     {id:'chi:p123-',type:'chi',value:'p123-'},{id:'chi:p234-',type:'chi',value:'p234-'},
     {id:'pass',type:'pass'}] satisfies Choice[];
    const room:RoomView={id:'touch-fixture',code:'ABCDEFGH',hostUserId:'0',mode:'east',variant:'sanma',status:'playing',version:1,mySeat:0,game,
     members:game.players.map(p=>({userId:String(p.seat),seat:p.seat,displayName:`玩家${p.seat}`,kind:'human',ready:true,connected:true}))};
    await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><div id="root"></div>`);
    assert.equal(await page.evaluate(async()=>(await document.fonts.load('40px "Yougui Mahjong Brush"','立直自摸吃碰杠拔北')).length),1);
    await page.addScriptTag({content:`globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};${bundle}`});
    await page.evaluate(room=>(window as any).renderRoom(room),room);
    await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth>0));
    await page.evaluate(()=>document.querySelector('.mahjong-shell')!.insertAdjacentHTML('afterbegin','<div class="mahjong-notice" role="alert"><svg width="16" height="16" aria-hidden="true"></svg><span>测试提示：请求未完成，请重试刚才的操作。</span><button type="button" aria-label="关闭提示"><svg width="16" height="16" aria-hidden="true"></svg></button></div>'));
    assert.equal(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches),hasTouch);
    const measured=await page.evaluate(minimum=>[...document.querySelectorAll<HTMLButtonElement>('.mahjong-action-dock > button')].map(button=>{
     const r=button.getBoundingClientRect();const problems:string[]=[],hits:unknown[]=[];
     if(r.width<minimum-.01||r.height<minimum-.01)problems.push('touch target smaller than minimum CSS px');
     if(r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight)problems.push('outside viewport');
     for(const [u,v] of [[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.5,.5]]){const hit=document.elementFromPoint(r.left+r.width*u,r.top+r.height*v);hits.push({u,v,className:hit?.getAttribute('class'),x:r.left+r.width*u,y:r.top+r.height*v});if(!button.contains(hit))problems.push('covered touch corner');}
     for(const tile of document.querySelectorAll('.mahjong-hand [data-tile-face],.mahjong-river--0 [data-tile-face]')){
      const t=tile.getBoundingClientRect();if(Math.min(r.right,t.right)-Math.max(r.left,t.left)>.5&&Math.min(r.bottom,t.bottom)-Math.max(r.top,t.top)>.5)problems.push('overlaps own hand or river');
     }
     return {label:button.getAttribute('aria-label')??button.textContent,width:r.width,height:r.height,left:r.left,top:r.top,hits,problems};
    }),hasTouch?44:34);
    const label=`${engine.name()} ${viewport.width} ${mode} touch=${hasTouch}`;
    let cancellation:unknown=null;
    if(mode==='native-north'){
     await page.getByRole('button',{name:'立直',exact:true})[hasTouch?'tap':'click']();
     const cancel=page.getByRole('button',{name:'返回普通切牌'}),rect=await cancel.boundingBox();
     if(hasTouch&&(!rect||rect.width<43.99||rect.height<43.99))failures.push(label+' riichi cancellation smaller than minimum CSS px');
     cancellation=await cancel.evaluate(button=>{
      const r=button.getBoundingClientRect(),issues:string[]=[];
      const points=[[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.5,.5]].map(([u,v])=>{
       const x=r.left+r.width*u,y=r.top+r.height*v,hit=document.elementFromPoint(x,y),valid=button.contains(hit);
       if(!valid)issues.push('covered cancellation target');return {x,y,valid,hitClass:hit?.getAttribute('class')};
      });
      if(r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight)issues.push('cancellation outside viewport');
      for(const tile of document.querySelectorAll('.mahjong-hand [data-tile-face],.mahjong-river--0 [data-tile-face]')){
       const t=tile.getBoundingClientRect();if(Math.min(r.right,t.right)-Math.max(r.left,t.left)>.5&&Math.min(r.bottom,t.bottom)-Math.max(r.top,t.top)>.5)issues.push('cancellation overlaps hand or river');
      }
      return {width:r.width,height:r.height,points,issues};
     });
     for(const issue of (cancellation as {issues:string[]}).issues)failures.push(label+' '+issue);
     await cancel[hasTouch?'tap':'click']();
     await page.getByRole('button',{name:'拔北',exact:true})[hasTouch?'tap':'click']();
     const choices=await page.evaluate(()=>(window as any).choices);
     const legal=game.choices.find(c=>c.type==='nuki');assert.ok(legal);assert.deepEqual(choices,[legal]);
     native.respond(0,game.decisionId,legal.id);
     const own=native.view(0).players[0];assert.ok(own);assert.equal(own.nuki,1);
    }else{
     await page.getByRole('button',{name:'吃',exact:true})[hasTouch?'tap':'click']();
     const dialog=page.getByRole('dialog',{name:'选择吃牌'});
     const detail=await dialog.evaluate(el=>{
      const r=el.getBoundingClientRect();
      return {tag:el.tagName,modal:el.getAttribute('aria-modal'),x:r.x,y:r.y,width:r.width,height:r.height,inViewport:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,focus:el.contains(document.activeElement),options:[...el.querySelectorAll<HTMLElement>('[data-choice-id]')].map(n=>{const b=n.getBoundingClientRect();return{width:b.width,height:b.height,hit:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('[data-choice-id]')?.getAttribute('data-choice-id'),id:n.dataset.choiceId};})};
     });
     assert.equal(detail.tag,'SECTION');assert.equal(detail.modal,'false');assert(detail.inViewport);assert(detail.focus);assert(Math.abs(detail.x+detail.width/2-viewport.width/2)<=1,'detail centered on table');
     for(const o of detail.options){assert(o.width>=44&&o.height>=44);assert.equal(o.hit,o.id);}
     assert.equal(await page.locator('dialog:modal').count(),0);
     await page.screenshot({path:output+'/'+label.replace(/[^a-z0-9-]/gi,'-')+'-inline-call.png'});
     if(hasTouch)await dialog.getByRole('button',{name:'关闭选牌'}).tap();else await page.keyboard.press('Escape');
     assert.equal(await dialog.count(),0);assert.deepEqual(await page.evaluate(()=>(window as any).choices),[]);
     if(!hasTouch)assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-choice-type')),'chi','Escape returns focus to entry');
     await page.getByRole('button',{name:'吃',exact:true})[hasTouch?'tap':'click']();
     await dialog.locator('[data-choice-id="chi:p123-"]')[hasTouch?'tap':'click']();
     assert.deepEqual(await page.evaluate(()=>(window as any).choices),[game.choices.find(c=>c.id==='chi:p123-')]);
    }

    assert.ok(measured.length>0);results.push({label,viewport,hasTouch,noticePresent:true,measured,cancellation});
    for(const action of measured)for(const problem of action.problems)failures.push(`${label} ${action.label}: ${problem} (${action.width}x${action.height})`);
    console.log(`${measured.every(a=>!a.problems.length)?'PASS':'FAIL'} ${label}`);
   }
   await context.close();
  }
 }finally{await browser.close();}
}
writeFileSync(output+'/proof.json',JSON.stringify({cssSha256:createHash('sha256').update(css).digest('hex'),testSha256:createHash('sha256').update(readFileSync('tests/browser/mahjong-action-touch.tsx')).digest('hex'),results,failures},null,2)+'\n');
console.log(`ARTIFACT ${output} scenes=${results.length} failures=${failures.length}`);
assert.deepEqual(failures,[]);
