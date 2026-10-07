import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {northReplacementFixture} from '../fixtures/mahjong-view-game';
import Majiang from '@kobalab/majiang-core';
import {RiichiGame} from '../../src/modules/mahjong/engine';
import {SanmaGame} from '../../src/modules/mahjong/sanma';
import {SanmaWall,sanmaTiles} from '../../src/modules/mahjong/sanma-wall';
import type {RoomView,Choice} from '../../src/modules/mahjong/types';
const dir=`.local/audit/seat-theme-${process.env.THEME_STAGE || 'green'}-${Date.now()}`;
mkdirSync(dir,{recursive:true});
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const fixtureFile='.local/audit/seat-drag-issue-20261007/snapshots.json';
const fixtures=JSON.parse(readFileSync(fixtureFile,'utf8')).snapshots;
const cssFiles=['mahjong.css','mahjong-river.css','mahjong-meld.css','mahjong-interaction.css','mahjong-discard-motion.css','mahjong-table-center.css','mahjong-table-edge.css','mahjong-camera.css','mahjong-call-announcement.css','mahjong-standing-tile.css'];
const files=['tests/browser/mahjong-seat-theme.tsx',fixtureFile,'tests/browser/mahjong-table-projection.tsx','src/components/mahjong/mahjong-client.tsx','src/components/mahjong/mahjong-call-option.tsx','src/components/mahjong/use-discard-motion.tsx',...cssFiles.map(f=>'src/app/mahjong/'+f)];
const hashes=Object.fromEntries(files.map(f=>[f,hash(f)]));
const css=cssFiles.map(f=>readFileSync('src/app/mahjong/'+f,'utf8')).join('\n');writeFileSync(dir+'/style.css',css);
const script=`import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';import{measureDiscardElement}from'./src/components/mahjong/use-discard-motion';window.measureDiscardElement=measureDiscardElement;const root=createRoot(document.getElementById('root'));window.choices=[];window.auditRender=(room,opts={})=>{window.choices=[];flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,ownSeat:room.mySeat,host:false,busy:opts.busy??false,connected:opts.connected??true,motionCanAnimate:false,onChoice:choice=>window.choices.push(choice),onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))));};`;
const bundle=await build({stdin:{contents:script,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
writeFileSync(dir+'/bundle.js',bundle.outputFiles[0].text);
type Kind='chi'|'pon'|'open'|'closed'|'added';
function legalFixture(variant:'yonma'|'sanma',kind:Kind) {
 const n=variant==='sanma'?3:4, actor=kind==='closed'?0:1;
 const names=['甲','乙','丙','丁'].slice(0,n);
 const encoded=kind==='chi'?'p12450s123789z12':kind==='pon'||kind==='open'||kind==='closed'?'p055s123789z1234':'p55s123789z12345';
 const draws=kind==='added'?(n===3?['p5','z6','z7','p0']:['p5','z6','z7','m9','p0']):[kind==='chi'?'p3':'p5'];
 const deal=(physical:string[])=>{
  const pool=physical.slice();
  const take=(tile:string)=>{const i=pool.indexOf(tile);assert.ok(i>=0,`physical ${tile}`);return pool.splice(i,1)[0];};
  const hands=Array.from({length:n},()=>[] as string[]);
  hands[actor]=[...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(rank=>take(m[1]+rank)));
  const drawn=draws.map(take);
  for(const hand of hands){if(!hand.length)hand.push(...pool.splice(0,13));assert.equal(hand.length,13);}
  assert.deepEqual([...hands.flat(),...drawn,...pool].sort(),physical.slice().sort());
  return {hands,drawn,pool};
 };
 const game=variant==='sanma'?new SanmaGame('east',names,{dealer:0,wallFactory:()=>{
  const {hands,drawn,pool}=deal(sanmaTiles()),reserve=pool.splice(0,4),indicators=pool.splice(0,10);
  return new SanmaWall([...hands.flat(),...drawn,...pool,...reserve,...indicators]);
 }}):new RiichiGame('east',names,{dealer:0,wallFactory:rule=>{
  const wall=new Majiang.Shan(rule),{hands,drawn,pool}=deal(wall._pai);
  wall._pai=[...pool,...[...hands.flat(),...drawn].reverse()];wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];return wall;
 }});
 const act=(seat:number,id:string)=>{const v=game.view(seat);assert.ok(v.choices.some(c=>c.id===id),`legal ${variant} ${kind} ${id}`);game.respond(seat,v.decisionId,id);};
 const pass=()=>{for(let seat=0;seat<n;seat++){const v=game.view(seat),c=v.choices.find(c=>c.type==='pass');if(c)act(seat,c.id);}};
 if(kind!=='closed')act(0,`discard:${draws[0]}_`);
 if(kind==='added'){
  const pon=game.view(1).choices.find(c=>c.type==='pon');assert.ok(pon);act(1,pon.id);pass();act(1,'discard:z5');pass();
  for(const tile of draws.slice(1,-1)){const seat=game.view(0).turnSeat;act(seat,`discard:${tile}_`);pass();}
 }
 const type=kind==='chi'?'chi':kind==='pon'?'pon':'kan';
 const choices=game.view(actor).choices.filter(c=>c.type===type);
 assert.ok(choices.length,`actual ${variant} ${kind} choices`);
 if(kind==='pon')assert.equal(choices.length,2,'red/normal pon alternatives remain distinct');
 const room:RoomView={id:`theme-${variant}-${kind}`,code:'ABCDEFGH',hostUserId:'0',mode:'east',variant,status:'playing',version:1,mySeat:actor,game:game.view(actor),members:names.map((displayName,seat)=>({userId:String(seat),displayName,seat,kind:'human',ready:true,connected:true}))};
 return {game,room,choices,type,kind,variant};
}
function northRooms(count:number):RoomView[] {
 const game=new SanmaGame('east',['甲','乙','丙'],{dealer:0,wallFactory:()=>{
  const pool=sanmaTiles(),take=(tile:string)=>{const i=pool.indexOf(tile);assert.ok(i>=0);return pool.splice(i,1)[0];};
  const hand=[...'m19p1234s123z2444'.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>take(m[1]+n)));
  const drawn=take('z4'),reserve=['s4','s5','s6','s7'].map(take),others=pool.splice(0,26),indicators=pool.splice(0,10);
  return new SanmaWall([...hand,...others,drawn,...pool,...reserve,...indicators]);
 }});
 for(let i=0;i<count;i++){
  const v=game.view(0),choice=v.choices.find(c=>c.type==='nuki');assert.ok(choice);game.respond(0,v.decisionId,choice.id);
  for(const seat of [1,2]){const other=game.view(seat),pass=other.choices.find(c=>c.type==='pass');if(pass)game.respond(seat,other.decisionId,pass.id);}
 }
 return [1,2].map(viewer=>({id:`theme-north-${count}`,code:'ABCDEFGH',hostUserId:'0',mode:'east',variant:'sanma',status:'playing',version:1,mySeat:viewer,game:game.view(viewer),members:['甲','乙','丙'].map((displayName,seat)=>({userId:String(seat),displayName,seat,kind:'human',ready:true,connected:true}))}));
}
fixtures.push(...[1,2,3,4].flatMap(northRooms));
const legalFixtures=(['yonma','sanma'] as const).flatMap(variant=>(['chi','pon','open','closed','added'] as const).filter(kind=>kind!=='chi'||variant==='yonma').map(kind=>legalFixture(variant,kind)));
writeFileSync(dir+'/legal-choices.json',JSON.stringify(legalFixtures.map(f=>({room:f.room,choices:f.choices,kind:f.kind})),null,2));
const output:any[]=[],choiceOutput:any[]=[],compositorOutput:any[]=[];
const runtimeErrors:string[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{
 for(const size of [{width:667,height:375},{width:844,height:390},{width:1440,height:810}]){
  const context=await browser.newContext({viewport:size});const page=await context.newPage();page.on('pageerror',e=>runtimeErrors.push(e.message));
  await page.route('https://mahjong.local/images/**',r=>r.fulfill({body:readFileSync('public'+new URL(r.request().url()).pathname),contentType:r.request().url().endsWith('.svg')?'image/svg+xml':'image/webp'}));
  await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*{box-sizing:border-box}${css}</style><div id="root"></div>`);
  await page.addScriptTag({content:'globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};'+bundle.outputFiles[0].text});
  for(const room of fixtures){
   await page.evaluate(room=>(window as any).auditRender(room),room);
   await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth===300));
   await page.waitForTimeout(160);
   const metrics=await page.evaluate(()=>{
    const sample=(el:HTMLElement,positions:number[][]=[[0,0],[1,0],[1,1],[0,1]],z=0)=>{
     const style=getComputedStyle(el),original=el.getAttribute('style');let w=parseFloat(style.width),h=parseFloat(style.height),bl=parseFloat(style.borderLeftWidth)||0,bt=parseFloat(style.borderTopWidth)||0;
     if(style.boxSizing!=='border-box'){w+=bl+(parseFloat(style.borderRightWidth)||0)+(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0);h+=bt+(parseFloat(style.borderBottomWidth)||0)+(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);}
     if(style.position==='static')el.style.setProperty('position','relative','important');
     const marker=document.createElement('i');marker.style.cssText='position:absolute!important;display:block!important;width:0!important;height:0!important;margin:0!important;padding:0!important;border:0!important;visibility:hidden!important;transform:none!important;transition:none!important;animation:none!important;pointer-events:none!important;';marker.style.setProperty('transform',`translateZ(${z}px)`,'important');el.append(marker);
     const points=positions.map(([u,v])=>{marker.style.left=`${w*u-bl}px`;marker.style.top=`${h*v-bt}px`;const r=marker.getBoundingClientRect();return {x:r.left,y:r.top};});marker.remove();if(original===null)el.removeAttribute('style');else el.setAttribute('style',original);return points;
    };
    const delta=(a:any,b:any)=>({x:b.x-a.x,y:b.y-a.y});const angle=(a:any,b:any)=>Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
    const angleDiff=(a:number,b:number)=>{let d=Math.abs(a-b)%180;return Math.min(d,180-d);};
    const distance=(p:any,a:any,b:any)=>{const d=delta(a,b);return ((p.x-a.x)*d.y-(p.y-a.y)*d.x)/Math.hypot(d.x,d.y);};
    const svg=document.querySelector<SVGSVGElement>('.mahjong-table__seams')!;const mat=svg.getScreenCTM?.() ?? {a:1,b:0,c:0,d:1,e:0,f:0};const project=(x:number,y:number)=>{const probe=document.createElementNS('http://www.w3.org/2000/svg','circle');probe.setAttribute('cx',String(x));probe.setAttribute('cy',String(y));probe.setAttribute('r','.001');probe.style.cssText='opacity:0;pointer-events:none';svg.append(probe);const r=probe.getBoundingClientRect();probe.remove();return {x:r.left+r.width/2,y:r.top+r.height/2};};
    const lane=document.querySelector<HTMLElement>('.mahjong-table__lane');
    const laneQuad=lane ? sample(lane) : null;
    const seams=laneQuad ? {north:[laneQuad[0],laneQuad[1]],west:[laneQuad[0],laneQuad[3]],east:[laneQuad[1],laneQuad[2]]} : {north:[project(170,90),project(830,90)],west:[project(170,90),project(60,600)],east:[project(830,90),project(940,600)]};
    const inner=seams,dividers:any[]=[];
    const racks=[...document.querySelectorAll<HTMLElement>('.mahjong-table__surface .mahjong-opponent-rack')].map(rack=>{
     const pos=rack.closest('.mahjong-table__position')!.className.match(/--(north|west|east)/)![1] as keyof typeof seams;
     const tiles=[...rack.querySelectorAll<HTMLElement>('.mahjong-standing-tile__body')];const feet=tiles.map(t=>sample(t));
     const lines=[ [feet[0][0],feet.at(-1)![1]],[feet[0][3],feet.at(-1)![2]] ];
     const middle=feet[Math.floor(feet.length/2)];const top=tiles[Math.floor(tiles.length/2)].querySelector<HTMLElement>('[data-standing-face="top"]')!;
     const surface=document.querySelector<HTMLElement>('.mahjong-table__surface')!;
     const surfaceStyle=getComputedStyle(surface),sw=parseFloat(surfaceStyle.width),sh=parseFloat(surfaceStyle.height);
     const border=parseFloat(surfaceStyle.borderLeftWidth),cw=sw-2*border,ch=sh-2*border;
     // Expected z=0 rear contact family: six local CSS pixels outward from
     // the local rectangle (12/88% x, 9% y). Native probes receive the same
     // camera; no affine screen-space fit or raised face is used as evidence.
     const xy=(x:number,y:number)=>[(border+x)/sw,(border+y)/sh];
     const floor=(offset:number,z=0)=>pos==='north' ? sample(surface,[xy(cw*.2,ch*.09-offset),xy(cw*.8,ch*.09-offset)],z)
       : sample(surface,[xy(cw*(pos==='west'?.12:.88)+(pos==='west'?-offset:offset),ch*.2),xy(cw*(pos==='west'?.12:.88)+(pos==='west'?-offset:offset),ch*.8)],z);
     const depth=parseFloat(getComputedStyle(tiles[0]).height);
     const expectedRear=floor(6),expectedFront=floor(6+depth),expectedPublic=floor(6+depth,1);
     const frontResiduals=lines[1].map(p=>distance(p,...expectedFront as [any,any]));
     const rearResiduals=lines[0].map(p=>distance(p,...expectedRear as [any,any]));
     const seam=seams[pos];const seamAngle=angle(...seam as [any,any]);
     const melds=[...rack.querySelectorAll<HTMLElement>('.mahjong-meld__slot,.mahjong-meld__back')].filter(e=>!e.closest('.mahjong-meld__stack')).map(el=>{
      const q=sample(el),axis=angle(q[0],q[1]);return {baselineResiduals:[q[3],q[2]].map(p=>distance(p,...expectedPublic as [any,any])),quad:q,axis,deltaDeg:angleDiff(axis,seamAngle),seamDistances:q.map(p=>distance(p,...seam as [any,any])),face:el.querySelector('.mahjong-meld__face')?(window as any).measureDiscardElement(el.querySelector('.mahjong-meld__face')):null};
     });
     const center=sample(tiles[Math.floor(tiles.length/2)].querySelector<HTMLElement>('[data-standing-face="back"]')!,[[.5,.5]])[0];
     return {expectedRear,expectedFront,depth,rearResiduals,frontResiduals,position:pos,seat:Number(rack.closest<HTMLElement>('[data-seat]')!.dataset.seat),count:tiles.length,cssTransform:getComputedStyle(rack).transform,feet,contactLines:lines,contactAngle:angle(...lines[0] as [any,any]),seamAngle,deltaDeg:angleDiff(angle(...lines[0] as [any,any]),seamAngle),seamDistances:lines[0].map(p=>distance(p,...seam as [any,any])),innerSeamDistances:lines[0].map(p=>distance(p,...inner[pos] as [any,any])),physicalQuads:tiles.flatMap(t=>['back','top'].map(face=>sample(t.querySelector<HTMLElement>(`[data-standing-face="${face}"]`)!))),middleContactQuad:middle,raisedTopQuad:sample(top),back:(window as any).measureDiscardElement(tiles[Math.floor(tiles.length/2)].querySelector('[data-standing-face="back"]')),backPaintPoint:center,melds};
    });
    const hand=document.querySelector<HTMLElement>('.mahjong-hand')!;
    const own=[...hand.querySelectorAll<HTMLElement>('[data-hand-instance-id]')].map(e=>({id:e.dataset.handInstanceId,measurement:(window as any).measureDiscardElement(e)}));
    const blockers=[...document.querySelectorAll<HTMLElement>('.mahjong-player__head,.mahjong-table__dora,.mahjong-river,.mahjong-nuki-tray,.mahjong-hand,.mahjong-action-dock')].map(e=>({label:e.className,quad:sample(e)}));
    return {blockers,surfaceQuad:sample(document.querySelector<HTMLElement>('.mahjong-table__surface')!),surfaceTransform:getComputedStyle(document.querySelector('.mahjong-table__surface')!).transform,svgViewBox:svg.getAttribute('viewBox'),svgQuad:laneQuad ?? [project(0,0),project(1000,0),project(1000,700),project(0,700)],svgScreenCTM:{a:mat.a,b:mat.b,c:mat.c,d:mat.d,e:mat.e,f:mat.f},paths:[...svg.querySelectorAll('path')].map(p=>p.getAttribute('d')),seams,inner,dividers,racks,ownHandQuad:sample(hand),ownHand:own};
   });
   output.push({browser:engine.name(),size,viewer:room.mySeat,roomId:room.id,gameInstanceId:room.game.gameInstanceId,handId:room.game.handId,metrics});
   console.log(`${engine.name()} ${size.width} viewer=${room.mySeat}: `+metrics.racks.map(r=>`${r.position} contact/seam=${r.contactAngle.toFixed(2)}/${r.seamAngle.toFixed(2)} delta=${r.deltaDeg.toFixed(2)} melds=${r.melds.length}`).join('; '));
   if(room.mySeat===3)await page.screenshot({path:`${dir}/${engine.name()}-${size.width}-viewer3-snapshot.png`});
  }
  for(const fixture of legalFixtures) {
   const r=fixture.room;
   await page.evaluate(room=>(window as any).auditRender(room),r);
   const entry=page.locator(`.mahjong-action-dock button[data-choice-type="${fixture.type}"]`);
   const record:any={browser:engine.name(),size,kind:fixture.kind,variant:fixture.variant,choices:fixture.choices};
   const expectedCount=fixture.kind==='closed'?2:fixture.kind==='open'||fixture.kind==='added'?4:3;
   assert.equal(await entry.locator('[data-tile-face]').count(),fixture.choices.length*expectedCount,'full actual legal faces on entry');
   if(fixture.kind==='closed')assert.equal(await entry.locator('.mahjong-meld__back').count(),2);
   for(const c of fixture.choices){
    const preview=entry.locator(`[data-preview-choice-id="${c.id}"]`);
    assert.equal(await preview.locator('[data-tile-face="p0"]').count(),c.value!.includes('0')?1:0,'exact red identity');
   }
   await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth===300));
   record.entryFaces=await entry.locator('[data-tile-face]').evaluateAll(es=>es.map(e=>{
    const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {face:e.getAttribute('data-tile-face'),rect:r.toJSON(),hitType:hit?.getAttribute('data-choice-type')};
   }));
   for(const face of record.entryFaces){
    assert.equal(face.hitType,fixture.type,'each exact entry face is visible and hits its native action');
    assert.ok(face.rect.left>=0&&face.rect.right<=size.width&&face.rect.top>=0&&face.rect.bottom<=size.height);
   }
   await page.screenshot({path:`${dir}/${engine.name()}-${size.width}-${fixture.variant}-${fixture.kind}-entry.png`});
   await page.evaluate(room=>(window as any).auditRender(room,{busy:true}),r);
   assert.equal(await entry.isDisabled(),true);
   await page.evaluate(room=>(window as any).auditRender(room,{connected:false}),r);
   assert.equal(await entry.isDisabled(),true);
   record.selections=[];
   for(const chosen of fixture.choices) {
   await page.evaluate(room=>(window as any).auditRender(room),r);
   await entry.click();
   if(fixture.choices.length>1){
    assert.equal((await page.evaluate(()=>(window as any).choices)).length,0,'entry never chooses an arbitrary combination');
    const options=page.locator('.mahjong-call-dialog button[data-choice-id]');
    assert.deepEqual(await options.evaluateAll(es=>es.map(e=>e.getAttribute('data-choice-id'))),fixture.choices.map(c=>c.id));
    await page.waitForTimeout(180);
    await page.screenshot({path:`${dir}/${engine.name()}-${size.width}-${fixture.variant}-${fixture.kind}-dialog.png`});
    const option=page.locator(`.mahjong-call-dialog button[data-choice-id="${chosen.id}"]`);
    await option.scrollIntoViewIfNeeded();
    const face=option.locator('[data-tile-face]').first(),box=(await face.boundingBox())!;
    assert.ok(box.width>10&&box.height>10,'visible actual tile artwork');
    const hit=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.getAttribute('data-choice-id'),{x:box.x+box.width/2,y:box.y+box.height/2});
    assert.equal(hit,chosen.id,'preview children never intercept the native button hit');
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
   }
   assert.deepEqual(await page.evaluate(()=>(window as any).choices),[chosen],'one exact legal Choice');
   // Prove the UI selection can be consumed by the authoritative engine.
   const fresh=legalFixture(fixture.variant,fixture.kind);
   fresh.game.respond(r.mySeat,fresh.room.game!.decisionId,chosen.id);
   for(let seat=0;seat<fresh.room.members.length;seat++){
    const v=fresh.game.view(seat),pass=v.choices.find(c=>c.type==='pass');
    if(pass)fresh.game.respond(seat,v.decisionId,pass.id);
   }
   assert.ok(fresh.game.view(r.mySeat).players[r.mySeat].melds.includes(chosen.value!),`${fixture.variant} ${fixture.kind} accepted ${chosen.id}`);
   record.selections.push(chosen.id);
   }
   if(fixture.choices.length>1){
    await page.evaluate(room=>(window as any).auditRender({...room,game:{...room.game,decisionId:room.game!.decisionId+'-reset'}}),r);
    await entry.click();
    await page.evaluate(room=>(window as any).auditRender({...room,game:{...room.game,decisionId:room.game!.decisionId+'-next',choices:[]}}),r);
    assert.equal(await page.locator('.mahjong-call-dialog').count(),0,'changed decision removes stale selection');
   }
   record.pass=true;choiceOutput.push(record);
  }
  await context.close();
  const resultGame=northReplacementFixture();
  let resultView=resultGame.view(0);
  resultGame.respond(0,resultView.decisionId,resultView.choices.find(c=>c.type==='nuki')!.id);
  for(const seat of [1,2]){const v=resultGame.view(seat),c=v.choices.find(c=>c.type==='pass');if(c)resultGame.respond(seat,v.decisionId,c.id);}
  resultView=resultGame.view(0);assert.ok(resultView.choices.some(c=>c.type==='tsumo'));
  resultGame.respond(0,resultView.decisionId,'tsumo');
  const resultRoom={...legalFixtures.find(f=>f.variant==='sanma')!.room,mySeat:0,game:resultGame.view(0)};
  assert.ok(resultRoom.game.settlement);
  // Separate short videos give final-source compositor evidence for each state.
  for(const kind of ['table','dialog','result']) {
   const videoContext=await browser.newContext({viewport:size,recordVideo:{dir:dir+'/videos',size:{width:size.width+size.width%2,height:size.height+size.height%2}}});
   const frame=await videoContext.newPage();frame.on('pageerror',e=>runtimeErrors.push(e.message));
   await frame.route('https://mahjong.local/images/**',r=>r.fulfill({body:readFileSync('public'+new URL(r.request().url()).pathname),contentType:r.request().url().endsWith('.svg')?'image/svg+xml':'image/webp'}));
   await frame.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*{box-sizing:border-box}${css}</style><div id="root"></div>`);
   await frame.addScriptTag({content:'globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};'+bundle.outputFiles[0].text});
   const room=kind==='table'?fixtures[2]:kind==='dialog'?legalFixtures.find(f=>f.kind==='pon')!.room:resultRoom;
   await frame.evaluate(room=>(window as any).auditRender(room),room);
   if(kind==='dialog')await frame.locator('.mahjong-action-dock button[data-choice-type="pon"]').click();
   await frame.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth===300));
   await frame.waitForTimeout(550);
   const video=frame.video()!;await videoContext.close();
   const path=`${dir}/${engine.name()}-${size.width}-${kind}-compositor.png`;
   execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-sseof','-0.08','-i',await video.path(),'-frames:v','1','-y',path]);
   compositorOutput.push({browser:engine.name(),size,kind,path,sha256:hash(path),snapshotHash:createHash('sha256').update(JSON.stringify(room)).digest('hex')});
  }
 }
 }finally{await browser.close();}
}
writeFileSync(dir+'/proof.json',JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hashes,hashesAfter:Object.fromEntries(files.map(f=>[f,hash(f)])),results:output,choiceResults:choiceOutput,compositors:compositorOutput,runtimeErrors},null,2));

