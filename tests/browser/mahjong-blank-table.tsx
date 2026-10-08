import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {RoomView} from '../../src/modules/mahjong/types';
const out='.local/audit/blank-table-browser-'+Date.now();mkdirSync(out,{recursive:true});
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['tests/browser/mahjong-blank-table.tsx','src/components/mahjong/blank-table-action.ts','src/components/mahjong/use-blank-table-double-tap.ts','src/components/mahjong/mahjong-client.tsx','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts','tests/fixtures/mahjong-settlement-game.ts','public/fonts/mahjong-brush.woff2',...cssFiles];
const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.renderRoom=(room)=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={room.mySeat} connected host={false} busy={false} motionCanAnimate onChoice={(c,intent)=>{window.blankDispatches??=[];window.blankDispatches.push({choice:c,held:!!document.querySelector('.is-nuki-held'),arriving:!!document.querySelector('.is-draw-arriving')});window.respond(c,intent);}} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/></div></main>));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text;
const results:any[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const hasTouch of [false,true])for(const kind of ['default','cut','tsumo','ron','riichi','pon','kan','interrupted',...(variant==='sanma'?['north','replacement']:[])]){
  const seat=kind==='ron'||kind==='pon'?1:0;
  const game=physicalEngine(variant,kind==='ron'||kind==='pon'?{0:'p789s234567z1234',1:kind==='ron'?'p1123456789s123':'p11s123456789z23'}:{0:kind==='kan'?'p1111s2222p789z12':kind==='tsumo'||kind==='riichi'?'p123456789s123z2':'p123456789s124z2'},kind==='ron'||kind==='pon'?'p1':kind==='tsumo'?'z2':kind==='riichi'||kind==='kan'?'z3':kind==='north'||kind==='replacement'?'z4':'s2');
  if(seat===1){const g=game.view(0);game.respond(0,g.decisionId,g.choices.find(c=>c.value==='p1_')!.id);}
  if(kind==='pon'){const g=game.view(1);game.respond(1,g.decisionId,g.choices.find(c=>c.type==='pon')!.id);for(let s=0;s<(variant==='sanma'?3:4);s++){const g=game.view(s),pass=g.choices.find(c=>c.type==='pass');if(pass)game.respond(s,g.decisionId,pass.id);}}
  let version=1;const commands:any[]=[],errors:string[]=[];
  const room=():RoomView=>({id:'blank-table-native',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:seat,game:game.view(seat),members:game.view(seat).players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))});
  const context=await browser.newContext({viewport,hasTouch}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://blank-table.local/**',route=>{const p=new URL(route.request().url()).pathname;if(p.startsWith('/fonts/')||p.startsWith('/images/'))return route.fulfill({body:readFileSync('public'+p),contentType:p.endsWith('.woff2')?'font/woff2':p.endsWith('.svg')?'image/svg+xml':'image/webp'});return route.fulfill({contentType:'text/html',body:`<style>*{box-sizing:border-box}body{margin:0}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`});});
  await page.exposeFunction('respond',async(choice:any,intent:any)=>{
   const g=game.view(seat);assert(g.choices.some(c=>c.id===choice.id),'native offered choice');assert.equal(commands.length,0,'only one operation while same UI decision remains');
   if(choice.type==='discard'){assert(intent&&intent.choiceId===choice.id&&intent.decisionId===g.decisionId&&intent.sourceRect.width>0);assert.equal(intent.sourceTileId.startsWith('drawn:'),kind!=='pon');}
   game.respond(seat,g.decisionId,choice.id);commands.push({...choice,decisionId:g.decisionId,intent});version++;
  });
  try{
   await page.goto('http://blank-table.local/');await page.evaluate(r=>(window as any).renderRoom(r),room());await page.getByTestId('mahjong-board').waitFor();await page.evaluate(()=>document.fonts.ready);
   await page.locator('.mahjong-automatic summary')[hasTouch?'tap':'click']();const toggle=page.getByRole('button',{name:/^双击过牌／摸切\s*关$/});assert.equal(await toggle.getAttribute('aria-pressed'),'false');
   const box=await toggle.boundingBox();assert(box&&box.width>=44&&box.height>=44&&box.y>=0&&box.y+box.height<=viewport.height,'shortcut menu fits short landscape');
   if(kind!=='default')await toggle[hasTouch?'tap':'click']();await page.locator('.mahjong-automatic summary')[hasTouch?'tap':'click']();
   if(kind==='riichi')await page.getByRole('button',{name:'立直',exact:true})[hasTouch?'tap':'click']();
   if(kind==='kan'){assert(game.view(seat).choices.filter(c=>c.type==='kan').length>1);await page.getByRole('button',{name:'杠',exact:true})[hasTouch?'tap':'click']();await page.getByRole('dialog',{name:'选择杠牌'}).waitFor();}
   const blank=await page.evaluate(()=>{
    const b=document.querySelector('.mahjong-table')!.getBoundingClientRect();
    for(let y=b.top+b.height*.12;y<b.top+b.height*.75;y+=12)for(let x=b.left+b.width*.15;x<b.left+b.width*.85;x+=12){const el=document.elementFromPoint(x,y);if(el?.matches('.mahjong-table__surface'))return{x,y};}
    throw Error('no directly hittable blank felt');
   });
   const tap=async()=>{if(hasTouch)await page.touchscreen.tap(blank.x,blank.y);else await page.mouse.click(blank.x,blank.y);};
   const pair=async()=>{await tap();await tap();};
   if(kind==='interrupted'){await tap();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await tap();await page.waitForTimeout(50);assert.equal(commands.length,0);await page.waitForTimeout(310);}
   if(kind==='replacement'){
    const g=game.view(seat);game.respond(seat,g.decisionId,g.choices.find(c=>c.type==='nuki')!.id);version++;
    await page.evaluate(r=>(window as any).renderRoom(r),room());
    assert(await page.locator('.is-nuki-held,.is-draw-arriving').count()>0,'native replacement presentation active');
    await pair();await page.waitForTimeout(50);
    assert.equal(commands.length,0,'no hidden replacement discard');
    assert.equal(await page.evaluate(()=>((window as any).blankDispatches??[]).length),0,'no submission before presentation');
    await page.waitForFunction(()=>!document.querySelector('.is-nuki-held,.is-draw-arriving'));
   }
   const expectedValue=game.view(seat).drawnTile?game.view(seat).drawnTile+'_':game.view(seat).hand.at(-1);
   await pair();await page.waitForTimeout(50);
   if(kind==='riichi'||kind==='kan'){
    assert.equal(commands.length,0,'first pair returns from self selection');
    if(kind==='riichi')assert.equal(await page.getByRole('button',{name:'立直',exact:true}).getAttribute('aria-pressed'),'false');else assert.equal(await page.getByRole('dialog',{name:'选择杠牌'}).count(),0);
    await pair();
   }
   if(kind==='default'){await page.waitForTimeout(150);assert.equal(commands.length,0);}
   else{
    for(let i=0;i<100&&!commands.length;i++)await page.waitForTimeout(20);assert.equal(commands.length,1);
    const c=commands[0];assert.equal(c.type,kind==='ron'?'pass':'discard');if(kind!=='ron')assert.equal(c.value,expectedValue);
    await pair();await page.waitForTimeout(50);assert.equal(commands.length,1,'same presented decision cannot submit twice');
    await page.evaluate(r=>(window as any).renderRoom(r),room());
   }
   assert.deepEqual(errors,[]);await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${hasTouch}-${kind}.png`});
   results.push({engine:engine.name(),variant,viewport,hasTouch,kind,blank,commands});console.log('PASS',engine.name(),variant,viewport.width,hasTouch,kind);
  }catch(error){await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${hasTouch}-${kind}-failure.png`});writeFileSync(out+'/failure.json',JSON.stringify({error:String(error),commands,errors,body:await page.locator('body').innerText()},null,2));throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}
assert.equal(results.length,144);assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS 144 native blank-table scenes',out);
