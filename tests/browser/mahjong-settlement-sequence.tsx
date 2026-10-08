// Real native games and RoomStore ACKs drive the mounted production GameRoom.
// This browser boundary check complements authenticated HTTP/Socket regressions.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import { RoomStore } from "../../src/modules/mahjong/rooms";
import { physicalEngine } from "../fixtures/mahjong-settlement-game";
import type { Choice, MahjongCommand, GameVariant } from "../../src/modules/mahjong/types";
const out = `.local/audit/settlement-sequence-browser-${Date.now()}`;
mkdirSync(out,{recursive:true});
const cssFiles=["mahjong.css","mahjong-river.css","mahjong-meld.css","mahjong-interaction.css","mahjong-discard-motion.css","mahjong-table-center.css","mahjong-table-edge.css","mahjong-camera.css","mahjong-call-announcement.css","mahjong-standing-tile.css"];
const css=cssFiles.map(file=>readFileSync(`src/app/mahjong/${file}`,"utf8")).join("\n");
const harness=`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));let current, busy=false;
function paint(){flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={current} ownSeat={0} host connected busy={busy} motionCanAnimate={false} onChoice={async choice=>{busy=true;paint();try{current=await window.realResultChoice({decisionId:current.game.decisionId,choiceId:choice.id});}finally{busy=false;paint();}}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/></div></main>));}
window.resultProbe={render:room=>{current=room;paint();},dispose:()=>root.unmount()};`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,metafile:true,jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'}});
const sha=(s:string|Buffer)=>createHash("sha256").update(s).digest("hex");
writeFileSync(`${out}/manifest.json`,JSON.stringify({cssSha:sha(css),bundleSha:sha(bundle.outputFiles[0].text),sources:Object.keys(bundle.metafile!.inputs).filter(f=>!f.startsWith('<')).map(file=>({file,sha:sha(readFileSync(file))}))},null,2));
const results:unknown[]=[];
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch({headless:true});
 try {for(const variant of ["sanma","yonma"] as const) for(const viewport of [{width:667,height:375},{width:1440,height:810}]) {
  const label=`${engine.name()}-${variant}-${viewport.width}`;
  const count=variant==="sanma"?3:4;
  const users=Array.from({length:count},(_,seat)=>({userId:randomUUID(),displayName:seat===1?"玩家乙".repeat(13)+"乙":seat===2?"玩家丙".repeat(13)+"丙":`玩家${seat}`}));
  const store=new RoomStore({gameFactory:()=>physicalEngine(variant,{1:"p123456789s123z2",2:"p123456789s123z2"},"z2")});
  const send=(seat:number,input:object)=>store.execute(users[seat],{nonce:randomUUID(),...input} as MahjongCommand)!;
  const room=send(0,{action:"create",variant,mode:"east"});
  for(let s=1;s<count;s++)send(s,{action:"join",code:room.code});
  for(let s=0;s<count;s++)send(s,{action:"ready",roomId:room.id,ready:true});
  send(0,{action:"start",roomId:room.id});
  const view=()=>store.view(users[0].userId)!;
  const choose=(seat:number,type:Choice['type'],value?:string)=>{const g=store.view(users[seat].userId)!.game!,choice=g.choices.find(c=>c.type===type&&(value===undefined||c.value===value));assert.ok(choice);return send(seat,{action:"respond",roomId:room.id,decisionId:g.decisionId,choiceId:choice.id});};
  choose(0,"discard","z2_");choose(1,"ron");choose(2,"ron");
  const old=view().game!.players.map(p=>p.score),handId=view().game!.handId;
  assert.equal(view().game!.settlementFlow!.detailCount,2);
  const context=await browser.newContext({viewport});const page=await context.newPage();
  page.on("pageerror",error=>console.error(`${label}: ${error.stack}`));
  const acknowledgements:unknown[]=[];
  await page.exposeFunction("realResultChoice",(input:{decisionId:string;choiceId:string})=>{
   const previous=view().game!;assert.equal(input.decisionId,previous.decisionId);
   send(0,{action:"respond",roomId:room.id,...input});
   if(previous.settlementFlow!.stage === "scores") for(let seat=1;seat<count;seat++) { choose(seat,"ack"); choose(seat,"ack"); choose(seat,"ack"); }
   acknowledgements.push({phase:previous.settlementFlow!.stage,index:previous.settlementFlow!.detailIndex,at:previous.settlementFlow!.elapsedMs,choiceId:input.choiceId});
   return view();
  });
  await page.route('https://mahjong.local/images/**',async route=>{const pathname=new URL(route.request().url()).pathname;await route.fulfill({status:200,contentType:pathname.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync(`public${pathname}`)});});
  await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*:before,*:after{box-sizing:border-box}${css}</style><div id="root"></div>`);
  await page.addScriptTag({content:`globalThis.process={env:{NODE_ENV:"development"}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});\n${bundle.outputFiles[0].text}`});
  await page.evaluate(r=>(window as any).resultProbe.render(r),view());
  const detail=page.getByRole('region',{name:'和牌详情'});
  await detail.waitFor();
  assert.equal(await detail.locator('[data-settlement-seat]').count(),0);
  assert.equal(await detail.locator('.mahjong-winning-hand [data-tile-face]').count(),14);
  assert.equal(await detail.locator('.mahjong-winning-hand__row').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`${label}: the full winning hand must fit beside its winning tile`);
  await detail.locator(".mahjong-settlement-panel__content").evaluate(el => { el.scrollTop=el.scrollHeight; });
  await detail.getByRole('button',{name:/继续/}).click();
  await page.waitForFunction(()=>document.querySelector('.mahjong-settlement-panel__page')?.textContent?.includes('第 2'));
  assert.deepEqual(view().game!.players.map(p=>p.score),old);
  assert.equal(store.view(users[1].userId)!.game!.settlementFlow!.detailIndex,0);
  assert.equal(await detail.locator('.mahjong-settlement-panel__content').evaluate(el=>el.scrollTop),0);
  await detail.getByRole('button',{name:/继续/}).click();
  const scores=page.getByRole('region',{name:'本局收支'});await scores.waitFor();
  const initial=await scores.getByTestId('settlement-score-0').textContent();
  assert.equal(initial,old[0].toLocaleString('en-US'));
  assert.equal(await scores.locator('.mahjong-winning-hand,ul').count(),0);
  const flow=view().game!.settlementFlow!;const expected=flow.newScores.slice();
  assert.deepEqual(flow.delta,variant==='sanma'?[-5200,2600,2600]:[-5200,2600,2600,0]);
  await page.waitForFunction(()=>document.querySelector('[data-testid="settlement-score-0"]')?.textContent !== document.querySelector('.mahjong-settlement-panel__balance-before')?.textContent?.replace('结算前 ',''));
  await page.screenshot({path:`${out}/${label}-roll.png`});
  await page.waitForFunction(want=>document.querySelector('[data-testid="settlement-score-0"]')?.textContent===want,expected[0].toLocaleString('en-US'));
  const button=scores.getByRole('button',{name:/继续/});assert.equal(await button.isDisabled(),true);
  const geometry=await scores.evaluate(panel=>{
   const content=panel.querySelector<HTMLElement>('.mahjong-settlement-panel__content')!,footer=panel.querySelector<HTMLElement>('.mahjong-settlement-panel__actions')!,btn=footer.querySelector('button')!;
   content.scrollTop=content.scrollHeight;const cb=content.getBoundingClientRect(),fb=footer.getBoundingClientRect(),b=btn.getBoundingClientRect();
   return {footerAboveContent:fb.top>=cb.bottom-1,inside:b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight,hit:btn.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),width:b.width,height:b.height,client:content.clientWidth,scroll:content.scrollWidth};
  });
  assert.ok(geometry.footerAboveContent&&geometry.inside&&geometry.hit&&geometry.width>=44&&geometry.height>=44&&geometry.scroll<=geometry.client+1,JSON.stringify(geometry));
  await page.screenshot({path:`${out}/${label}-final.png`});
  if(engine===chromium&&variant==='sanma'&&viewport.width===667)await page.waitForFunction(()=>!document.querySelector('.mahjong-settlement-panel'),undefined,{timeout:10000});
  else await button.click();
  await page.waitForFunction(()=>!document.querySelector('.mahjong-settlement-panel'));
  assert.equal(acknowledgements.length,3);assert.deepEqual(acknowledgements.map((a:any)=>a.phase),['detail','detail','scores']);
  assert.equal(view().game!.handId,handId!+1);assert.deepEqual(view().game!.players.slice().sort((a,b)=>a.seat-b.seat).map(p=>p.score),expected);
  results.push({label,initial,expected,geometry,acknowledgements});writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
  await context.close();console.log(`PASS ${label}: two native details → one real net score stage → next hand`);
 }}finally{await browser.close();}
}
console.log(`PASS ${results.length} browser/variant/viewport cases in ${out}`);
