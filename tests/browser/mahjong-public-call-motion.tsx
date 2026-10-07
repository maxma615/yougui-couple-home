// Public physical fixtures submit only real-engine legal Choices.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {build} from "esbuild";
import {chromium,webkit} from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import {RiichiGame} from "../../src/modules/mahjong/engine";
import {SanmaGame} from "../../src/modules/mahjong/sanma";
import {SanmaWall,sanmaTiles} from "../../src/modules/mahjong/sanma-wall";
import type {RoomView} from "../../src/modules/mahjong/types";
const out=`.local/audit/public-call-${process.env.CALL_STAGE||'green'}-${Date.now()}`;
mkdirSync(out,{recursive:true});
const tiles=(s:string)=>[...s.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>m[1]+n));
function fixture(kind:"chi"|"pon"|"kan", variant:"yonma"|"sanma", viewer:number) {
  const hand=variant==="sanma"&&kind==="pon"?"p55s123789z12345":kind==="chi"?"p12m456s123789z12":kind==="pon"?"p55m456s123789z12":"z777p123456s123z1";
  const called=kind==="chi"?"p3":kind==="pon"?"p0":"z7";
  const makeWall=(physical:string[])=>{
    const pool=physical.slice(),take=(t:string)=>{const i=pool.indexOf(t);assert.ok(i>=0,`physical wall missing ${t}`);return pool.splice(i,1)[0]};
    const hands=Array.from({length:variant==="sanma"?3:4},()=>[] as string[]);
    hands[1]=tiles(hand).map(take);
    if(variant==="sanma")hands[0]=tiles("p123456789s123z1").map(take);
    else {hands[0]=tiles("m123p678s456789z4").map(take);hands[2]=tiles("m789p123s456z1234").map(take);hands[3]=tiles("m456p789s123z5566").map(take);}
    assert.equal(hands[1].length,13);
    const draw=take(called);
    for(let i=0;i<hands.length;i++)if(!hands[i].length)hands[i]=pool.splice(0,13);
    return {hands,draw,pool};
  };
  const names=variant==="sanma"?["甲","乙 · 朋友","丙"]:["甲","乙 · 朋友","丙","丁"];
  const game=variant==="sanma"?new SanmaGame("east",names,{dealer:0,wallFactory:()=>{
    const physical=sanmaTiles(),{hands,draw,pool}=makeWall(physical);
    const reserve=pool.splice(0,4),indicators=pool.splice(0,10),wall=[...hands.flat(),draw,...pool,...reserve,...indicators];
    assert.deepEqual(wall.slice().sort(),physical.slice().sort());return new SanmaWall(wall);
  }}):new RiichiGame("east",names,{dealer:0,wallFactory:rule=>{
    const wall=new Majiang.Shan(rule),physical=wall._pai.slice(),{hands,draw,pool}=makeWall(physical);
    wall._pai=[...pool,...[...hands.flat(),draw].reverse()];
    assert.deepEqual(wall._pai.slice().sort(),physical.slice().sort());
    wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];return wall;
  }});
  const room=(version:number):RoomView=>({id:`call-${kind}`,code:"ABCDEFGH",hostUserId:"0",mode:"east",variant,status:"playing",version,mySeat:viewer,game:game.view(viewer),members:names.map((displayName,seat)=>({userId:String(seat),displayName,seat,kind:"human",ready:true,connected:true}))});
  const initialRoom=room(1);
  const initial=game.view(0),discard=initial.choices.find(c=>c.type==="discard"&&c.value?.slice(0,2)===called);
  assert.ok(discard);game.respond(0,initial.decisionId,discard.id);
  const before=room(2),caller=game.view(1),choice=caller.choices.find(c=>c.type===kind);
  assert.ok(choice,`real ${kind} choice`);game.respond(1,caller.decisionId,choice.id);
  const after=room(3);assert.equal(after.game!.players[1].melds.length,1);
  return {initial:initialRoom,kind,label:kind==="chi"?"吃":kind==="pon"?"碰":"杠",actorSeat:1,actor:"乙 · 朋友",before,after};
}


