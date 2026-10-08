import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {build} from "esbuild";
import {chromium,webkit} from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import {RiichiGame} from "../../src/modules/mahjong/engine";
import {SanmaGame} from "../../src/modules/mahjong/sanma";
import {SanmaWall,sanmaTiles} from "../../src/modules/mahjong/sanma-wall";
import type {RoomView} from "../../src/modules/mahjong/types";
const notice=process.env.NUKI_NOTICE==="true";
const touch=process.env.NUKI_TOUCH!=="false";
const extendedOnly=process.env.NUKI_EXTENDED_ONLY==="true";
const selectedOnly=process.env.NUKI_SELECTED_ONLY==="true";
const out=`.local/audit/mahjong-repeated-nuki-${touch?"touch":"mouse"}${notice?"-notice":""}-${Date.now()}`;mkdirSync(out,{recursive:false});
const digest=(v:string|Buffer)=>createHash("sha256").update(v).digest("hex");
const sourceFiles=["src/components/mahjong/action-placement.ts","src/components/mahjong/use-action-placement.ts","src/components/mahjong/mahjong-client.tsx","src/components/mahjong/mahjong-solid-flight-tile.tsx","src/modules/mahjong/sanma.ts","src/modules/mahjong/sanma-wall.ts","tests/browser/mahjong-repeated-nuki.tsx"];
const names=["甲","乙","丙"];
const tiles=(v:string)=>[...v.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>m[1]+n));
type Kind="bare"|"pon"|"open-kan"|"abort-quad"|"multi-kan"|"late-bare"|"yonma-quad"|"yonma-multi";
function fixture(count:number,kind:Kind){
 const yonma=kind.startsWith("yonma-");
 const pool=yonma?(new Majiang.Shan(Majiang.rule()))._pai.slice().sort():sanmaTiles();const take=(t:string)=>{const i=pool.indexOf(t);assert.ok(i>=0);return pool.splice(i,1)[0]};
 const open=kind==="pon"||kind==="open-kan";
 const actor=open?1:0;
 const hands=Array.from({length:yonma?4:3},()=>[] as string[]);
 hands[actor]=tiles(kind==="abort-quad"?"m19p19s19z1234444":(kind==="multi-kan"||kind==="yonma-multi")?"p1111s1111z4444z1":!open?"p123s123789z4444":kind==="pon"?"p55s123789z4444z1":"p055s123789z4444").map(take);
 const draws=(kind==="abort-quad"?["p2"]:(kind==="multi-kan"||kind==="yonma-multi")?["z1"]:!open?["p9"]:kind==="pon"?["p5","z2","z3","s9"]:["p5"]).map(take);
 const reserve=((kind==="multi-kan"||kind==="yonma-multi")?["p2","p3","p4","s2"]:kind==="open-kan"?["s9","p1","p2","p3"]:["p1","p2","p3","s1"]).map(take);
 const refill=take(kind==="open-kan"?"s1":(kind==="multi-kan"||kind==="yonma-multi")?"s3":"s2");
 for(const hand of hands)if(!hand.length)hand.push(...pool.splice(0,13));
 const indicators=pool.splice(0,10);
 const prefix=kind==="late-bare"?pool.splice(0,36):[];
 assert.equal(prefix.length,kind==="late-bare"?36:0);
 const wall=yonma?null:new SanmaWall([...hands.flat(),...prefix,...draws,...pool,refill,...reserve,...indicators]);
 const fixtureNames=yonma?[...names,"丁"]:names;
 const game=yonma?new RiichiGame("east",fixtureNames,{dealer:0,wallFactory:rule=>{
  const w=new Majiang.Shan(rule);const physical=w._pai.slice().sort();
  w._pai=[...pool,refill,...reserve,...indicators,...[...hands.flat(),...prefix,...draws].reverse()];
  assert.deepEqual(w._pai.slice().sort(),physical,"full physical four-player wall");
  w._baopai=[w._pai[4]];w._fubaopai=[w._pai[9]];return w;
 }}):new SanmaGame("east",fixtureNames,{dealer:0,wallFactory:()=>wall!});
 const pass=()=>{for(let seat=0;seat<fixtureNames.length;seat++){const v=game.view(seat),c=v.choices.find(c=>c.type==="pass");if(c)game.respond(seat,v.decisionId,c.id)}};
 const choose=(seat:number,type:string,value?:string)=>{const v=game.view(seat),c=v.choices.find(c=>c.type===type&&(value===undefined||c.value===value));assert.ok(c,`legal ${type}:${value}`);game.respond(seat,v.decisionId,c.id)};
 for(let i=0;i<prefix.length;i++){const seat=i%3;assert.equal(game.view(seat).drawnTile,prefix[i]);choose(seat,"discard",prefix[i]+"_");pass();}
 if(open){
  choose(0,"discard","p5_");choose(1,kind==="pon"?"pon":"kan");pass();
  assert.equal(game.view(actor).players[actor].melds.length,1);
  if(kind==="pon"){
   choose(actor,"discard","z1");pass();for(const seat of [2,0]){const tile=game.view(seat).drawnTile;assert.ok(tile);choose(seat,"discard",tile+"_");pass();}
  }
 }
 const dora=game.view(actor).doraIndicators.slice();
 for(let i=0;i<count;i++){
  choose(actor,"nuki");pass();assert.equal(game.view(actor).players[actor].nuki,i+1);
  assert.equal(game.view(actor).hand.length,open?11:14);assert.deepEqual(game.view(actor).doraIndicators,dora);
 }
 assert.equal(game.view(actor).choices.some(c=>c.type==="nuki"),!yonma&&count<4);
 if(kind==="abort-quad")assert.ok(game.view(actor).choices.some(c=>c.type==="abort"));
 if(kind==="multi-kan")assert.equal(game.view(actor).choices.filter(c=>c.type==="kan").length,3);
 return {game,actor,fixtureNames,yonma};
}
const harness = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));
window.nukiRender=(room,viewer)=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,ownSeat:viewer,connected:true,motionCanAnimate:false,host:true,busy:false,onChoice:choice=>window.chosenChoice=choice,onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))));
`;
const bundle = await build({
  stdin: { contents: harness, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const cssFiles = [...readFileSync("src/app/mahjong/page.tsx", "utf8")
  .matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(match => match[1]);
const css = cssFiles.map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");
writeFileSync(`${out}/bundle.js`, bundle.outputFiles[0].text);
writeFileSync(`${out}/source-manifest.json`, JSON.stringify({
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  font: digest(readFileSync("public/fonts/mahjong-brush.woff2")),
  mode: {touch,selectedOnly,extendedOnly,notice},
  files: Object.fromEntries(sourceFiles.map(file => [file, digest(readFileSync(file))])),
  cssFiles: Object.fromEntries(cssFiles.map(file => [file, digest(readFileSync(`src/app/mahjong/${file}`))])),
  bundle: digest(bundle.outputFiles[0].text),
}, null, 2));


const scenes:any[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const kind of ["bare","pon","open-kan","abort-quad","multi-kan","late-bare","yonma-quad","yonma-multi"] as const)for(const count of [0,1,2,3,4]){
  if(process.env.NUKI_KIND && kind!==process.env.NUKI_KIND)continue;
  if(extendedOnly && ["bare","pon","open-kan"].includes(kind))continue;
  if(["abort-quad","multi-kan","yonma-quad","yonma-multi"].includes(kind)&&count!==0)continue;
  if(selectedOnly && (kind!=="bare" || count>1))continue;
  const {game,actor,fixtureNames,yonma}=fixture(count,kind);
  for(const size of [{width:667,height:375},{width:844,height:390},{width:1440,height:810}]){
   const context=await browser.newContext({viewport:size,hasTouch:touch});
   try{const page=await context.newPage();assert.equal(await page.evaluate(()=>matchMedia("(pointer:coarse)").matches),touch);
    await page.route("https://mahjong.local/images/**",route=>{const p=new URL(route.request().url()).pathname;return route.fulfill({status:200,contentType:p.endsWith(".svg")?"image/svg+xml":"image/webp",body:readFileSync("public"+p)})});
    await page.route("https://mahjong.local/fonts/**", route => route.fulfill({status:200,contentType:"font/woff2",body:readFileSync("public"+new URL(route.request().url()).pathname)}));
    await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><div id="root"></div>`);
    await page.evaluate(() => document.fonts.load('40px "Yougui Mahjong Brush"', "立直自摸荣和吃碰杠拔北"));
    await page.addScriptTag({content:`globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}`});
    for(const viewer of fixtureNames.map((_,i)=>i)){
     if(selectedOnly && viewer!==actor)continue;
     const room:RoomView={id:"repeated-nuki",code:"ABCDEFGH",hostUserId:"0",mode:"east",variant:yonma?"yonma":"sanma",status:"playing",version:1,mySeat:viewer,game:game.view(viewer),members:fixtureNames.map((displayName,seat)=>({userId:String(seat),displayName,seat,kind:"human",ready:true,connected:true}))};
     await page.evaluate(({room,viewer})=>(window as any).nukiRender(room,viewer),{room,viewer});
     if(notice)await page.evaluate(()=>{
      document.querySelectorAll('.mahjong-notice').forEach(el=>el.remove());
      document.querySelector('.mahjong-shell')!.insertAdjacentHTML('afterbegin','<div class="mahjong-notice" role="alert"><span>请求未完成，请重试刚才的操作。</span><button type="button" aria-label="关闭提示">×</button></div>');
     });
     await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(i=>i.complete&&i.naturalWidth===300&&i.naturalHeight===400));
     await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
     const tray=page.locator(`[data-nuki-seat="${actor}"]`);assert.equal(await tray.count(),count?1:0);
     const button=page.locator('.mahjong-action-dock [data-choice-type="nuki"]');assert.equal(await button.count(),!yonma&&viewer===actor&&count<4?1:0);
     const measurements=await page.evaluate((actor)=>{
      const table=document.querySelector('.mahjong-table')!.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>(`[data-nuki-seat="${actor}"] [data-nuki-index]`)].map(tile=>{
       const cap=tile.querySelector<HTMLElement>('.mahjong-discard-flight__face-up-cap')!,r=cap.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
       const v=tile.querySelector<HTMLElement>('[data-nuki-volume]')!,style=getComputedStyle(v);
       return {index:Number(tile.dataset.nukiIndex),rect:r.toJSON(),visible:r.width>1&&r.height>1&&tile.contains(hit),within:r.left>=table.left-1&&r.top>=table.top-1&&r.right<=table.right+1&&r.bottom<=table.bottom+1,depth:parseFloat(style.getPropertyValue('--nuki-depth'))||parseFloat(style.height)*.4,face:tile.querySelector('[data-tile-face]')?.getAttribute('data-tile-face'),hit:hit?.getAttribute('class')};
      });
     },actor);
     const readOverlaps=()=>page.evaluate(()=>{
      const buttons=[...document.querySelectorAll('.mahjong-action-dock button')];
      const targets=[...document.querySelectorAll('.mahjong-notice,.mahjong-game__topline,.mahjong-table__dora,.mahjong-table__center,.mahjong-river__tile,.mahjong-opponent-rack .mahjong-standing-tile,[data-nuki-index] .mahjong-discard-flight__face-up-cap,.mahjong-nuki-tray > small,.mahjong-table__surface [data-meld-volume] [data-meld-surface="cap"]')];
      return buttons.flatMap(b=>{const r=b.getBoundingClientRect();return targets.flatMap(t=>{const q=t.getBoundingClientRect();return r.left<q.right&&r.right>q.left&&r.top<q.bottom&&r.bottom>q.top?[{choice:b.getAttribute('data-choice-type'),target:t.getAttribute('class'),buttonRect:r.toJSON(),targetRect:q.toJSON()}]:[]})});
     });
     const checkTargets=async()=>{
      const targets=await page.evaluate(minimum=>[...document.querySelectorAll('.mahjong-action-dock > button')].map(button=>{
       const r=button.getBoundingClientRect();
       return {points:[[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.5,.5]].map(([u,v])=>{const h=document.elementFromPoint(r.left+r.width*u,r.top+r.height*v);return {hit:h?.getAttribute("class"),tag:h?.tagName,html:h?.outerHTML.slice(0,500),ancestors:h?[h.parentElement?.className,h.parentElement?.parentElement?.className]:[]}}),layout:document.querySelector<HTMLElement>(".mahjong-game")?.dataset.actionLayoutState,label:button.textContent,rect:r.toJSON(),within:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,large:r.width>=minimum-.1&&r.height>=minimum-.1,hits:[[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.5,.5]].every(([u,v])=>button.contains(document.elementFromPoint(r.left+r.width*u,r.top+r.height*v)))};
      }),touch?44:34);
      assert.ok(targets.every(t=>t.within&&t.large&&t.hits),JSON.stringify({engine:engine.name(),kind,viewer,count,size,targets}));
     };
     await checkTargets();
     const overlaps=await readOverlaps();
     if(count)assert.equal((await tray.locator('small').textContent())?.trim(),`拔北 × ${count}`);
     const result={engine:engine.name(),touch,viewer,actor,kind,count,size,measurements,overlaps,choices:room.game!.choices.map(c=>c.type)};scenes.push(result);
     if(overlaps.length||measurements.some(t=>!t.visible||!t.within)||count===4)await page.screenshot({path:`${out}/${engine.name()}-${kind}-${count}-${viewer}-${size.width}.png`});
     writeFileSync(`${out}/partial.json`,JSON.stringify(scenes,null,2));
     assert.deepEqual(overlaps,[],JSON.stringify(result));
     if((kind==="multi-kan"||kind==="yonma-multi")&&viewer===actor){
      const kan=page.locator('.mahjong-action-dock [data-choice-type="kan"]');
      assert.equal(await kan.locator('.mahjong-call-previews > *').count(),3);
      await kan.click();
      const dialog=page.getByRole('dialog',{name:'选择杠牌'});
      const candidates=dialog.locator('[data-choice-type="kan"]');
      assert.equal(await candidates.count(),3);
      const legal=room.game!.choices.filter(c=>c.type==='kan')[2];
      await candidates.nth(2).click();
      assert.deepEqual(await page.evaluate(()=>(window as any).chosenChoice),legal);
      assert.equal(await dialog.count(),0);
     }
     if(selectedOnly || (viewer===actor && await page.locator(".mahjong-button--riichi").count()===1)){
      const riichi=page.locator('.mahjong-button--riichi');
      assert.equal(await riichi.count(),1,'fixture really offers riichi');
      await riichi.click();
      assert.equal(await riichi.getAttribute('aria-pressed'),'true');
      const selectedOverlaps=await readOverlaps();
      writeFileSync(`${out}/${engine.name()}-${kind}-${viewer}-${count}-${size.width}-selected.json`,JSON.stringify(selectedOverlaps,null,2));
      await page.screenshot({path:`${out}/${engine.name()}-${kind}-${viewer}-${count}-${size.width}-selected.png`});
      assert.deepEqual(selectedOverlaps,[],'selected riichi controls clear public table');
      await checkTargets();
      const cancel=page.locator('.mahjong-action-dock__cancel');
      await cancel.click();
      assert.equal(await riichi.getAttribute('aria-pressed'),'false');
      assert.equal(await cancel.count(),0);
      assert.deepEqual(await readOverlaps(),[],'cancel restores clear action layout');
     }
     assert.equal(measurements.length,count);assert.deepEqual(measurements.map(t=>t.index),Array.from({length:count},(_,i)=>i));assert.ok(measurements.every(t=>t.visible&&t.within&&t.depth>0&&t.face==="z4"),JSON.stringify(result));
    }
   }finally{await context.close()}
  }
 }}finally{await browser.close()}
}
writeFileSync(`${out}/summary.json`,JSON.stringify({scenes,frames:scenes.length,tiles:scenes.reduce((n,s)=>n+s.measurements.length,0)},null,2));
console.log(`PASS ${scenes.length} native repeated-nuki frames: ${out}`);
