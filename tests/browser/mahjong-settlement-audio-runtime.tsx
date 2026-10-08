// Real native choices and mounted GameRoom; real Web Audio, no timer/audio mocks.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import {SettlementSequenceGame} from '../../src/modules/mahjong/settlement-sequence';
import type {Choice,RoomView,GameVariant} from '../../src/modules/mahjong/types';
const out=`.local/audit/settlement-audio-browser-${Date.now()}`;mkdirSync(out,{recursive:true});
const css=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>readFileSync(`src/app/mahjong/${m[1]}`,'utf8')).join('\n');
const harness=`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));let current,live=true,connected=true,busy=false;
function paint(){flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={current} ownSeat={0} host={false} connected={connected} busy={busy} motionCanAnimate={live} onChoice={async choice=>{busy=true;paint();try{current=await window.nativeAck({decisionId:current.game.decisionId,choiceId:choice.id});}finally{busy=false;paint();}}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/></div></main>));}
window.paintSound=(r,l=true,c=true)=>{current=r;live=l;connected=c;paint();};window.unmountSound=()=>flushSync(()=>root.unmount());`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',write:false,format:'iife',jsx:'automatic',metafile:true,define:{'process.env.NODE_ENV':'"development"'}});
const sha=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
writeFileSync(`${out}/manifest.json`,JSON.stringify({cssSha:sha(css),bundleSha:sha(bundle.outputFiles[0].text),sources:Object.keys(bundle.metafile!.inputs).filter(f=>!f.startsWith('<')).map(file=>({file,sha:sha(readFileSync(file))}))},null,2));
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const scenario of [
  ...(['sanma','yonma'] as const).flatMap(variant=>['tsumo','double-ron'].flatMap(kind=>[667,1440].map(width=>({variant,kind,width,interruption:'none'})))),
  ...['mute','disconnect','get','resize','unmount','late-join','reduced-motion'].map(interruption=>({variant:'sanma' as const,kind:'tsumo',width:844,interruption}))
 ]){
  const {variant,kind,width,interruption}=scenario,label=`${engine.name()}-${variant}-${kind}-${width}-${interruption}`;
  const count=variant==='sanma'?3:4;
  const game=new SettlementSequenceGame(physicalEngine(variant,kind==='double-ron'?{1:'p123456789s123z2',2:'p123456789s123z2'}:{0:variant==='sanma'?'p123456s123z5552':'m123p123s123z1112'},'z2'),count);
  const choose=(seat:number,type:Choice['type'],value?:string)=>{const v=game.view(seat),c=v.choices.find(c=>c.type===type&&(value===undefined||c.value===value));assert.ok(c);game.respond(seat,v.decisionId,c.id);};
  if(kind==='double-ron'){choose(0,'discard','z2_');choose(1,'ron');}
  let version=1;
  const view=():RoomView=>({id:label,code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:0,game:game.view(0),members:Array.from({length:count},(_,seat)=>({userId:String(seat),displayName:`玩家${seat}`,seat,kind:'human',ready:true,connected:true}))});
  const context=await browser.newContext({viewport:{width,height:width===1440?810:390},reducedMotion:interruption==='reduced-motion'?'reduce':'no-preference'});
  try{
   const page=await context.newPage(),errors:string[]=[],acks:unknown[]=[];page.on('pageerror',e=>{errors.push(e.message);console.error(label,e.message);});
   await page.exposeFunction('nativeAck',(input:{decisionId:string;choiceId:string})=>{
    const g=game.view(0);assert.equal(input.decisionId,g.decisionId);assert(g.choices.some(c=>c.type==='ack'&&c.id===input.choiceId));
    acks.push({stage:g.settlementFlow!.stage,index:g.settlementFlow!.detailIndex,age:g.settlementFlow!.elapsedMs});game.respond(0,input.decisionId,input.choiceId);version++;return view();
   });
   await page.route('https://mahjong.local/fonts/**',route=>route.fulfill({contentType:'font/woff2',body:readFileSync('public'+new URL(route.request().url()).pathname)}));
   await page.route('https://mahjong.local/images/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({contentType:path.endsWith('.svg')?'image/svg+xml':'image/webp',body:readFileSync(`public${path}`)});});
   await page.route('https://mahjong.local/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await page.goto('https://mahjong.local/');
   await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*:before,*:after{box-sizing:border-box}${css}</style><div id="root"></div>`);
   await page.addScriptTag({content:`window.playedSounds=[];window.audioContexts=[];const RealContext=window.AudioContext;window.AudioContext=function(...args){const c=new RealContext(...args);window.audioContexts.push(c);const create=c.createBufferSource.bind(c);c.createBufferSource=()=>{const s=create(),start=s.start;s.start=function(...args){const panel=document.querySelector('.mahjong-settlement-panel');window.playedSounds.push({at:performance.now(),duration:s.buffer.duration,offset:args[1]||0,stage:panel?.getAttribute('data-settlement-stage'),page:panel?.querySelector('.mahjong-settlement-panel__page')?.textContent,yaku:panel?.querySelectorAll('li.is-revealed').length||0,value:!!panel?.querySelector('.mahjong-settlement-panel__value.is-revealed')});return start.apply(s,args);};return s;};return c;};globalThis.process={env:{NODE_ENV:'development'}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});\n${bundle.outputFiles[0].text}`});
   const before=view();await page.evaluate(r=>(window as any).paintSound(r),before);await page.getByRole('button',{name:'关闭音效'}).click();await page.getByRole('button',{name:'开启音效'}).click();
   await page.waitForFunction(()=>(window as any).audioContexts.some((c:AudioContext)=>c.state==='running'));
   assert.equal(await page.evaluate(()=>(window as any).playedSounds.length),0);
   choose(kind==='double-ron'?2:0,kind==='double-ron'?'ron':'tsumo');version++;const after=view();
   if(interruption==='late-join'){await page.waitForTimeout(1600);await page.evaluate(r=>(window as any).paintSound(r),view());}
   else await page.evaluate(r=>{(window as any).acceptedAt=performance.now();(window as any).paintSound(r);},after);
   const detailPages=kind==='double-ron'?2:1;
   if(!['none','reduced-motion'].includes(interruption)){
    // All interruption paths consume the live transition before yaku begins.
    if(interruption==='mute'){await page.getByRole('button',{name:'关闭音效'}).click();await page.getByRole('button',{name:'开启音效'}).click();}
    if(interruption==='disconnect'){await page.evaluate(r=>(window as any).paintSound(r,true,false),after);await page.evaluate(r=>(window as any).paintSound(r),after);}
    if(interruption==='get'){await page.evaluate(r=>(window as any).paintSound(r,false),after);await page.evaluate(r=>(window as any).paintSound(r),after);}
    if(interruption==='resize')await page.setViewportSize({width:width+10,height:390});
    if(interruption==='unmount')await page.evaluate(()=>(window as any).unmountSound());
    await page.waitForTimeout(4000);
    const cues=await page.evaluate(()=>(window as any).playedSounds.filter((p:any)=>[.09,.24,.99].includes(p.duration)));
    assert.equal(cues.length,0,`${label}: no settlement catch-up`);
   }else{
    let expected=0;
    for(let index=0;index<detailPages;index++){
     const g=game.view(0),yaku=Math.min(15,g.settlement!.yaku.length);expected+=yaku+1;
     await page.waitForFunction(n=>(window as any).playedSounds.filter((p:any)=>[.09,.24].includes(p.duration)).length===n,expected);
     const cues=await page.evaluate(()=>(window as any).playedSounds.filter((p:any)=>[.09,.24].includes(p.duration)));
     const current=cues.slice(-(yaku+1));assert.equal(current.length,yaku+1);
     current.forEach((c:any,i:number)=>{assert.equal(c.stage,'detail');assert.match(c.page,new RegExp(`第 ${index+1} /`));if(i<yaku){assert.equal(c.duration,.09);assert(c.yaku>=i+1);}else{assert.equal(c.duration,.24);assert.equal(c.value,true);}});
     const button=page.getByRole('region',{name:'和牌详情'}).getByRole('button',{name:/继续/});await button.click();
     await page.waitForFunction(stage=>document.querySelector('.mahjong-settlement-panel')?.getAttribute('data-settlement-stage')===stage,index===detailPages-1?'scores':'detail');
    }
    if(interruption==='reduced-motion'){await page.waitForTimeout(2400);assert.equal(await page.evaluate(()=>(window as any).playedSounds.filter((p:any)=>p.duration===.99).length),0);}
    else{
     await page.waitForFunction(()=>(window as any).playedSounds.some((p:any)=>p.duration===.99));
     const roll=await page.evaluate(()=>(window as any).playedSounds.filter((p:any)=>p.duration===.99));assert.equal(roll.length,1);assert.equal(roll[0].stage,'scores');assert(roll[0].offset>=0&&roll[0].offset<.2);
    }
    const prior=await page.evaluate(()=>(window as any).playedSounds.length);await page.evaluate(r=>(window as any).paintSound(r,false),view());await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>(window as any).playedSounds.length),prior,'GET does not duplicate cues');
    assert.equal(acks.length,detailPages);
   }
   if(interruption!=='unmount')await page.evaluate(()=>(window as any).unmountSound());
   await page.waitForFunction(()=>(window as any).audioContexts.every((c:AudioContext)=>c.state==='closed'));
   assert.deepEqual(errors,[]);const proof={label,...scenario,acks,played:await page.evaluate(()=>(window as any).playedSounds)};
   writeFileSync(`${out}/${label}.json`,JSON.stringify(proof,null,2));results.push(proof);console.log(`PASS ${label}: native GameRoom, actual buffers/visible phase, no duplicate/late replay, context closed`);
  }finally{await context.close();}
 }}finally{await browser.close();}
}
writeFileSync(`${out}/summary.json`,JSON.stringify({results},null,2));console.log(`PASS ${results.length} actual settlement audio scenes in ${out}`);
