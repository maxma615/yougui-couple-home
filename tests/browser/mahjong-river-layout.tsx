import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, webkit } from "@playwright/test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { MahjongRiver } from "../../src/components/mahjong/mahjong-river";
const css = ["mahjong.css", "mahjong-river.css"].map(p=>readFileSync("src/app/mahjong/"+p,"utf8")).join("\n");
const discards=["m1","m2","m3*","m4","m5+","m6","m7","m8","m9","p1","p2","p3","p4","p5","p6","p7","p8","p9","s1","s2","s3"];
let cases=0;
for(const [name,engine] of [["chromium",chromium],["webkit",webkit]] as const){
 const browser=await engine.launch();
 try{
  const page=await browser.newPage({reducedMotion:"reduce"});
  await page.route("https://mahjong.local/images/**",async route=>route.fulfill({body:readFileSync("public"+new URL(route.request().url()).pathname),contentType:"image/svg+xml"}));
  for(const [width,height] of [[667,375],[844,390],[1440,810]]){
   await page.setViewportSize({width,height});
   for(let offset=0;offset<4;offset++){
    const player={seat:0,wind:0,score:25000,handCount:13,melds:[],riichi:true,discards};
    await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0}*{box-sizing:border-box}${css}</style><main class="mahjong-page"><div class="mahjong-shell"><section class="mahjong-game"><div class="mahjong-table">${renderToStaticMarkup(<MahjongRiver player={player} offset={offset}/>)}</div></section></div></main>`);
    await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>("img")].every(i=>i.complete&&i.naturalWidth===300));
    const result=await page.evaluate(()=>{
     const upright=document.querySelector<HTMLElement>('[data-river-index="1"]')!;
     const sideways=document.querySelector<HTMLElement>('[data-river-index="2"]')!;
     const slots=[...document.querySelectorAll<HTMLElement>('.mahjong-river__tile')];
     const faces=slots.map(e=>e.querySelector<HTMLElement>('[data-tile-face]')!.getBoundingClientRect());
     const overlap=faces.some((a,i)=>faces.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5));
     return {rows:[...document.querySelectorAll('[data-river-row]')].map(e=>e.children.length),upright:parseFloat(getComputedStyle(upright).width),sideways:parseFloat(getComputedStyle(sideways).width),overlap,visible:faces.every(r=>r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight)};
    });
    assert.deepEqual(result.rows,[6,6,6,2]);assert.ok(result.sideways/result.upright>1.39&&result.sideways/result.upright<1.41,JSON.stringify(result));assert.equal(result.overlap,false,`${name} ${width} seat${offset}`);assert.equal(result.visible,true,`${name} ${width} seat${offset}`);cases++;
    if(width===844&&offset===0)await page.screenshot({path:`.local/mahjong-river-layout-${name}-844.png`});
   }
  }
 }finally{await browser.close();}
}
console.log(`${cases} decoded-image river geometry scenarios passed (both engines, 3 viewports, 4 directions).`);
