// Display geometry uses physical tile allocation and bounded global kan counts.
// These snapshots are display fixtures; real engine progression is checked separately.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {chromium,webkit} from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import {GameRoom} from "../../src/components/mahjong/mahjong-client";
import type {GameVariant,RoomView} from "../../src/modules/mahjong/types";

const melds=["s111+","p2222","s3333=","z222=2"];
for(const meld of melds)assert.equal((Majiang.Shoupai as unknown as {valid_mianzi(value:string):string|undefined}).valid_mianzi(meld),meld);
const css=["mahjong.css","mahjong-river.css","mahjong-meld.css","mahjong-interaction.css","mahjong-discard-motion.css","mahjong-table-center.css","mahjong-table-edge.css"].map(file=>readFileSync(`src/app/mahjong/${file}`,"utf8")).join("\n");
function fixture(variant:GameVariant,ownSeat:number,offset:number,m:number):RoomView {
 const capacity=variant==="sanma"?3:4,sideSeat=(ownSeat+offset)%capacity;
 const available: string[]=new Majiang.Shan(Majiang.rule())._pai.filter((tile:string)=>variant!=="sanma"||!/^m[2-8]$/.test(tile)).sort();
 const take=(tile:string)=>{const i=available.indexOf(tile);assert.ok(i>=0,`physical tile exhausted: ${tile}`);return available.splice(i,1)[0]};
 const groups=melds.slice(0,m);
 assert.ok(groups.filter(group=>group.replace(/\D/g,"").length===4).length<=3,"fixture must stay below the global four-kan limit");
 for(const group of groups)for(const digit of group.slice(1).replace(/\D/g,""))take(group[0]+digit);
 if(variant==="sanma")for(let i=0;i<4;i++)take("z4");
 const indicator=take("p5");
 const sideHand=available.splice(0,13-3*m);
 const ownHand=available.splice(0,14),drawnTile=ownHand.at(-1)!;
 const players=Array.from({length:capacity},(_,seat)=>{
  const hand=seat===ownSeat?ownHand:seat===sideSeat?sideHand:available.splice(0,13);
  return {seat,wind:seat,score:variant==="sanma"?35000:25000,handCount:hand.length,discards:[],melds:seat===sideSeat?groups:[],riichi:false,...(variant==="sanma"?{nuki:seat===ownSeat?1:seat===sideSeat?3:0}:{})};
 });
 return {id:"clearance-fixture",code:"ABCDEFGH",hostUserId:String(ownSeat),mode:"east",variant,status:"playing",version:1,mySeat:ownSeat,
  members:players.map(p=>({userId:String(p.seat),seat:p.seat,displayName:`牌友${p.seat}`,kind:"human",ready:true,connected:true})),
  game:{gameInstanceId:"clearance",handId:1,decisionId:"display",phase:"zimo",roundWind:0,roundNumber:1,honba:0,remainingTiles:available.length,riichiSticks:0,turnSeat:ownSeat,hand:ownHand,drawnTile,choices:[],doraIndicators:[indicator],settlement:null,ranking:null,players}};
}
let cases=0;
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const page=await browser.newPage();
  await page.route("https://mahjong.local/images/**",route=>route.fulfill({status:200,contentType:route.request().url().endsWith(".svg")?"image/svg+xml":"image/webp",body:readFileSync("public"+new URL(route.request().url()).pathname)}));
  for(const variant of ["sanma","yonma"] as const){
   const capacity=variant==="sanma"?3:4;
   for(let ownSeat=0;ownSeat<capacity;ownSeat++)for(let offset=1;offset<capacity;offset++)for(let m=1;m<=4;m++)for(const width of [667,844,1280,1440]){
    const room=fixture(variant,ownSeat,offset,m),height=({667:375,844:390,1280:720,1440:810} as Record<number,number>)[width];
    await page.setViewportSize({width,height});
    const noop=()=>{},html=renderToStaticMarkup(<GameRoom room={room} host busy={false} ownSeat={ownSeat} connected motionCanAnimate={false} onChoice={noop} onFinish={noop} onLeave={noop} onRematch={noop}/>);
    await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><main class="mahjong-page"><div class="mahjong-shell">${html}</div></main>`);
    await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(i=>i.complete&&i.naturalWidth===300));
    assert.equal(await page.getByTestId("mahjong-hand").locator("[data-tile-face]").count(),14);
    const sideSeat=(ownSeat+offset)%capacity;
    assert.equal(await page.locator(`[data-motion-rack-seat="${sideSeat}"] > i`).count(),13-3*m);
    assert.equal(await page.getByTestId(`player-${sideSeat}`).locator(".mahjong-player__melds > .mahjong-meld").count(),m);
    if(variant==="sanma")assert.equal(await page.locator('.mahjong-nuki-tray [data-tile-face="z4"]').count(),4);
    const issues=await page.evaluate(()=>{
     const problems:string[]=[],table=document.querySelector(".mahjong-table")!.getBoundingClientRect();
     for(const el of document.querySelectorAll<HTMLElement>(".mahjong-table__position .mahjong-tile,.mahjong-table__position .mahjong-meld__back,.mahjong-table__position .mahjong-player__hidden > i,.mahjong-hand .mahjong-tile,.mahjong-nuki-tray .mahjong-tile,.mahjong-table__dora .mahjong-tile")){
      if(el.closest(".mahjong-meld__stack [data-layer='called']"))continue; // Intentional kakan stack is checked by meld tests.
      const b=el.getBoundingClientRect();
      if(b.left<table.left-.5||b.top<table.top-.5||b.right>table.right+.5||b.bottom>table.bottom+.5)problems.push(`outside table: ${el.className}`);
      for(const [x,y] of [[.16,.16],[.84,.16],[.5,.5],[.16,.84],[.84,.84]]){
       const hit=document.elementFromPoint(b.left+b.width*x,b.top+b.height*y);
       if(!hit||!el.contains(hit))problems.push(`${el.className||"back"} (${x},${y}) covered by ${hit?.className}`);
      }
     }
     return problems;
    });
    if(issues.length)await page.screenshot({path:`.local/clearance-failure-${engine.name()}-${variant}-${ownSeat}-${offset}-${m}-${width}.png`});
    assert.deepEqual(issues,[],`${engine.name()} ${variant} own=${ownSeat} offset=${offset} melds=${m} ${width}: full tile faces must clear HUD and hand regions`);
    cases++;
   }
  }
 }finally{await browser.close();}
}
console.log(`${cases}/576 physical-allocation mixed-meld clearance fixtures passed across every seat and table edge.`);
