// Real-engine public racks: volume, original materials and actual painted faces.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chromium,webkit} from '@playwright/test';
import sharp from 'sharp';
import {GameRoom} from '../../src/components/mahjong/mahjong-client';
import {RiichiGame} from '../../src/modules/mahjong/engine';
import {SanmaGame} from '../../src/modules/mahjong/sanma';
import {SanmaWall,sanmaTiles} from '../../src/modules/mahjong/sanma-wall';
import {northReplacementFixture} from '../fixtures/mahjong-view-game';
import {projectedSampleScript} from './projected-samples';
import type {RoomView} from '../../src/modules/mahjong/types';

const css=['mahjong.css','mahjong-river.css','mahjong-meld.css','mahjong-interaction.css','mahjong-discard-motion.css','mahjong-table-center.css','mahjong-table-edge.css','mahjong-camera.css','mahjong-call-announcement.css','mahjong-standing-tile.css'].filter(n=>existsSync(`src/app/mahjong/${n}`)).map(n=>readFileSync(`src/app/mahjong/${n}`,'utf8')).join('\n');
const scenarios=['yonma','sanma'].map(variant=>{
 const names=variant==='yonma'?['A','B','C','D']:['A','B','C'];
 const game=variant==='yonma'?new RiichiGame('east',names,{dealer:0}):northReplacementFixture();
 const room=(version:number):RoomView=>({id:`standing-${variant}`,code:'ABCDEFGH',hostUserId:'0',mode:'east',variant:variant as 'yonma'|'sanma',status:'playing',version,mySeat:0,game:game.view(0),members:names.map((displayName,seat)=>({userId:String(seat),displayName,seat,kind:'human',connected:true,ready:true}))});
 const before=room(1),choice=game.view(0).choices.find(c=>c.type===(variant==='sanma'?'nuki':'discard'));assert.ok(choice);game.respond(0,game.view(0).decisionId,choice.id);
 if(variant==='yonma') for(let seat=1;seat<4;seat++){const v=game.view(seat),pass=v.choices.find(c=>c.type==='pass');if(pass)game.respond(seat,v.decisionId,pass.id);}
 const after=room(2);if(variant==='sanma')assert.equal(after.game!.players[0].nuki,1);else assert.ok(after.game!.players.find(p=>p.seat===1)?.hasDrawnTile);
 return {variant,name:variant,ownSeat:0,before,after};
});

