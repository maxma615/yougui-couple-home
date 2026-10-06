// Initial real-engine projections from every seat; static layout proof, not Socket/Android acceptance.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {chromium,webkit} from "@playwright/test";
import {GameRoom} from "../../src/components/mahjong/mahjong-client";
import {RiichiGame} from "../../src/modules/mahjong/engine";
import {SanmaGame} from "../../src/modules/mahjong/sanma";
import type {RoomView} from "../../src/modules/mahjong/types";
const css=["mahjong.css","mahjong-river.css","mahjong-meld.css","mahjong-interaction.css","mahjong-discard-motion.css"].map(f=>readFileSync("src/app/mahjong/"+f,"utf8")).join("\n");
let passed=0;
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage();await page.emulateMedia({reducedMotion:"reduce"});
  await page.route("https://mahjong.local/images/**",async r=>{const p=new URL(r.request().url()).pathname;await r.fulfill({status:200,contentType:p.endsWith(".svg")?"image/svg+xml":"image/webp",body:readFileSync("public"+p)});});
  for(const variant of ["sanma","yonma"] as const){
   const capacity=variant==="sanma"?3:4;const names=Array.from({length:capacity},(_,i)=>`牌友${i}`);
   const game=variant==="sanma"?new SanmaGame("east",names):new RiichiGame("east",names);
   for(let ownSeat=0;ownSeat<capacity;ownSeat++)for(const [width,height] of [[667,375],[844,390],[1280,720],[1440,810]]){
    const view=game.view(ownSeat);const room:RoomView={id:"seat-layout",code:"ABCDEFGH",hostUserId:"0",variant,mode:"east",status:"playing",version:1,mySeat:ownSeat,game:view,members:names.map((displayName,seat)=>({userId:String(seat),seat,displayName,kind:"human",ready:true,connected:true}))};
    const noop=()=>{};const html=renderToStaticMarkup(<GameRoom room={room} ownSeat={ownSeat} host={ownSeat===0} busy={false} connected onChoice={noop} onFinish={noop} onRematch={noop} onLeave={noop}/>);
    await page.setViewportSize({width,height});await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*{box-sizing:border-box}${css}</style><main class="mahjong-page"><div class="mahjong-shell">${html}</div></main>`);
    await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(i=>i.complete&&i.naturalWidth===300&&i.naturalHeight===400));
    assert.equal(await page.locator(".mahjong-table__own [data-seat]").getAttribute("data-seat"),String(ownSeat));
    assert.equal(await page.getByTestId("mahjong-hand").locator("[data-tile-face]").count(),view.hand.length);
    for(const p of view.players){
     const offset=(p.seat-ownSeat+capacity)%capacity;
     assert.equal(await page.locator(`.mahjong-center-seat--${offset} > span`).textContent(),["東","南","西","北"][p.wind]);
     if(offset!==0)assert.equal(await page.locator(`.mahjong-table__position [data-motion-rack-seat="${p.seat}"] > i`).count(),p.handCount);
    }
    const issues=await page.evaluate(()=>{
     const problems:string[]=[];
     for(const el of document.querySelectorAll(".mahjong-table__position .mahjong-player__hidden > i,.mahjong-player__head strong,.mahjong-hand [data-tile-face],.mahjong-table__dora [data-tile-face]")){
      const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
      if(b.left<-.5||b.top<-.5||b.right>innerWidth+.5||b.bottom>innerHeight+.5||!hit||!el.contains(hit))problems.push(`${el.className} outside/covered: ${JSON.stringify({x:b.x,y:b.y,w:b.width,h:b.height})}`);
     }return problems;
    });
    assert.deepEqual(issues,[],`${engine.name()} ${variant} seat=${ownSeat} ${width}`);
    passed++;console.log(`PASS ${engine.name()} ${variant} seat=${ownSeat} ${width}: actual hands, backs, winds, indicators`);
   }
  }
 }finally{await browser.close();}
}
console.log(`${passed}/56 actual-engine seat layout cases passed.`);
