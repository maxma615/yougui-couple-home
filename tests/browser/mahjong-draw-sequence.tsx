// Mounted production GameRoom, full physical walls and native RoomStore ACKs.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {build} from "esbuild";
import {chromium,webkit} from "@playwright/test";
import {RoomStore} from "../../src/modules/mahjong/rooms";
import {drawEngine,playToDraw} from "../fixtures/mahjong-draw-game";
import {physicalEngine} from "../fixtures/mahjong-settlement-game";
import type {Choice,MahjongCommand} from "../../src/modules/mahjong/types";

const out=`.local/audit/draw-sequence-browser-${Date.now()}`;
mkdirSync(out,{recursive:true});
const cssFiles=["mahjong.css","mahjong-river.css","mahjong-meld.css","mahjong-interaction.css","mahjong-discard-motion.css","mahjong-table-center.css","mahjong-table-edge.css","mahjong-camera.css","mahjong-call-announcement.css","mahjong-standing-tile.css","mahjong-abort-announcements.css"];
const css=cssFiles.map(f=>readFileSync(`src/app/mahjong/${f}`,"utf8")).join("\n");
const harness=`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));let current,busy=false;
function paint(){flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={current} ownSeat={1} host={false} connected busy={busy} motionCanAnimate={false} onChoice={async choice=>{busy=true;paint();try{current=await window.realDrawChoice({decisionId:current.game.decisionId,choiceId:choice.id});}finally{busy=false;paint();}}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/></div></main>));}
window.drawProbe={render:room=>{current=room;paint();},dispose:()=>root.unmount()};`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,metafile:true,jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'}});
const sha=(s:string|Buffer)=>createHash("sha256").update(s).digest("hex");
writeFileSync(`${out}/manifest.json`,JSON.stringify({cssSha:sha(css),bundleSha:sha(bundle.outputFiles[0].text),sources:Object.keys(bundle.metafile!.inputs).filter(f=>!f.startsWith('<')).map(file=>({file,sha:sha(readFileSync(file))}))},null,2));
const results:unknown[]=[];
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch({headless:true});
 try {const scene=async (variant:"sanma"|"yonma",kind:"exhaustive"|"abort"|"nagashi",viewport:{width:number;height:number})=> {
  const label=`${engine.name()}-${variant}-${kind}-${viewport.width}`,count=variant==="sanma"?3:4;
  if(process.env.DRAW_BROWSER_CASE && !label.includes(process.env.DRAW_BROWSER_CASE)) return;
  let now=1000;
  const users=Array.from({length:count},(_,seat)=>({userId:randomUUID(),displayName:seat===0?"长姓名玩家甲".repeat(12)+"甲":`玩家${seat}`}));
  const raw=kind==="abort"?physicalEngine(variant,{0:"m19p19s19z1234567"},"z1"):drawEngine(variant,kind==="nagashi"?[0,1]:[]);
  const store=new RoomStore({now:()=>now,gameFactory:()=>raw});
  const send=(seat:number,input:object)=>store.execute(users[seat],{nonce:randomUUID(),...input} as MahjongCommand)!;
  const room=send(0,{action:"create",variant,mode:"east"});
  for(let seat=1;seat<count;seat++)send(seat,{action:"join",code:room.code});
  for(let seat=0;seat<count;seat++)send(seat,{action:"ready",roomId:room.id,ready:true});
  send(0,{action:"start",roomId:room.id});
  const view=(seat=1)=>store.view(users[seat].userId)!;
  const choose=(seat:number,type:Choice['type'])=>{const v=view(seat).game!,choice=v.choices.find(c=>c.type===type);assert.ok(choice);send(seat,{action:"respond",roomId:room.id,decisionId:v.decisionId,choiceId:choice.id});};
  if(kind==="abort")choose(0,"abort");
  else playToDraw({view:seat=>view(seat).game!,respond:(seat,decisionId,choiceId)=>{send(seat,{action:"respond",roomId:room.id,decisionId,choiceId});}},count);
  const ending=view().game!,old=ending.players.map(p=>p.score),handId=ending.handId;
  const context=await browser.newContext({viewport,...(engine===webkit?{recordVideo:{dir:`${out}/video`,size:viewport}}:{})});
  const page=await context.newPage(),errors:string[]=[],acks:unknown[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.exposeFunction("realDrawChoice",(input:{decisionId:string;choiceId:string})=>{
   const previous=view().game!;assert.equal(input.decisionId,previous.decisionId);
   send(1,{action:"respond",roomId:room.id,...input});
   acks.push({stage:previous.settlementFlow!.stage,index:previous.settlementFlow!.detailIndex});
   return view();
  });
  await page.route('https://mahjong.local/images/**',async route=>{const path=new URL(route.request().url()).pathname;await route.fulfill({status:200,contentType:path.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync(`public${path}`)});});
  await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*:before,*:after{box-sizing:border-box}${css}</style><div id="root"></div>`);
  await page.addScriptTag({content:`globalThis.process={env:{NODE_ENV:"development"}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});\n${bundle.outputFiles[0].text}`});
  await page.evaluate(r=>(window as any).drawProbe.render(r),view());
  const region=page.getByRole('region',{name:kind==='abort'?'流局原因':'听牌结果'});
  await region.waitFor();
  assert.equal(await region.locator('[data-settlement-seat]').count(),0);
  if(kind==='abort')assert.doesNotMatch(await region.innerText(),/听牌|支付|获得/);
  else {
   assert.equal(await region.locator('[data-draw-seat]').count(),count);
   if(kind==='exhaustive') {assert.equal(await region.locator('[data-draw-seat="0"] [aria-label="待牌"] [data-tile-face]').count(),1);assert.equal(await page.locator('[data-draw-reveal-seat="0"] [data-flight-volume]').count(),13);assert.equal(await page.locator('[data-draw-reveal-seat="2"]').count(),0);}
  }
  await page.screenshot({path:`${out}/${label}-summary-snapshot.png`});
  await region.locator('.mahjong-settlement-panel__content').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const button=region.getByRole('button',{name:/继续/});await button.click();
  if(kind==='nagashi') for(let index=0;index<2;index++) {
   const detail=page.getByRole('region',{name:'流满贯详情'});await detail.waitFor();
   await page.waitForFunction(i=>document.querySelector('.mahjong-settlement-panel__page')?.textContent?.includes(`第 ${i+1}`),index);
   assert.equal(await detail.locator('[data-testid="mahjong-winning-tile"]').count(),0);
   assert.doesNotMatch(await detail.innerText(),/0 翻|0 符/);
   assert.equal(view().game!.settlement!.winnerSeat,index);
   await detail.getByTestId('nagashi-mangan-title').waitFor({state:'visible'});
   const handRow=detail.locator('.mahjong-winning-hand__row');
   if(await handRow.count()) assert.equal(await handRow.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`${label}: all public tiles must fit without horizontal scrolling`);
   await page.screenshot({path:`${out}/${label}-detail-${index}-snapshot.png`});
   await detail.locator('.mahjong-settlement-panel__content').evaluate(el=>{el.scrollTop=el.scrollHeight;});
   await detail.getByRole('button',{name:/继续/}).click();
  }
  if(kind!=='abort') {
   const scores=page.getByRole('region',{name:'本局收支'});await scores.waitFor();
   assert.equal(await scores.locator('[data-settlement-seat]').count(),count);
   assert.equal(await scores.locator('.mahjong-winning-hand,.mahjong-draw-summary').count(),0);
   await page.screenshot({path:`${out}/${label}-scores-snapshot.png`});
   await scores.getByRole('button',{name:/继续/}).click();
  }
  await page.getByText('等待其他玩家',{exact:true}).waitFor();
  assert.equal(view().game!.handId,handId);assert.deepEqual(view().game!.players.map(p=>p.score),old);
  assert.equal(view(0).game!.settlementFlow!.stage,'draw');
  const pages=kind==='abort'?1:kind==='nagashi'?4:2;
  for(let seat=0;seat<count;seat++)if(seat!==1)for(let n=0;n<pages;n++)choose(seat,'ack');
  assert.equal(view().game!.handId,handId!+1);
  await page.evaluate(r=>(window as any).drawProbe.render(r),view());
  assert.equal(await page.locator('.mahjong-settlement-panel').count(),0);
  assert.equal(await page.locator('[data-draw-reveal-seat]').count(),0);
  assert.deepEqual(errors,[]);
  const expected=kind==='abort'?['draw']:kind==='nagashi'?['draw','detail','detail','scores']:['draw','scores'];
  assert.deepEqual(acks.map((a:any)=>a.stage),expected);
  const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,hand:document.querySelector('[data-testid="mahjong-hand"]')!.getBoundingClientRect().toJSON()}));
  assert.equal(geometry.overflow,false);
  await page.screenshot({path:`${out}/${label}-next-hand.png`});
  results.push({label,acks,geometry});console.log(`PASS ${label}: native result pages, private cursor, physical public rack, final barrier and next hand`);
  await context.close();
 };
 const cases=(["sanma","yonma"] as const).flatMap(variant=>(["exhaustive","abort","nagashi"] as const).flatMap(kind=>[{width:667,height:375},{width:1440,height:810}].map(viewport=>({variant,kind,viewport}))));
 for(let i=0;i<cases.length;i+=2) await Promise.all(cases.slice(i,i+2).map(c=>scene(c.variant,c.kind,c.viewport)));
 }finally {await browser.close();}
}
writeFileSync(`${out}/summary.json`,JSON.stringify({results},null,2));
console.log(`PASS ${results.length} mounted native draw scenes in ${out}`);