// A legal kan replacement has eleven concealed tiles and four public kan
// tiles. It extends a side rack farther than an ordinary pon, so it also
// needs to clear the indicators in a short landscape viewport.
const kanGame=new SanmaGame('east',['A','B','C'],{dealer:0,wallFactory:()=>{
 const available=sanmaTiles();
 const take=(tile:string)=>{const index=available.indexOf(tile);assert.ok(index>=0,`physical fixture exhausted ${tile}`);return available.splice(index,1)[0];};
 const tiles=(text:string)=>[...text.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>take(m[1]+n)));
 const hands=['z777p123s123m19z14','p23456s456789z23','p789s123456z4565'].map(tiles),draw=take('z7'),northReplacement=take('s8');
 const reserve=[northReplacement,...available.splice(0,3)],indicators=available.splice(0,10);
 return new SanmaWall([...hands.flat(),draw,...available,...reserve,...indicators]);
}});
const passKanReactions=()=>{for(const seat of [1,2]){const v=kanGame.view(seat),p=v.choices.find(c=>c.type==='pass');if(p)kanGame.respond(seat,v.decisionId,p.id);}};
for(const type of ['nuki','kan']){
 const v=kanGame.view(0),choice=v.choices.find(c=>c.type===type&&(type!=='kan'||c.value==='z7777'));assert.ok(choice,`actual engine offers ${type}`);
 kanGame.respond(0,v.decisionId,choice.id);passKanReactions();
}
assert.equal(kanGame.view(0).phase,'gangzimo');
const kanRoom=(version:number):RoomView=>({id:'standing-sanma-kan',code:'ABCDEFGH',hostUserId:'0',mode:'east',variant:'sanma',status:'playing',version,mySeat:1,game:structuredClone(kanGame.view(1)),members:['A','B','C'].map((displayName,seat)=>({userId:String(seat),displayName,seat,kind:'human',connected:true,ready:true}))});
const kanBefore=kanRoom(1),actor=kanBefore.game!.players.find(p=>p.seat===0)!;
assert.equal(actor.handCount,11);assert.deepEqual(actor.melds,['z7777']);assert.equal(actor.nuki,1);
const discard=kanGame.view(0).choices.find(c=>c.type==='discard');assert.ok(discard);kanGame.respond(0,kanGame.view(0).decisionId,discard.id);passKanReactions();
scenarios.push({variant:'sanma',name:'sanma-kan',ownSeat:1,before:kanBefore,after:kanRoom(2)});
mkdirSync('.local/audit/standing-tile-video',{recursive:true});const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  for(const size of [{width:667,height:375},{width:844,height:390},{width:1440,height:810}])for(const scenario of scenarios){
   const context=await browser.newContext({viewport:size,...(engine===webkit?{recordVideo:{dir:'.local/audit/standing-tile-video',size:{width:size.width+size.width%2,height:size.height+size.height%2}}}:{})});const page=await context.newPage();
   await page.route('https://mahjong.local/images/**',r=>r.fulfill({body:readFileSync(`public${new URL(r.request().url()).pathname}`),contentType:r.request().url().endsWith('.svg')?'image/svg+xml':'image/webp'}));
   for(const [stage,room] of [['before',scenario.before],['after',scenario.after]] as const){
    const noop=()=>{},html=renderToStaticMarkup(createElement(GameRoom,{room,ownSeat:scenario.ownSeat,host:true,busy:false,connected:true,onChoice:noop,onFinish:noop,onLeave:noop,onRematch:noop}));
    await page.setContent(`<base href="https://mahjong.local/"><style>*{box-sizing:border-box}body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}${css}</style><main class="mahjong-page"><div class="mahjong-shell">${html}</div></main>`);await page.addScriptTag({content:'globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});'+projectedSampleScript});
    const publicBacks=await page.evaluate(()=>{
     const material=(e:Element)=>{const s=getComputedStyle(e);return {color:s.backgroundColor,image:s.backgroundImage,border:s.borderColor};};
     return {standing:material(document.querySelector('[data-standing-face="back"]')!),public:[...document.querySelectorAll('.mahjong-meld--public .mahjong-meld__back')].map(material),indicators:[...document.querySelectorAll('.mahjong-indicator-back')].map(material)};
    });
    if(scenario.name==='sanma-kan')assert.equal(publicBacks.public.length,2,'real concealed kan retains two public back tiles');
    for(const material of [...publicBacks.public,...publicBacks.indicators])assert.deepEqual(material,publicBacks.standing,'public kan and indicator backs share the standing-rack material');
    const metric=await page.evaluate(()=>{
     const sample=(e:Element)=> (window as any).mahjongPhysicalSamples(e,[[0,0],[1,0],[1,1],[0,1]]) as {x:number,y:number}[];
     const area=(q:{x:number,y:number}[])=>Math.abs(q.reduce((sum,p,i)=>sum+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
     const surface=document.querySelector('.mahjong-table__surface')!;
     const overlaps=(a:{x:number,y:number}[],b:{x:number,y:number}[])=>{
      for(const q of [a,b])for(let i=0;i<q.length;i++){
       const next=q[(i+1)%q.length],axis={x:-(next.y-q[i].y),y:next.x-q[i].x};
       const left=a.map(p=>p.x*axis.x+p.y*axis.y),right=b.map(p=>p.x*axis.x+p.y*axis.y);
       if(Math.max(...left)<=Math.min(...right)+.25||Math.max(...right)<=Math.min(...left)+.25)return false;
      }
      return true;
     };
     const hud=[...document.querySelectorAll<HTMLElement>('.mahjong-table__dora,.mahjong-player__head,.mahjong-action-dock')].map(e=>{
      const r=e.getBoundingClientRect();return {name:e.className,area:r.width*r.height,q:[{x:r.left,y:r.top},{x:r.right,y:r.top},{x:r.right,y:r.bottom},{x:r.left,y:r.bottom}]};
     }).filter(e=>e.area>0);
     return [...document.querySelectorAll<HTMLElement>('[data-motion-rack-seat]')].map(rack=>{
      const tiles=[...rack.querySelectorAll<HTMLElement>(':scope>i')],tile=tiles[Math.floor(tiles.length/2)];
      const meshPoints=tiles.flatMap(t=>[...t.querySelectorAll<HTMLElement>('[data-standing-face]')].flatMap(sample));
      const backs=tiles.flatMap(t=>{const f=t.querySelector('[data-standing-face="back"]');return f?sample(f):[]});
      const back=tile.querySelector<HTMLElement>('[data-standing-face="back"]'),top=tile.querySelector<HTMLElement>('[data-standing-face="top"]');
      const occludedBackSamples=tiles.flatMap(t=>(window as any).mahjongPhysicalSamples(t.querySelector('[data-standing-face="back"]')).filter((p:{x:number,y:number})=>{const hit=document.elementFromPoint(p.x,p.y);return !hit||!surface.contains(hit);}));
      const hudOverlaps=tiles.flatMap((t,index)=>[...t.querySelectorAll<HTMLElement>('[data-standing-face="back"],[data-standing-face="top"]')].flatMap(face=>hud.filter(h=>overlaps(sample(face),h.q)).map(h=>({index,face:face.dataset.standingFace,hud:h.name}))));
      return {seat:Number(rack.dataset.motionRackSeat),occludedBackSamples,hudOverlaps,meshPoints,position:rack.closest('.mahjong-table__position')?.className,backSpan:backs.length?Math.max(...backs.map(p=>p.x))-Math.min(...backs.map(p=>p.x)):0,tileCount:tiles.length,faceCounts:tiles.map(t=>t.querySelectorAll('[data-standing-face]').length),hasSecret:!!rack.querySelector('img,[data-tile-face]'),drawn:tiles.filter(t=>t.dataset.motionDrawn==='true').length,back:back?{q:sample(back),area:area(sample(back)),center:(window as any).mahjongPhysicalSamples(back,[[.5,.5]])[0],transform:getComputedStyle(back).transform}:null,top:top?{q:sample(top),area:area(sample(top)),center:(window as any).mahjongPhysicalSamples(top,[[.5,.5]])[0]}:null,preserve:[rack,rack.parentElement,rack.closest('.mahjong-player'),rack.closest('.mahjong-table__surface')].map(e=>e?getComputedStyle(e).transformStyle:null)};
     });
    });
    for(const rack of metric){
     assert.ok(rack.faceCounts.every(n=>n===6),'opponent tiles must have six physical faces, rather than the previous single painted rectangle');
     assert.deepEqual(rack.occludedBackSamples,[],`${scenario.name} ${engine.name()} ${size.width} seat ${rack.seat}: all physical backs clear the indicators and other HUD`);
     assert.deepEqual(rack.hudOverlaps,[],`${scenario.name} ${engine.name()} ${size.width} seat ${rack.seat}: complete visible-face quads clear HUD bounds`);
     assert.ok(rack.meshPoints.every(p=>p.x>=-.5&&p.y>=-.5&&p.x<=size.width+.5&&p.y<=size.height+.5),'the entire cuboid rack must remain on screen after entering the shared 3D context');
     if(rack.position?.includes('--north'))assert.ok(rack.backSpan/size.width>.27&&rack.backSpan/size.width<.36,'far concealed row should approach the approximately 31% stage width observed in the official sequence');
     assert.equal(rack.hasSecret,false,'concealed cuboid contains no opponent face value or art');
     assert.ok(rack.back&&rack.back.area>2&&rack.top&&rack.top.area>2,'upright back and horizontal top both have a nondegenerate projected surface');
     assert.ok(rack.preserve.every(s=>s==='preserve-3d'),'all rack-to-camera wrappers keep the physical height');
     const actual=room.game!.players.find(p=>p.seat===rack.seat)!;assert.equal(rack.tileCount,actual.handCount);assert.equal(rack.drawn,actual.hasDrawnTile?1:0);
    }
    if(scenario.variant==='sanma'&&stage==='after')assert.equal(await page.getByTestId('nuki-tiles-0').locator('[data-tile-face="z4"]').count(),1,'North remains a physical public tile');
    results.push({browser:engine.name(),variant:scenario.variant,scenario:scenario.name,size,stage,publicBacks,racks:metric});
   }
   await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i=>i.complete&&i.naturalWidth===300));await page.waitForTimeout(300);
   const stem=`.local/audit/standing-tile-${engine.name()}-${scenario.name}-${size.width}`;let pixels=await page.screenshot({path:stem+'-snapshot.png'});const video=page.video();await context.close();
   if(video){const path=await video.path();execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-sseof','-0.05','-i',path,'-frames:v','1','-y',stem+'-compositor.png']);pixels=readFileSync(stem+'-compositor.png');}
   const {data,info}=await sharp(pixels).removeAlpha().raw().toBuffer({resolveWithObject:true});
   const last=results[results.length-1] as any;
   for(const rack of last.racks){
    for(const face of ['back','top']){
     const center=rack[face].center,x=Math.round(center.x),y=Math.round(center.y);assert.ok(x>0&&x<info.width&&y>0&&y<info.height,'physical face paints inside the viewport');
     const offset=(y*info.width+x)*info.channels,rgb=[...data.subarray(offset,offset+3)];
     // Original warm back / pale body. Broad classes accommodate VP8 chroma.
     assert.ok(face==='back'?rgb[0]>100&&rgb[0]>rgb[2]*1.3&&rgb[1]>55:rgb[0]>145&&rgb[1]>140&&rgb[2]>110,`${engine.name()} ${scenario.variant} ${size.width} ${rack.seat} ${face} must actually paint at its projected center; got ${rgb}`);
     rack[face].paintedRGB=rgb;
    }
   }
   console.log(`PASS ${engine.name()} ${scenario.name} ${size.width}: physical volume and compositor pixels`);
  }
 }finally{await browser.close();}
}
writeFileSync('.local/audit/standing-tile-browser-proof.json',JSON.stringify({states:results.length,results},null,2));console.log(`${results.length} real-engine standing-rack states verified.`);