function overlaps(a:{x:number;y:number}[],b:{x:number;y:number}[]) {
 const area=(p:typeof a)=>Math.abs(p.reduce((sum,v,i)=>sum+v.x*p[(i+1)%p.length].y-p[(i+1)%p.length].x*v.y,0));
 if(area(a)<.1||area(b)<.1)return false;
 for(const p of [a,b])for(let i=0;i<p.length;i++){
  const next=p[(i+1)%p.length],axis={x:next.y-p[i].y,y:p[i].x-next.x};
  const x=a.map(v=>v.x*axis.x+v.y*axis.y),y=b.map(v=>v.x*axis.x+v.y*axis.y);
  if(Math.max(...x)<=Math.min(...y)||Math.max(...y)<=Math.min(...x))return false;
 }
 return true;
}
const collisions:string[]=[];
for(const record of output)for(const rack of record.metrics.racks)for(const q of [...rack.physicalQuads,...rack.melds.map((m:any)=>m.quad)]) {
 if(q.some((p:any)=>p.x<0||p.x>record.size.width||p.y<0||p.y>record.size.height))collisions.push(`${record.browser}/${record.size.width}/${record.roomId}/${rack.position}: clipping`);
 for(const blocker of record.metrics.blockers)if(overlaps(q,blocker.quad))collisions.push(`${record.browser}/${record.size.width}/${record.roomId}/${rack.position}: ${blocker.label}`);
}
writeFileSync(dir+'/collisions.json',JSON.stringify(collisions,null,2));
assert.deepEqual(collisions,[], 'actual physical tile quads clear HUD, rivers, North, actions and own touch rack');
const failures=output.flatMap(record=>record.metrics.racks.filter((rack:any)=>rack.deltaDeg>1 || [...rack.rearResiduals,...rack.frontResiduals,...rack.melds.flatMap((m:any)=>m.baselineResiduals)].some((d:number)=>Math.abs(d)>.75) || rack.melds.some((m:any)=>m.deltaDeg>1)).map((rack:any)=>`${record.browser} ${record.size.width} ${rack.position}: ${rack.deltaDeg.toFixed(2)}° rear=${rack.rearResiduals} front=${rack.frontResiduals} public=${rack.melds.map((m:any)=>m.baselineResiduals)}`));
console.log('ARTIFACT',dir,'rack alignment failures',failures);
assert.deepEqual(failures,[], 'actual z=0 floor axes must follow the painted seat lines within 1 degree');

assert.equal(output.length,66);
assert.equal(choiceOutput.length,54);
assert.equal(compositorOutput.length,18);
assert.deepEqual(runtimeErrors,[]);
console.log('PASS',output.length,'physical scenes;',choiceOutput.length,'choice cases;',choiceOutput.reduce((n,r)=>n+r.selections.length,0),'exact legal selections;',compositorOutput.length,'compositor frames');