function special(kind:'ankan'|'kakan',viewer:number) {
 const names=['甲','乙','丙'];
 const game=new SanmaGame('east',names,{dealer:0,wallFactory:()=>{
  const pool=sanmaTiles();const take=(t:string)=>{const i=pool.indexOf(t);assert.ok(i>=0,`special physical tile ${t}`);return pool.splice(i,1)[0]};
  const encoded:Record<number,string>=kind==='ankan'?{0:'p444s234z1234567',1:'p23s123456789z22'}:{1:'p11s123456789z22',2:'p23s123456789z44'};
  const hands=[0,1,2].map(seat=>encoded[seat]?tiles(encoded[seat]).map(take):[]);
  const draws=(kind==='ankan'?['p4']:['p1','z3','z4','p1']).map(take);
  for(const hand of hands){if(!hand.length)hand.push(...pool.splice(0,13));assert.equal(hand.length,13)}
  const reserve=pool.splice(0,4),indicators=pool.splice(0,10);return new SanmaWall([...hands.flat(),...draws,...pool,...reserve,...indicators]);
 }});
 let version=1;const room=():RoomView=>({id:`call-${kind}`,code:'ABCDEFGH',hostUserId:'0',mode:'east',variant:'sanma',status:'playing',version,mySeat:viewer,game:game.view(viewer),members:names.map((displayName,seat)=>({userId:String(seat),displayName,seat,kind:'human',ready:true,connected:true}))});
 const steps=[room()];const act=(seat:number,id:string)=>{const v=game.view(seat);assert.ok(v.choices.some(c=>c.id===id),`actual legal ${id}`);game.respond(seat,v.decisionId,id);version++;steps.push(room())};const pass=()=>{for(let seat=0;seat<3;seat++){const p=game.view(seat).choices.find(c=>c.type==='pass');if(p)act(seat,p.id)}};
 if(kind==='ankan'){const c=game.view(0).choices.find(c=>c.type==='kan');assert.ok(c);act(0,c.id);pass()}
 else {act(0,'discard:p1_');act(1,'pon:p111-');pass();act(1,'discard:s9');pass();act(2,'discard:z3_');pass();act(0,'discard:z4_');pass();act(1,'kan:p111-1');pass()}
 const actor=kind==='ankan'?0:1,index=steps.findIndex((r,i)=>i>0&&r.game!.players[actor].melds.includes(kind==='ankan'?'p4444':'p111-1')&&!steps[i-1].game!.players[actor].melds.includes(kind==='ankan'?'p4444':'p111-1'));assert.ok(index>0);return {before:steps[index-1],after:steps[index],actor,steps};
}
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';import {measureDiscardElement} from './src/components/mahjong/use-discard-motion';window.callMeasure=measureDiscardElement;const root=createRoot(document.getElementById('root'));window.callApi={render:(room,connected=true,canAnimate=true)=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,connected,motionCanAnimate:canAnimate,ownSeat:room.mySeat,host:true,busy:false,onChoice:()=>{},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))))};`,resolveDir:process.cwd(),loader:"tsx"},metafile:true,bundle:true,platform:"browser",format:"iife",write:false,jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'}});
const css=["mahjong.css","mahjong-river.css","mahjong-meld.css","mahjong-interaction.css","mahjong-discard-motion.css","mahjong-table-center.css","mahjong-table-edge.css","mahjong-camera.css","mahjong-call-announcement.css","mahjong-standing-tile.css"].filter(f=>existsSync(`src/app/mahjong/${f}`)).map(f=>readFileSync(`src/app/mahjong/${f}`,"utf8")).join("\n");

