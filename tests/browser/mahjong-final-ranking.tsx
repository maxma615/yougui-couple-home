import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {build} from "esbuild";
import {chromium,webkit} from "@playwright/test";
import {RoomStore} from "../../src/modules/mahjong/rooms";
import {drawEngine} from "../fixtures/mahjong-draw-game";
import type {MahjongCommand} from "../../src/modules/mahjong/types";
const out=`.local/audit/final-ranking-browser-${Date.now()}`;mkdirSync(out,{recursive:true});
const css=readFileSync('src/app/mahjong/mahjong.css','utf8');
const harness=`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.renderRanking=p=>flushSync(()=>root.render(<div className="mahjong-page"><GameRoom room={p.room} ownSeat={p.ownSeat} host={p.host} busy={p.busy} connected={p.connected} onChoice={()=>{}} onLeave={()=>{}} onRematch={()=>window.rematches++} onFinish={()=>window.finishes++}/></div>));window.rematches=0;window.finishes=0;`;
const bundle=await build({stdin:{contents:harness,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json'});
function final(variant:'sanma'|'yonma'){
 const count=variant==='sanma'?3:4;let now=1000;
 const users=Array.from({length:count},(_,seat)=>({userId:randomUUID(),displayName:seat===0?'长名字验证：一起打麻将的朋友':'牌友'+seat}));
 const store=new RoomStore({now:()=>now,gameFactory:v=>drawEngine(v,[],{hands:['m19p369s369z14577','m19p147s258z13566','m19p258s147z23477','m2346p3468s2468z3']})});
 const send=(seat:number,input:object)=>store.execute(users[seat],{...input,nonce:randomUUID()} as MahjongCommand)!;
 const room=send(0,{action:'create',mode:'east',variant});for(let seat=1;seat<count;seat++)send(seat,{action:'join',code:room.code});
 for(let seat=0;seat<count;seat++)send(seat,{action:'ready',roomId:room.id,ready:true});send(0,{action:'start',roomId:room.id});
 const view=()=>store.view(users[0].userId)!;
 for(let step=0;step<3000&&view().status!=='finished';step++)for(let seat=0;seat<count;seat++){
  const game=store.view(users[seat].userId)!.game!;
  const choice=game.choices.find(c=>c.type==='ack')??game.choices.find(c=>c.type==='pass')??game.choices.find(c=>c.type==='discard'&&c.value?.endsWith('_'));
  if(choice){now++;send(seat,{action:'respond',roomId:room.id,decisionId:game.decisionId,choiceId:choice.id});break;}
 }
 assert.equal(view().status,'finished');const end=view();return {room:end,ranking:end.game!.ranking!,flow:end.game!.rankingFlow,members:end.members,ownSeat:0,host:true,connected:true,busy:false};
}
const results=[];
for(const engine of [chromium,webkit]){const browser=await engine.launch();try{
 for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}]){
  const page=await browser.newPage({viewport});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.setContent(`<style>body{margin:0;line-height:1.65}*,*:before,*:after{box-sizing:border-box}${css}</style><div id="root"></div>`);
   await page.addScriptTag({content:`globalThis.process={env:{NODE_ENV:"development"}};globalThis.__name=(t,v)=>Object.defineProperty(t,"name",{value:v,configurable:true});${bundle.outputFiles[0].text}`});const props=final(variant);
   await page.evaluate(p=>(window as any).renderRanking(p),props);
   assert.equal(await page.locator('[data-ranking-visible="true"]').count(),0);
   const exit=page.getByRole('button',{name:'结束并解散牌桌'});const exitBox=await exit.boundingBox();assert.ok(exitBox&&exitBox.width>=44&&exitBox.height>=44,JSON.stringify({exitBox,viewport}));
   await exit.click();assert.equal(await page.evaluate(()=>(window as any).finishes),1);
   await page.waitForFunction(()=>document.querySelector('[data-ranking-visible="true"]'));
   assert.equal(await page.getByRole('button',{name:'再开一场'}).count(),0);
   await page.getByRole('button',{name:'再开一场'}).waitFor();
   assert.equal(await page.locator('[data-ranking-visible="true"]').count(),props.ranking.length);
   const bounds=await page.evaluate(()=>{const button=document.querySelector('.mahjong-ranking__actions button')!.getBoundingClientRect();const box=document.querySelector('.mahjong-ranking')!.getBoundingClientRect();return {button:{top:button.top,bottom:button.bottom,height:button.height},box:{left:box.left,right:box.right,bottom:box.bottom},width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth};});
   assert.ok(bounds.button.height>=44);assert.ok(bounds.box.left>=0&&bounds.box.right<=viewport.width);assert.ok(bounds.scrollWidth<=viewport.width);assert.ok(bounds.button.bottom<=viewport.height,JSON.stringify(bounds));
   await page.getByRole('button',{name:'再开一场'}).click();assert.equal(await page.evaluate(()=>(window as any).rematches),1);
   const label=`${engine.name()}-${variant}-${viewport.width}`;await page.screenshot({path:`${out}/${label}.png`});
   await page.evaluate(p=>(window as any).renderRanking({...p,room:{...p.room,game:{...p.room.game,rankingFlow:{...p.flow,elapsedMs:6000}}}}),props);
   assert.equal(await page.locator('[data-ranking-visible="true"]').count(),props.ranking.length);
   assert.deepEqual(errors,[]);results.push({label,bounds,rows:props.ranking.length});
  }finally{await page.close();}
 }
}finally{await browser.close();}}
writeFileSync(`${out}/summary.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({out,passed:results.length}));
