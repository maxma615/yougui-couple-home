// Real GameRoom, complete native walls, legal RoomStore choices and private ACKs.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {build} from "esbuild";
import {chromium,webkit} from "@playwright/test";
import {RoomStore} from "../../src/modules/mahjong/rooms";
import {abortEngine,playAbort,type AbortKind} from "../fixtures/mahjong-abort-game";
import {winningHand} from "../../src/components/mahjong/mahjong-winning-hand";
import {abortBaseAt,drawRevealAt,drawSummaryAt} from "../../src/components/mahjong/settlement-presentation";
import type {MahjongCommand,GameVariant} from "../../src/modules/mahjong/types";
const out=`.local/audit/abort-sequence-browser-${Date.now()}`;mkdirSync(out,{recursive:true});
const cssFiles=["mahjong.css","mahjong-river.css","mahjong-meld.css","mahjong-interaction.css","mahjong-discard-motion.css","mahjong-table-center.css","mahjong-table-edge.css","mahjong-camera.css","mahjong-call-announcement.css","mahjong-standing-tile.css","mahjong-abort-announcements.css"];
const css=cssFiles.map(f=>readFileSync(`src/app/mahjong/${f}`,"utf8")).join("\n");
const harness=`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));let current,busy=false,connected=true,epoch=0;
function paint(){flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom key={epoch} room={current} ownSeat={current.mySeat} host={false} connected={connected} busy={busy} motionCanAnimate={false} onChoice={async choice=>{busy=true;paint();try{current=await window.realAbortChoice({decisionId:current.game.decisionId,choiceId:choice.id});}finally{busy=false;paint();}}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/></div></main>));}
window.abortProbe={remount:room=>{current=room;epoch++;paint();},render:room=>{current=room;paint();},connection:value=>{connected=value;paint();},dispose:()=>root.unmount()};`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,metafile:true,jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'}});
const sha=(s:string|Buffer)=>createHash("sha256").update(s).digest("hex");
writeFileSync(`${out}/manifest.json`,JSON.stringify({cssSha:sha(css),bundleSha:sha(bundle.outputFiles[0].text),sources:Object.keys(bundle.metafile!.inputs).filter(f=>!f.startsWith('<')).map(file=>({file,sha:sha(readFileSync(file))}))},null,2));
const results:unknown[]=[];
const cases:{variant:GameVariant;kind:AbortKind;declare:boolean;dealer:number;own:number}[]=[
 {variant:'yonma',kind:'nine',declare:false,dealer:0,own:1}, {variant:'yonma',kind:'winds',declare:false,dealer:0,own:0},
 {variant:'yonma',kind:'riichi',declare:false,dealer:2,own:1}, {variant:'yonma',kind:'ron',declare:false,dealer:1,own:2},
 {variant:'yonma',kind:'ron',declare:true,dealer:3,own:0}, {variant:'yonma',kind:'kans',declare:false,dealer:0,own:2},
 {variant:'yonma',kind:'kans',declare:true,dealer:1,own:3}, {variant:'sanma',kind:'nine',declare:false,dealer:0,own:1},
 {variant:'sanma',kind:'kans',declare:true,dealer:1,own:2},
];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try {const scene=async(c:typeof cases[number],viewport:{width:number;height:number},reduced=false)=>{
  const label=`${engine.name()}-${c.variant}-${c.kind}-${c.declare?'declared':'plain'}-${viewport.width}${reduced?'-reduced':''}`;
  if(process.env.ABORT_BROWSER_CASE&&!label.includes(process.env.ABORT_BROWSER_CASE))return;
  const count=c.variant==='sanma'?3:4;let now=1000;
  const users=Array.from({length:count},(_,seat)=>({userId:randomUUID(),displayName:`玩家${seat}`+'长名字'.repeat(8)}));
  const raw=abortEngine(c.kind,c.variant,c.dealer,c.declare),store=new RoomStore({now:()=>now,gameFactory:()=>raw});
  const send=(seat:number,input:object)=>store.execute(users[seat],{nonce:randomUUID(),...input} as MahjongCommand)!;
  const room=send(0,{action:'create',variant:c.variant,mode:'east'});
  for(let seat=1;seat<count;seat++)send(seat,{action:'join',code:room.code});
  for(let seat=0;seat<count;seat++)send(seat,{action:'ready',roomId:room.id,ready:true});send(0,{action:'start',roomId:room.id});
  const view=(seat=c.own)=>store.view(users[seat].userId)!;
  playAbort({view:seat=>view(seat).game!,respond:(seat,decisionId,choiceId)=>{send(seat,{action:'respond',roomId:room.id,decisionId,choiceId});}},c.kind,c.dealer,c.declare);
  const ending=view().game!,handId=ending.handId,old=ending.players.map(p=>p.score),settlement=ending.settlement!,flow=ending.settlementFlow!;
  const context=await browser.newContext({viewport,reducedMotion:reduced?'reduce':'no-preference',...(engine===webkit?{recordVideo:{dir:`${out}/video`,size:viewport}}:{})});
  try {const page=await context.newPage(),errors:string[]=[],acks:unknown[]=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install({time:new Date('2026-10-08T04:00:00Z')});await page.clock.pauseAt(new Date('2026-10-08T04:00:01Z'));
   await page.exposeFunction('realAbortChoice',(input:{decisionId:string;choiceId:string})=>{
    const previous=view().game!;assert.equal(input.decisionId,previous.decisionId);send(c.own,{action:'respond',roomId:room.id,...input});acks.push({stage:previous.settlementFlow!.stage});return view();
   });
   await page.route('https://mahjong.local/images/**',async route=>{const path=new URL(route.request().url()).pathname;await route.fulfill({status:200,contentType:path.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync(`public${path}`)});});
   await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*:before,*:after{box-sizing:border-box}${css}</style><div id="root"></div>`);
   await page.addScriptTag({content:`globalThis.process={env:{NODE_ENV:"development"}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});\n${bundle.outputFiles[0].text}`});
   await page.evaluate(r=>(window as any).abortProbe.render(r),view());
   const advance=async(ms:number)=>{now+=ms;await page.clock.runFor(ms);};
   assert.equal(await page.locator('[data-draw-reveal-seat],[data-abort-ron-seat],[data-abort-riichi-seat]').count(),0);
   if(settlement.drawInfo!.abortPresentation?.riichiSeat!==undefined){
    await advance(299);assert.equal(await page.locator('[data-abort-riichi-seat]').count(),0);await advance(1);
    assert.equal(await page.locator(`[data-abort-riichi-seat="${settlement.drawInfo!.abortPresentation.riichiSeat}"]`).count(),1);
    await advance(700);assert.equal(await page.locator('[data-abort-riichi-seat]').count(),0);
   }
   const elapsed=()=>now-1000;
   if(c.kind==='ron'){
    const start=abortBaseAt(settlement)+300;await advance(start-1-elapsed());assert.equal(await page.locator('[data-abort-ron-seat]').count(),0);await advance(1);
    const marks=await page.locator('[data-abort-ron-seat]').evaluateAll(els=>els.map(el=>({seat:Number(el.getAttribute('data-abort-ron-seat')),className:el.className})));assert.deepEqual(marks.map(m=>m.seat),settlement.drawInfo!.abortPresentation!.ronSeats);
    for(const mark of marks){const relative=(mark.seat-c.own+count)%count,position=relative===0?'south':relative===1?'east':relative===3||count===3?'west':'north';assert.ok(mark.className.includes(`is-${position}`));}
    await advance(200);
    await page.screenshot({path:`${out}/${label}-ron.png`});
    if(reduced)assert.equal(await page.locator('[data-abort-ron-seat] b').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    await advance(700);assert.equal(await page.locator('[data-abort-ron-seat]').count(),0);
   }
   const reveal=drawRevealAt(settlement);if(elapsed()<reveal-1)await advance(reveal-1-elapsed());
   if(elapsed()<reveal)assert.equal(await page.locator('[data-draw-reveal-seat]').count(),0);if(elapsed()<reveal)await advance(reveal-elapsed());
   const publicSeats=settlement.drawInfo!.revealedHands.filter(h=>h.seat!==c.own).map(h=>h.seat).sort();
   assert.deepEqual((await page.locator('[data-draw-reveal-seat]').evaluateAll(els=>els.map(el=>Number(el.getAttribute('data-draw-reveal-seat'))))).sort(),publicSeats);
   for(const seat of publicSeats){const hand=settlement.drawInfo!.revealedHands.find(h=>h.seat===seat)!.hand;assert.equal(await page.locator(`[data-draw-reveal-seat="${seat}"] [data-flight-volume]`).count(),winningHand({...settlement,hand}).closed.length);}
   const cause=drawSummaryAt(settlement);await advance(cause-1-elapsed());assert.equal(await page.getByRole('region',{name:'流局原因'}).count(),0);await advance(1);
   const region=page.getByRole('region',{name:'流局原因'});assert.equal(await region.count(),1);assert.ok((await region.innerText()).includes(settlement.name));assert.doesNotMatch(await region.innerText(),/听牌|结算前|支付|获得/);
   assert.equal(await region.locator('[data-settlement-seat]').count(),0);
   const button=region.getByRole('button',{name:/继续/});assert.equal(await button.isDisabled(),true);
   await advance(500);
   await page.evaluate(r=>(window as any).abortProbe.remount(r),view());
   for(const seat of publicSeats)assert.equal(await page.locator(`[data-draw-reveal-seat="${seat}"] .mahjong-draw-rack__tile`).first().evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).isIdentity),true,`${label}: completed flip replayed on reconnect`);
   const fadeBefore=await region.evaluate(el=>Number(getComputedStyle(el).opacity));
   const oldSnapshot={...view(),game:{...view().game!,settlementFlow:{...flow,elapsedMs:0}}};
   await page.evaluate(r=>(window as any).abortProbe.render(r),oldSnapshot);const fadeAfter=await region.evaluate(el=>Number(getComputedStyle(el).opacity));assert.ok(fadeAfter>=fadeBefore-.02,`${label}: stale snapshot rewound opacity ${fadeBefore}->${fadeAfter}`);
   assert.equal(await page.locator('[data-abort-ron-seat],[data-abort-riichi-seat]').count(),0);
   await advance(499);assert.equal(await button.isDisabled(),true);await advance(1);assert.equal(await button.isDisabled(),false);
   const geometry=await button.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight};});assert.ok(geometry.width>=44&&geometry.height>=44);assert.ok(geometry.x>=0&&geometry.y>=0&&geometry.x+geometry.width<=viewport.width+1&&geometry.y+geometry.height<=viewport.height+1);
   await page.screenshot({path:`${out}/${label}-cause.png`});await button.click();await page.getByText('等待其他玩家',{exact:true}).waitFor();
   assert.deepEqual(acks,[{stage:'draw'}]);assert.equal(view().game!.handId,handId);assert.deepEqual(view().game!.players.map(p=>p.score),old);
   for(let seat=0;seat<count;seat++)if(seat!==c.own){const v=view(seat).game!;send(seat,{action:'respond',roomId:room.id,decisionId:v.decisionId,choiceId:v.choices.find(ch=>ch.type==='ack')!.id});}
   assert.equal(view().game!.handId,handId!+1);await page.evaluate(r=>(window as any).abortProbe.render(r),view());
   assert.equal(await page.locator('[data-draw-reveal-seat],[data-abort-ron-seat],[data-abort-riichi-seat],.mahjong-settlement-panel').count(),0);
   assert.deepEqual(errors,[]);results.push({label,publicSeats,geometry,fadeBefore,fadeAfter,acks});console.log(`PASS ${label}`);
  }finally{await context.close();}
 };
 const matrix=cases.flatMap(c=>[{width:667,height:375},{width:1440,height:810}].map(viewport=>({c,viewport})));
 for(let i=0;i<matrix.length;i+=2)await Promise.all(matrix.slice(i,i+2).map(({c,viewport})=>scene(c,viewport)));
 await scene(cases[4],{width:667,height:375},true);
 }finally{await browser.close();}
}
writeFileSync(`${out}/summary.json`,JSON.stringify({results},null,2));console.log(`PASS ${results.length} native abort browser scenes in ${out}`);