const digest=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
writeFileSync(`${out}/bundle.js`,bundle.outputFiles[0].text);
writeFileSync(`${out}/source-manifest.json`,JSON.stringify({bundle:digest(bundle.outputFiles[0].text),css:digest(css),sources:Object.keys(bundle.metafile!.inputs).filter(f=>!f.startsWith('<')).map(file=>({file,sha256:digest(readFileSync(file))})),test:{file:'tests/browser/mahjong-public-call-motion.tsx',sha256:digest(readFileSync('tests/browser/mahjong-public-call-motion.tsx'))}},null,2));
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 try { for(const size of [{width:667,height:375},{width:844,height:390},{width:1440,height:810}]) {
  for(const [variant,kind] of [['yonma','pon'],['yonma','chi'],['yonma','kan'],['sanma','pon'],['sanma','kan']] as const) for(const viewer of [0,1]) {
   const f=fixture(kind,variant,viewer);const compositor=engine===webkit&&variant==='yonma'&&kind==='pon'&&viewer===0&&size.width===844;const page=await browser.newPage({viewport:size,...(compositor?{recordVideo:{dir:out,size}}:{})});const errors:string[]=[];
   page.on('pageerror',e=>errors.push(e.message));
   try {
    await page.route('https://mahjong.local/images/**',r=>{const path=new URL(r.request().url()).pathname;return r.fulfill({status:200,contentType:path.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync(`public${path}`)});});
    await page.setContent(`<base href="https://mahjong.local/"><style>*{box-sizing:border-box}body{margin:0;--font-body:sans-serif;--font-display:serif}${css}</style><div id="root"></div>`);
    await page.addScriptTag({content:'globalThis.__name=(t,v)=>Object.defineProperty(t,"name",{value:v,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};'+bundle.outputFiles[0].text});
    const render=(r:RoomView,c=true,a=true)=>page.evaluate(({r,c,a})=>(window as any).callApi.render(r,c,a),{r,c,a});
    await render(f.before);
    await page.waitForTimeout(40);
    const source=await page.locator('[data-discard-event-id] .mahjong-tile').boundingBox();assert.ok(source);const sourceQuad=await page.locator('[data-discard-event-id] .mahjong-tile').evaluate(e=>(window as any).callMeasure(e)?.geometry.quad);
    await render(f.after);
    const observed=await page.evaluate(async()=>{
     const flight=document.querySelector<HTMLElement>('[data-testid="mahjong-call-flight"]');
     const group=document.querySelector<HTMLElement>('[data-meld-seat="1"][data-meld-index="0"]');
     const target=group?.querySelector<HTMLElement>('[data-called] .mahjong-tile');
     const a=flight?.getAnimations()[0],emphasis=group?.getAnimations().find(a=>a.id.startsWith('mahjong-public-call:'));
     const rect=(e:HTMLElement|null|undefined)=>e?.getBoundingClientRect().toJSON();
     const read=()=>({flight:rect(flight),flightQuad:flight?(window as any).callMeasure(flight)?.geometry.quad:undefined,targetQuad:target?(window as any).callMeasure(target)?.geometry.quad:undefined,target:rect(target),visibility:target?getComputedStyle(target).visibility:null});
     if(a){a.pause();a.currentTime=0;await new Promise(r=>requestAnimationFrame(r));}const start=read();
     if(a){a.currentTime=115;await new Promise(r=>requestAnimationFrame(r));}const middle=read();
     if(a){a.currentTime=229.99;await new Promise(r=>requestAnimationFrame(r));}const end=read();
     if(a)a.currentTime=115;
     return {start,middle,end,duration:a?.effect?.getComputedTiming().duration,emphasisDuration:emphasis?.effect?.getComputedTiming().duration,face:target?.closest<HTMLElement>('[data-tile-value]')?.dataset.tileValue,sourceId:flight?.dataset.motionSourceTileId,flightArt:flight?.querySelector('img')?.getAttribute('src'),motionSeat:flight?.dataset.motionSeat,faceTransform:flight?.querySelector('.mahjong-discard-flight__face')?getComputedStyle(flight.querySelector('.mahjong-discard-flight__face')!).transform:null};
    });
    const id=`${engine.name()}-${variant}-${kind}-viewer${viewer}-${size.width}`;
    writeFileSync(`${out}/${id}.json`,JSON.stringify({source,sourceQuad,observed,before:f.before,after:f.after,errors},null,2));
    assert.equal(observed.faceTransform,'none','already public face must stay visible in actual compositor');assert.ok(observed.start.flight,'accepted public call must continue the disappearing river face into its exact meld');
    const quadError=(a:any,b:any)=>Math.max(...['topLeft','topRight','bottomRight','bottomLeft'].map(k=>Math.hypot(a[k].x-b[k].x,a[k].y-b[k].y)));assert.ok(observed.start.flightQuad&&sourceQuad);assert.ok(quadError(observed.start.flightQuad,sourceQuad)<2,'source projected corners');assert.ok(quadError(observed.end.flightQuad,observed.end.targetQuad)<2,'target projected corners');assert.equal(observed.motionSeat,'1');assert.equal(observed.duration,230);assert.equal(observed.emphasisDuration,900);
    assert.equal(observed.start.visibility,'hidden');assert.equal(await page.locator('[data-meld-seat="1"] [data-called] .mahjong-tile').count(),1,'one physical called target');if(kind==='pon')assert.ok(observed.flightArt?.endsWith('/Pin5-Dora.svg'),'exact red art persists through flight');assert.equal(observed.face,kind==='pon'?'p0':kind==='chi'?'p3':'z7');
    assert.ok(observed.sourceId?.startsWith('discard:'));
    assert.ok(Math.hypot(observed.start.flight.x-source.x,observed.start.flight.y-source.y)<2,'physical public source');
    assert.ok(Math.hypot(observed.end.flight!.x-observed.end.target!.x,observed.end.flight!.y-observed.end.target!.y)<2,'exact called endpoint');
    assert.ok(Math.hypot(observed.middle.flight!.x-source.x,observed.middle.flight!.y-source.y)>2,'actual midpoint moves');
    if(compositor){await page.waitForTimeout(180);await page.screenshot({path:`${out}/webkit-red-pon-midpoint.png`});}
    const beforeQuiet=await page.evaluate(()=>document.querySelector('[data-meld-seat="1"]')?.getAnimations()[0]?.currentTime);
    await render({...f.after,version:4});
    const afterQuiet=await page.evaluate(()=>document.querySelector('[data-meld-seat="1"]')?.getAnimations()[0]?.currentTime);
    assert.ok(Number(afterQuiet)>=Number(beforeQuiet),'quiet does not restart emphasis');
    await page.evaluate(()=>{for(const a of document.querySelector('[data-testid="mahjong-call-flight"]')?.getAnimations()??[])a.finish()});
    await page.waitForTimeout(30);assert.equal(await page.getByTestId('mahjong-call-flight').count(),0);
    assert.equal(await page.locator('[data-meld-seat="1"] [data-called] .mahjong-tile').evaluate(e=>getComputedStyle(e).visibility),'visible');
    await page.waitForTimeout(920);assert.equal(await page.locator('[data-meld-seat="1"]').evaluate(e=>e.getAnimations().length),0,'finite emphasis');
    await render(f.before);await render(f.after,false);await render(f.after);assert.equal(await page.getByTestId('mahjong-call-flight').count(),0,'reconnect baseline');
    await render(f.before);await render(f.after,true,false);assert.equal(await page.getByTestId('mahjong-call-flight').count(),0,'silent hydration');
    
    // Real opponent discard remains in flight when the legal call is accepted.
    if(viewer===1){const rapid=fixture(kind,variant,viewer);await render(rapid.initial,true,false);await page.waitForTimeout(40);await render(rapid.before);assert.equal(await page.getByTestId('mahjong-discard-flight').count(),1);await render(rapid.after);assert.equal(await page.getByTestId('mahjong-call-flight').count(),0,'hidden old river must not be invented');assert.equal(await page.locator('[data-meld-seat="1"]').evaluate(e=>e.getAnimations().filter(a=>a.id.startsWith('mahjong-public-call:')).length),1,'hidden source group emphasis');}
    await render(f.before);await render(f.after);await page.evaluate(async()=>{window.dispatchEvent(new Event('resize'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});assert.equal(await page.getByTestId('mahjong-call-flight').count(),0,'resize restores hidden target');
    assert.equal(await page.locator('[data-meld-seat="1"] [data-called] .mahjong-tile').evaluate(e=>getComputedStyle(e).visibility),'visible');
    if(viewer===1){await render(f.before);await render(f.after);await page.locator('.mahjong-hand button').first().click();assert.equal(await page.getByTestId('mahjong-call-flight').count(),0,'own input cancels visual without delay');assert.equal(await page.locator('[data-meld-seat="1"]').evaluate(e=>e.getAnimations().length),0);}
    await render(f.before);await render(f.after);await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(60);assert.equal(await page.getByTestId('mahjong-call-flight').count(),0,'motion preference cancels');await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(60);
    if(size.width===844){await render(f.before);await page.setViewportSize({width:1440,height:810});await page.waitForTimeout(60);const refreshed=await page.locator('[data-discard-event-id] .mahjong-tile').evaluate(e=>(window as any).callMeasure(e)?.geometry.quad);await render(f.after);const actual=await page.getByTestId('mahjong-call-flight').evaluate(async e=>{const a=e.getAnimations()[0];a.pause();a.currentTime=0;await new Promise(r=>requestAnimationFrame(r));return(window as any).callMeasure(e)?.geometry.quad});assert.ok(quadError(actual,refreshed)<2,'resize before acceptance refreshes source');await page.setViewportSize(size)}
    assert.deepEqual(errors,[]);console.log(`PASS ${id}`);
   }finally{await page.close();if(compositor)writeFileSync(`${out}/compositor-video.txt`,await page.video()!.path())}
  }
 }}finally{await browser.close()}
}
console.log(`ARTIFACTS ${out}`);

for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();try{for(const size of [{width:667,height:375},{width:844,height:390},{width:1440,height:810}])for(const kind of ['ankan','kakan'] as const)for(const viewer of [0,1]){
  const f=special(kind,viewer),page=await browser.newPage({viewport:size}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.route('https://mahjong.local/images/**',r=>{const path=new URL(r.request().url()).pathname;return r.fulfill({status:200,contentType:path.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync(`public${path}`)});});
   await page.setContent(`<base href="https://mahjong.local/"><style>*{box-sizing:border-box}body{margin:0;--font-body:sans-serif;--font-display:serif}${css}</style><div id="root"></div>`);
   await page.addScriptTag({content:'globalThis.__name=(t,v)=>Object.defineProperty(t,"name",{value:v,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};'+bundle.outputFiles[0].text});
   const render=(r:RoomView,c=true,a=true)=>page.evaluate(({r,c,a})=>(window as any).callApi.render(r,c,a),{r,c,a});await render(f.before);await page.waitForTimeout(40);await render(f.after);
   assert.equal(await page.getByTestId('mahjong-call-flight').count(),0,'closed or added kan never replays a claimed tile');
   const group=page.locator(`[data-meld-seat="${f.actor}"][data-meld-index="0"]`);
   const observed=await group.evaluate(e=>({kind:e.getAttribute('data-kind'),animations:e.getAnimations().map(a=>({id:a.id,duration:a.effect?.getComputedTiming().duration})),layers:[...e.querySelectorAll<HTMLElement>('[data-layer]')].map(n=>({layer:n.dataset.layer,face:n.dataset.tileValue,visible:getComputedStyle(n).visibility}))}));
   assert.equal(observed.kind,kind);assert.equal(observed.animations[0]?.duration,900);assert.ok(observed.animations[0]?.id.startsWith('mahjong-public-call:'));
   if(kind==='kakan')assert.deepEqual(observed.layers.map(l=>({layer:l.layer,face:l.face,visible:l.visible})),[{layer:'added',face:'p1',visible:'visible'},{layer:'called',face:'p1',visible:'visible'}]);
   await render({...f.after,version:f.after.version+1});await page.waitForTimeout(920);assert.equal(await group.evaluate(e=>e.getAnimations().length),0);
   await render(f.before);await render(f.after);await render(f.after,false);assert.equal(await group.evaluate(e=>e.getAnimations().length),0,'disconnect cancels emphasis');
   assert.deepEqual(errors,[]);const id=`${engine.name()}-${kind}-viewer${viewer}-${size.width}`;writeFileSync(`${out}/${id}.json`,JSON.stringify({observed,...f,errors},null,2));console.log(`PASS ${id}`);
  }finally{await page.close()}
 }}finally{await browser.close()}
}
