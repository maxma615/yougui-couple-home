// Native fresh-page input and projected/compositor geometry regression.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium, webkit, type Page} from '@playwright/test';
import Majiang from '@kobalab/majiang-core';
import {RiichiGame} from '../../src/modules/mahjong/engine';
import {SanmaGame} from '../../src/modules/mahjong/sanma';
import {SanmaWall, sanmaTiles} from '../../src/modules/mahjong/sanma-wall';
import {northReplacementFixture} from '../fixtures/mahjong-view-game';
import {projectedSampleScript} from './projected-samples';
import type {RoomView} from '../../src/modules/mahjong/types';

const out = `.local/audit/seat-drag-${process.env.SEAT_STAGE || 'green'}-${Date.now()}`;
mkdirSync(out, {recursive: true});
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const cssFiles = [...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>m[1]);
const sourceFiles = ['public/fonts/mahjong-brush.woff2','tests/browser/mahjong-seat-drag.tsx','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts','tests/fixtures/mahjong-view-game.ts','src/components/mahjong/mahjong-client.tsx', ...cssFiles.map(f => 'src/app/mahjong/'+f)];
const sources = Object.fromEntries(sourceFiles.map(f => [f, sha(readFileSync(f))]));
const css = cssFiles.map(f => readFileSync('src/app/mahjong/'+f,'utf8')).join('\n');
const harness = `import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.choices=[];window.renderRoom=(room,opts={})=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,ownSeat:room.mySeat,host:true,busy:opts.busy??false,connected:opts.connected??true,motionCanAnimate:false,onChoice:(choice,intent)=>window.choices.push({choice,intent}),onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}})))));`;
const bundle = (await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text;
writeFileSync(out+'/bundle.js',bundle); writeFileSync(out+'/style.css',css);
const names = ['甲','乙','丙','丁'];
type Point = {x: number; y: number};
// Separating-axis test on browser-projected convex quads. Their AABBs can
// overlap even while the physical faces have a visible gap under perspective.
function overlaps(a: Point[], b: Point[]) {
  const area=(p:Point[])=>Math.abs(p.reduce((sum,v,i)=>sum+v.x*p[(i+1)%p.length].y-p[(i+1)%p.length].x*v.y,0));
  if(area(a)<.1||area(b)<.1) return false;
  for(const polygon of [a,b]) for(let i=0;i<polygon.length;i++) {
    const p=polygon[i],next=polygon[(i+1)%polygon.length],axis={x:next.y-p.y,y:p.x-next.x};
    const project=(quad:Point[])=>quad.map(v=>v.x*axis.x+v.y*axis.y),pa=project(a),pb=project(b);
    if(Math.max(...pa)<=Math.min(...pb)||Math.max(...pb)<=Math.min(...pa)) return false;
  }
  return true;
}
function inside(point: Point, quad: Point[]) {
  const signs=quad.map((p,i)=>{const n=quad[(i+1)%quad.length];return(n.x-p.x)*(point.y-p.y)-(n.y-p.y)*(point.x-p.x);});
  return signs.every(v=>v>=-.5)||signs.every(v=>v<=.5);
}
function room(game: RiichiGame | SanmaGame, viewer = 0, version = 1): RoomView {
  const gameView = structuredClone(game.view(viewer));
  return {id:'seat-drag-real-engine',code:'ABCDEFGH',hostUserId:'user-0',mode:'east',variant:gameView.players.length===3?'sanma':'yonma',status:'playing',version,mySeat:viewer,game:gameView,members:names.slice(0,gameView.players.length).map((displayName,seat)=>({userId:'user-'+seat,displayName,seat,kind:'human',ready:true,connected:true}))};
}
// Identical physical deal to retained seat-drag audit; no hand DTO mutation.
function ordinaryGame() {
  return new RiichiGame('east',names,{dealer:0,wallFactory:rule=>{
    const wall=new Majiang.Shan(rule),available=wall._pai.slice();
    const take=(tile:string)=>{const i=available.indexOf(tile);assert.ok(i>=0,`physical tile ${tile}`);return available.splice(i,1)[0];};
    const hand=[...'z777p123s123m19z12'.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>take(m[1]+n)));
    const draw=take('z7'),hands=[hand,...[1,2,3].map(()=>available.splice(0,13))];
    wall._pai=[...available,...[...hands.flat(),draw].reverse()];wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];return wall;
  }});
}
function fourNorthGame() {
  return new SanmaGame('east',names.slice(0,3),{dealer:0,wallFactory:()=>{
    const available=sanmaTiles(),take=(tile:string)=>{const i=available.indexOf(tile);assert.ok(i>=0,`physical tile ${tile}`);return available.splice(i,1)[0];};
    const hand=[...'m19p1234s123z2444'.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>take(m[1]+n)));
    assert.equal(hand.length,13);
    const draw=take('z4'),reserve=['s4','s5','s6','s7'].map(take),others=available.splice(0,26),indicators=available.splice(0,10);
    return new SanmaWall([...hand,...others,draw,...available,...reserve,...indicators]);
  }});
}
function extract(game: SanmaGame, count: number) {
  for(let i=0;i<count;i++) {
    const v=game.view(0),choice=v.choices.find(c=>c.type==='nuki');assert.ok(choice,'real legal nuki');game.respond(0,v.decisionId,choice.id);
    for(const seat of [1,2]) {const other=game.view(seat),pass=other.choices.find(c=>c.type==='pass');if(pass)game.respond(seat,other.decisionId,pass.id);}
    assert.equal(game.view(0).phase,'nukizimo');
  }
  const v=game.view(0),discard=v.choices.find(c=>c.type==='discard');assert.ok(discard);game.respond(0,v.decisionId,discard.id);
}
async function mount(page: Page, r: RoomView) {
  await page.route('https://mahjong.local/fonts/**',route=>route.fulfill({body:readFileSync('public'+new URL(route.request().url()).pathname),contentType:'font/woff2'}));
  await page.route('https://mahjong.local/images/**',route=>route.fulfill({body:readFileSync('public'+new URL(route.request().url()).pathname),contentType:route.request().url().endsWith('.svg')?'image/svg+xml':'image/webp'}));
  await page.setContent(`<base href="https://mahjong.local/"><style>*{box-sizing:border-box}body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}${css}</style><div id="root"></div>`);
  await page.addScriptTag({content:`globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}\n${projectedSampleScript}`});
  await page.evaluate(r=>(window as any).renderRoom(r),r);
  await page.evaluate(()=>window.addEventListener('pointermove',event=>{(window as any).lastPointerPosition={x:event.clientX,y:event.clientY};},true));
  await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth===300));
  await page.evaluate(()=>document.fonts.ready);
}
const records: any[] = [];
for(const engine of [chromium,webkit]) {
  const browser=await engine.launch();
  try {
    for(const viewport of [{width:667,height:375},{width:844,height:390},{width:1440,height:810}]) {
      for(const kind of ['ordinaryClearRackDrop','centerControl','dragBack','outsideBoard','hud','opponentRack','pointercancel','lostCapture','changedDecision','disconnected','busy','earlyCaptureLoss','viewportResize','orientationChange','tableResize','fullscreenChange','windowBlur','pageHide','hiddenPage'].filter(kind=>!process.env.SEAT_INPUT_ONLY||process.env.SEAT_INPUT_ONLY.split(',').includes(kind))) {
        const game=ordinaryGame(),r=room(game),page=await browser.newPage({viewport}),errors:string[]=[];
        page.on('pageerror',e=>errors.push(e.message));
        const record:any={engine:engine.name(),viewport,kind,snapshotHash:sha(JSON.stringify(r))};
        try {
          await mount(page,r);
          const tile=page.locator('.mahjong-hand > button:not([disabled])').nth(5);
          if(kind==='earlyCaptureLoss'||['viewportResize','orientationChange','tableResize','fullscreenChange','windowBlur','pageHide','hiddenPage'].includes(kind)) {await tile.click();assert.equal(await tile.getAttribute('aria-pressed'),'true');}
          await tile.hover();await page.waitForTimeout(180);
          const box=(await tile.boundingBox())!;assert.ok(box);
          const sourceId=await tile.getAttribute('data-hand-instance-id');assert.equal(sourceId,'hand:5:s1');
          const geom=await page.evaluate(()=>({rackTop:document.querySelector('.mahjong-hand')!.getBoundingClientRect().top,center:(window as any).mahjongPhysicalSamples(document.querySelector('.mahjong-table__center'),[[.5,.5]])[0]}));
          const start={x:box.x+box.width/2,y:box.y+box.height/2};
          let target={x:start.x,y:geom.rackTop-box.height-20};
          if(kind==='centerControl') target=geom.center;
          if(kind==='earlyCaptureLoss') target={x:start.x+3,y:start.y};
          if(kind==='outsideBoard') target={x:1,y:1};
          if(kind==='hud') target=await page.evaluate(()=>(window as any).mahjongPhysicalSamples(document.querySelector('.mahjong-table__dora'),[[.5,.5]])[0]);
          if(kind==='opponentRack') target=await page.evaluate(()=>{
            for(const face of document.querySelectorAll('.mahjong-opponent-rack .mahjong-standing-tile__face')) {
              for(const point of (window as any).mahjongPhysicalSamples(face,[[.5,.5],[.25,.25],[.75,.75]])) {
                const nativePoint={...point,x:Math.floor(point.x),y:Math.floor(point.y)};
                if(document.elementFromPoint(nativePoint.x,nativePoint.y)?.closest('.mahjong-opponent-rack')) return nativePoint;
              }
            }
            throw new Error('no actual opponent tile paint hit');
          });
          await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:10});await page.waitForTimeout(35);
          if(kind==='dragBack') {target=start;await page.mouse.move(start.x,start.y,{steps:10});}
          const preview=await page.evaluate(p=>{const tile=document.querySelector<HTMLButtonElement>('[data-hand-instance-id="hand:5:s1"]');const native=(window as any).lastPointerPosition;return {native,nativeHit:native?document.elementFromPoint(native.x,native.y)?.className:null,nativeRack:native?Boolean(document.elementFromPoint(native.x,native.y)?.closest('.mahjong-opponent-rack')):null,hit:document.elementFromPoint(p.x,p.y)?.className,capture:tile?.hasPointerCapture(1),drag:tile?.classList.contains('is-dragging'),target:document.querySelector('.mahjong-table')?.classList.contains('is-discard-target'),rect:tile?.getBoundingClientRect().toJSON()};},target);
          record.setupSuccess=true;record.sourceId=sourceId;record.start=start;record.target=target;record.geometry=geom;record.preview=preview;
          assert.equal(preview.capture,true,'native capture must succeed before behavior assertion');assert.equal(preview.drag,kind!=='earlyCaptureLoss');
          if(kind==='ordinaryClearRackDrop') {assert.equal(preview.hit,'mahjong-table__surface');assert.ok(preview.rect.bottom<geom.rackTop,'whole painted tile clears original rack');}
          if(kind==='pointercancel') await tile.dispatchEvent('pointercancel',{pointerId:1,isPrimary:true,clientX:target.x,clientY:target.y});
          if(kind==='lostCapture'||kind==='earlyCaptureLoss') {await tile.evaluate(e=>(e as HTMLButtonElement).releasePointerCapture(1));await page.mouse.move(target.x+1,target.y,{steps:2});}
          if(['viewportResize','orientationChange','tableResize','fullscreenChange','windowBlur','pageHide','hiddenPage'].includes(kind)) {
            if(kind==='viewportResize') await page.setViewportSize({width:viewport.width+40,height:viewport.height});
            else if(kind==='orientationChange') await page.evaluate(()=>window.dispatchEvent(new Event('orientationchange')));
            else if(kind==='tableResize') await page.evaluate(()=>{const table=document.querySelector<HTMLElement>('.mahjong-table')!;table.style.width=(table.clientWidth-40)+'px';});
            else if(kind==='windowBlur') await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
            else if(kind==='pageHide') await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
            else if(kind==='hiddenPage') await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
            else await page.evaluate(()=>document.dispatchEvent(new Event('fullscreenchange',{bubbles:true})));
            await page.waitForTimeout(60);
            assert.equal(await page.locator('.is-dragging').count(),0,'geometry change cancels the active drag before release');
            assert.equal(await page.locator('.is-discard-target').count(),0,'geometry change clears the old drop target');
            assert.equal(await tile.evaluate(el=>el.hasPointerCapture(1)),false,'geometry change releases actual native capture before pointer-up');
            assert.equal(await tile.getAttribute('aria-pressed'),'false','geometry change clears a previous selection before pointer-up');
          }
          if(kind==='changedDecision') {game.respond(0,r.game!.decisionId,'discard:s1');const next=room(game,0,2);assert.notEqual(next.game!.decisionId,r.game!.decisionId);await page.evaluate(r=>(window as any).renderRoom(r),next);}
          if(kind==='disconnected'||kind==='busy') await page.evaluate(({r,kind})=>(window as any).renderRoom(r,{connected:kind!=='disconnected',busy:kind==='busy'}),{r,kind});
          await page.screenshot({path:`${out}/${engine.name()}-${viewport.width}-${kind}-preview.png`});
          await page.mouse.up();await page.waitForTimeout(60);
          const choices=await page.evaluate(()=>(window as any).choices);record.choices=choices;
          const accepted=kind==='ordinaryClearRackDrop'||kind==='centerControl';
          if(accepted) assert.equal(preview.target,true,'preview and release share playable region');
          assert.equal(await page.locator('.is-dragging').count(),0,'release or cancellation clears drag');
          assert.equal(await page.locator('.is-discard-target').count(),0,'release or cancellation clears target');
          assert.equal(choices.length,accepted?1:0,`${kind}: expected exact ordinary Choice once or cancellation`);
          if(accepted) {
            assert.deepEqual(choices[0].choice,r.game!.choices.find(c=>c.id==='discard:s1'));
            assert.equal(choices[0].intent.sourceTileId,sourceId);assert.equal(choices[0].intent.choiceId,'discard:s1');
            assert.ok(choices[0].intent.sourceGeometry.quad,'actual source quad');
            assert.ok(Math.abs(choices[0].intent.sourceRect.top-preview.rect.y)<1,'intent captures actual dragged source');
            assert.equal(await page.locator('.is-dragging').count(),0);
            await page.mouse.up();assert.equal((await page.evaluate(()=>(window as any).choices)).length,1);
            game.respond(0,r.game!.decisionId,choices[0].choice.id);assert.equal(game.view(0).players[0].discards.at(-1)?.replace(/[_*]/g,''),'s1');
          }
          if(['viewportResize','orientationChange','tableResize','fullscreenChange','windowBlur','pageHide','hiddenPage'].includes(kind)) {
            if(kind==='hiddenPage') await page.evaluate(()=>{Reflect.deleteProperty(document,'visibilityState');document.dispatchEvent(new Event('visibilitychange'));});
            const fresh=(await tile.boundingBox())!;assert.ok(fresh);
            const nextStart={x:fresh.x+fresh.width/2,y:fresh.y+fresh.height/2};
            const nextTarget=await page.evaluate(()=>(window as any).mahjongPhysicalSamples(document.querySelector('.mahjong-table__center'),[[.5,.5]])[0]);
            await page.mouse.move(nextStart.x,nextStart.y);await page.mouse.down();await page.mouse.move(nextTarget.x,nextTarget.y,{steps:10});await page.mouse.up();await page.waitForTimeout(60);
            const resumed=await page.evaluate(()=>(window as any).choices);
            assert.equal(resumed.length,1,'fresh press after cancellation still discards once');
            assert.deepEqual(resumed[0].choice,r.game!.choices.find(c=>c.id==='discard:s1'));
            game.respond(0,r.game!.decisionId,resumed[0].choice.id);assert.equal(game.view(0).players[0].discards.at(-1)?.replace(/[_*]/g,''),'s1');
            record.resumedChoice=resumed[0].choice;
          }
          assert.deepEqual(errors,[]);record.pass=true;
        } catch(error) {record.failure=String(error);console.error('FAIL',engine.name(),viewport.width,kind,record.failure);} finally {await page.close();records.push(record);}
      }
      for(const count of (process.env.SEAT_INPUT_ONLY?[]:[1,4])) for(const viewer of [1,2]) {
        const game=count===1?northReplacementFixture():fourNorthGame();extract(game,count);
        const r=room(game,viewer,3),stem=`${engine.name()}-${viewport.width}-north${count}-viewer${viewer}`;
        const context=await browser.newContext({viewport,recordVideo:{dir:out+'/videos',size:{width:viewport.width+viewport.width%2,height:viewport.height+viewport.height%2}}}),page=await context.newPage();
        const record:any={engine:engine.name(),viewport,kind:'sideNorthSharesSeatPlane',count,viewer,snapshotHash:sha(JSON.stringify(r))};
        try {
          await mount(page,r);await page.waitForTimeout(140);
          record.geometry=await page.evaluate(()=>{
            const q=(e:Element)=>(window as any).mahjongPhysicalSamples(e,[[0,0],[1,0],[1,1],[0,1]]);
            const tray=document.querySelector<HTMLElement>('[data-nuki-seat="0"]')!,group=tray.querySelector<HTMLElement>('.mahjong-nuki-tray__tiles')!,rack=document.querySelector('[data-motion-rack-seat="0"]')!.parentElement!;
            return {groupTransform:getComputedStyle(group).transform,rackTransform:getComputedStyle(rack).transform,position:rack.closest('.mahjong-table__position')?.className,groupQuad:q(group),trayQuad:q(tray),countTransform:getComputedStyle(tray.querySelector('small')!).transform,countUpright:(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(tray.querySelector('small')!).transform);return [m.m11,m.m22,m.m33,m.m44].every(v=>Math.abs(v-1)<.001)&&[m.m12,m.m13,m.m14,m.m21,m.m23,m.m24,m.m31,m.m32,m.m34,m.m41,m.m42].every(v=>Math.abs(v)<.001)&&m.m43>=0;})(),tiles:[...group.querySelectorAll<HTMLElement>('.mahjong-tile')].map(e=>({quad:q(e),footprint:q(e.closest('[data-nuki-volume]')!.querySelector('[data-flight-base]')!),center:(window as any).mahjongPhysicalSamples(e,[[.5,.5]])[0]})),rackQuad:q(rack),riverQuads:[...document.querySelectorAll('.mahjong-river')].map(q)};
          });
          record.setupSuccess=true;
          await page.screenshot({path:out+'/'+stem+'-snapshot.png'});await page.waitForTimeout(120);
          const g=record.geometry,sign=viewer===1?1:-1;
          assert.equal(g.tiles.length,count,'exact cumulative physical Norths');
          const matrix=g.groupTransform.match(/matrix\(([^)]+)\)/)?.[1].split(',').map(Number);
          assert.ok(matrix&&Math.abs(matrix[0])<.001&&Math.abs(matrix[1]-sign)<.001&&Math.abs(matrix[2]+sign)<.001&&Math.abs(matrix[3])<.001,'side North physical group must share local ±90° seat plane');
          assert.equal(g.countUpright,true,'count remains upright while its existing physical height may translate Z');
          const box=(points:any[])=>({left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))});
          const trayBox=box(g.trayQuad);record.trayBounds=trayBox;
          for(const tile of g.tiles) {
            for(const p of tile.quad) assert.ok(p.x>0&&p.x<viewport.width&&p.y>0&&p.y<viewport.height,'full elevated North face inside viewport');
            for(const p of tile.footprint) assert.ok(inside(p,g.trayQuad),'physical North footprint reserved by actual tray quad');
            const visible=await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('[data-nuki-seat="0"]'),tile.center);assert.ok(visible,'North center visible in actual hit geometry');
          }
          assert.equal(overlaps(g.trayQuad,g.rackQuad),false,'tray does not cover actual rack quad');
          for(const riverQuad of g.riverQuads) assert.equal(overlaps(g.trayQuad,riverQuad),false,'tray does not cover actual river quad');
          record.pass=true;
        } catch(error) {record.failure=String(error);console.error('FAIL',stem,record.failure);} finally {
          const video=page.video()!;await context.close();
          execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-sseof','-0.05','-i',await video.path(),'-frames:v','1','-y',out+'/'+stem+'-compositor.png']);
          record.compositor=out+'/'+stem+'-compositor.png';records.push(record);
        }
      }
    }
  } finally {await browser.close();}
}
assert.deepEqual(Object.fromEntries(sourceFiles.map(f=>[f,sha(readFileSync(f))])),sources,'tested sources must remain unchanged');
writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleHash:sha(bundle),cssHash:sha(css),records},null,2));
console.log('ARTIFACT',out,'PASS',records.filter(r=>r.pass).length,'FAIL',records.filter(r=>!r.pass).length);
assert.equal(records.filter(r=>!r.pass).length,0,'browser regression failures (see unique proof)');
