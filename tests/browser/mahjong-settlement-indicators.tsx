import assert from "node:assert/strict";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {build} from "esbuild";
import {chromium,webkit} from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import {RiichiGame} from "../../src/modules/mahjong/engine";
import {SanmaGame} from "../../src/modules/mahjong/sanma";
import {SanmaWall,sanmaTiles} from "../../src/modules/mahjong/sanma-wall";
import {SettlementSequenceGame} from "../../src/modules/mahjong/settlement-sequence";
import type {GameView,RoomView} from "../../src/modules/mahjong/types";
const parse=(s:string)=>[...s.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>m[1]+n));
const ready='p123456s123z5552';
type E={view:(seat:number)=>GameView;respond:(seat:number,decision:string,choice:string)=>unknown};
function make(variant:'yonma'|'sanma',hands:Record<number,string>,draws:string[],replacement?:string):E {
 const count=variant==='yonma'?4:3;
 const build=(physical:string[])=>{
  const pool=physical.slice(),take=(t:string)=>{const i=pool.indexOf(t);assert.ok(i>=0,`unavailable physical tile ${t}`);return pool.splice(i,1)[0]};
  const dealt=Array.from({length:count},(_,seat)=>hands[seat]?parse(hands[seat]).map(take):[]);
  const drawn=draws.map(take),indicators=['m1','m1'].map(take),replacementTile=replacement?take(replacement):undefined;
  for(const hand of dealt){if(!hand.length)hand.push(...pool.splice(0,13));assert.equal(hand.length,13)}
  if(replacementTile)pool.unshift(replacementTile);
  return {pool,dealt,drawn,indicators};
 };
 if(variant==='sanma')return new SanmaGame('east',['A','B','C'],{dealer:0,wallFactory:()=>{
  const physical=sanmaTiles(),{pool,dealt,drawn,indicators}=build(physical),reserve=pool.splice(0,4);
  indicators.push(...pool.splice(0,8));const wall=[...dealt.flat(),...drawn,...pool,...reserve,...indicators];
  assert.deepEqual(wall.slice().sort(),physical.slice().sort());return new SanmaWall(wall);
 }});
 return new RiichiGame('east',['A','B','C','D'],{dealer:0,wallFactory:rule=>{
  const wall=new Majiang.Shan(rule),physical=wall._pai.slice(),{pool,dealt,drawn,indicators}=build(physical);
  // Official library indicator offsets 4/9 of the remaining wall. Reserve exact non-dora faces there.
  pool.splice(4,0,indicators[0]);pool.splice(9,0,indicators[1]);
  wall._pai=[...pool,...[...dealt.flat(),...drawn].reverse()];wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];
  assert.deepEqual(wall._pai.slice().sort(),physical.slice().sort());return wall;
 }});
}
function act(g:E,seat:number,id:string){const v=g.view(seat);assert.ok(v.choices.some(c=>c.id===id),`seat${seat} lacks ${id}, phase${v.phase}, choices${v.choices.map(c=>c.id)}`);g.respond(seat,v.decisionId,id)}
function pass(g:E,n:number){for(let guard=0;guard<12;guard++){let found=false;for(let s=0;s<n;s++){if(g.view(s).choices.some(c=>c.type==='pass')){act(g,s,'pass');found=true}}if(!found)return;}throw Error('reaction guard')}

const out=`.local/audit/settlement-indicators-native-${Date.now()}`;mkdirSync(out,{recursive:true});
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.paint=r=>flushSync(()=>root.render(<main className="mahjong-page"><GameRoom room={r} ownSeat={0} connected busy={false} host motionCanAnimate={false} onChoice={()=>{}} onLeave={()=>{}} onFinish={()=>{}} onRematch={()=>{}}/></main>));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic'});
const css=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>readFileSync(`src/app/mahjong/${m[1]}`,'utf8')).join('\n');
const results=[];
for(const engine of [chromium,webkit]){const browser=await engine.launch();try{for(const variant of ['sanma','yonma'] as const)for(const width of [667,1440])for(const scenario of ['riichi','kan'] as const){
 const n=variant==='sanma'?3:4;
 let g:SettlementSequenceGame;
 if(scenario==='riichi'){
  const draws=n===4?['z6','z7','m9','s9','s8','z2']:['z6','z7','m9','s9','z2'];
  g=new SettlementSequenceGame(make(variant,{1:ready},draws) as RiichiGame|SanmaGame,n);
  act(g,0,'discard:z6_');pass(g,n);act(g,1,'riichi:z7_');pass(g,n);
  assert.equal(g.view(1).players[1].riichi,true);
  for(let i=2;i<draws.length-1;i++){const seat=g.view(0).turnSeat;act(g,seat,'discard:'+g.view(seat).drawnTile+'_');pass(g,n)}act(g,1,'tsumo');
 }else{
  g=new SettlementSequenceGame(make(variant,{0:'p1111s123456z222'},['p9'],'p9') as RiichiGame|SanmaGame,n);
  act(g,0,'kan:p1111');pass(g,n);assert.equal(g.view(0).doraIndicators.length,2);act(g,0,'tsumo');
 }
 const game=g.view(0);if(scenario==='riichi')assert.ok(game.settlement!.uraIndicators.length);else assert.equal(game.settlement!.uraIndicators.length,0);
 assert.equal(game.settlementFlow!.stage,'detail');
 const r:RoomView={id:'native-indicators',code:'ABCDEFGH',variant,mode:'east',status:'playing',version:1,mySeat:0,hostUserId:'0',game,members:Array.from({length:n},(_,seat)=>({userId:String(seat),displayName:`玩家${seat}`,seat,kind:'human',ready:true,connected:true}))};
 const page=await browser.newPage({viewport:{width,height:width===667?375:810}});
 await page.route('https://mahjong.local/images/**',route=>{const p=new URL(route.request().url()).pathname;return route.fulfill({contentType:p.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync('public'+p)})});
 await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0}*{box-sizing:border-box}${css}</style><div id="root"></div>`);
 await page.addScriptTag({content:`globalThis.process={env:{NODE_ENV:"development"}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v});${bundle.outputFiles[0].text}`});
 await page.evaluate(r=>(window as any).paint(r),r);
 const panel=page.getByRole('region',{name:'和牌详情'});await panel.waitFor();
 for(const [name,values] of [['宝牌指示牌',game.doraIndicators],['里宝牌指示牌',game.settlement!.uraIndicators]] as const){const row=panel.getByRole('group',{name,exact:true});assert.deepEqual(await row.locator('[data-tile-face]').evaluateAll(els=>els.map(el=>el.getAttribute('data-tile-face'))),values);assert.equal(await row.locator('.mahjong-indicator-back').count(),5-values.length);assert.ok(await row.evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
 await panel.locator('.mahjong-result-indicators').scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.querySelectorAll('.mahjong-result-indicators img')].every(i=>(i as HTMLImageElement).complete&&(i as HTMLImageElement).naturalWidth>0));
 const label=`${engine.name()}-${variant}-${width}-${scenario}`;await panel.locator('.mahjong-result-indicators').screenshot({path:`${out}/${label}.png`});
 results.push({label,dora:game.doraIndicators,ura:game.settlement!.uraIndicators,scenario});await page.close();console.log('PASS '+label);
 }}finally{await browser.close()}}
writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(`PASS ${results.length} native accepted-riichi/kan sequences: ${out}`);
