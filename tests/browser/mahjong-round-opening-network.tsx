import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Server,type Socket} from 'socket.io';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {RoomStore,parseMahjongCommand} from '../../src/modules/mahjong/rooms';
import {randomUUID} from 'node:crypto';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {MahjongResponse} from '../../src/modules/mahjong/types';
const out='.local/audit/round-opening-network-'+Date.now();mkdirSync(out,{recursive:true});
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import \"\.\/(mahjong[^\"\n]*\.css)\";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['tests/browser/mahjong-round-opening-network.tsx','src/components/mahjong/use-round-opening.ts','src/components/mahjong/use-opening-sort.ts','src/components/mahjong/hand-rack.ts','src/components/mahjong/blank-table-action.ts','src/components/mahjong/use-blank-table-double-tap.ts','src/modules/mahjong/round-opening.ts','src/modules/mahjong/rooms.ts','src/modules/mahjong/settlement-sequence.ts','src/components/mahjong/use-table-audio.ts','src/components/mahjong/table-audio.ts','src/components/mahjong/mahjong-standing-tile.tsx','src/modules/mahjong/bot-runner.ts','tests/fixtures/mahjong-round-opening-reference.json','tests/fixtures/mahjong-automatic-round-reference.json','tests/fixtures/mahjong-settlement-game.ts','src/components/mahjong/use-automatic-play.ts','src/components/mahjong/automatic-choice.ts','src/components/mahjong/mahjong-client.tsx','src/hooks/use-session.tsx','src/components/api-client.ts','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts',...cssFiles];
const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MahjongClient}from'./src/components/mahjong/mahjong-client';createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(MahjongClient)));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'local-next-navigation',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'local-navigation'}));b.onLoad({filter:/.*/,namespace:'local-navigation'},()=>({contents:`const router={replace:url=>{window.navigationRequests??=[];window.navigationRequests.push(url)}};export const useRouter=()=>router;export const usePathname=()=>'/mahjong';`,loader:'js'}));}}]})).outputFiles[0].text;
const results:unknown[]=[];
const pause=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
async function poll(f:()=>Promise<boolean>){for(let i=0;i<250;i++){if(await f())return;await pause(20);}throw Error('authoritative native state did not arrive');}
for(const engine of [chromium,webkit].filter(e=>!process.env.MAHJONG_NATIVE_ENGINE||e.name()===process.env.MAHJONG_NATIVE_ENGINE)){
 const browser=await engine.launch();
 try{for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const transport of ['websocket','polling'] as const)for(const order of ['socket-before-http','http-before-socket'] as const)for(const soundEnabled of [true,false])for(const action of ['tsumo','drawn-discard','separated-discard','nuki','blank-discard','automatic-discard'] as const){
  if(action==='nuki'&&variant==='yonma')continue;
  if(process.env.MAHJONG_OPENING_ACTION&&action!==process.env.MAHJONG_OPENING_ACTION)continue;
  const players=Array.from({length:variant==='sanma'?3:4},(_,seat)=>({userId:randomUUID(),displayName:'玩家'+seat}));
  const rooms=new RoomStore({gameFactory:()=>physicalEngine(variant,{0:action==='nuki'?'p123456789s12z57':action==='automatic-discard'?'p23887654s421z22':'p23987654s321z22'},action==='nuki'?'z4':'p1')});
  const cmd=(body:object)=>parseMahjongCommand({...body,nonce:randomUUID()});const room=rooms.execute(players[0],cmd({action:'create',variant,mode:'east'}))!;
  for(const p of players.slice(1))rooms.execute(p,cmd({action:'join',code:room.code}));
  for(const p of players)rooms.execute(p,cmd({action:'ready',roomId:room.id,ready:true}));
  let live:Socket|undefined;const posts:any[]=[],errors:string[]=[],serverErrors:string[]=[],timers=new Set<ReturnType<typeof setTimeout>>();
  const response=():MahjongResponse=>({serviceRunning:true,room:rooms.view(players[0].userId)});
  const json=(res:import('node:http').ServerResponse,data:unknown)=>{res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  const http=createServer(async(req,res)=>{try{
   const path=new URL(req.url!,'http://local').pathname;
   if(path==='/api/session')return json(res,{user:{id:players[0].userId,displayName:'玩家0',email:null,role:'member'},home:null});
   if(path==='/api/mahjong'&&req.method==='GET')return json(res,response());
   if(path==='/api/mahjong'&&req.method==='POST'){
    let body='';for await(const chunk of req)body+=chunk;const command=parseMahjongCommand(JSON.parse(body));assert(['start','respond'].includes(command.action));assert(!posts.some(p=>p.nonce===command.nonce));
    rooms.execute(players[0],command);posts.push(command);const state=response();
    if(order==='socket-before-http'){live!.emit('mahjong:state',state);live!.emit('mahjong:state',state);await pause(100);}
    json(res,state);
    if(order==='http-before-socket'){const t=setTimeout(()=>{timers.delete(t);live?.emit('mahjong:state',state);live?.emit('mahjong:state',state);},100);timers.add(t);}return;
   }
   if(path.startsWith('/images/')||path.startsWith('/fonts/')||path.startsWith('/audio/')){res.writeHead(200,{'Content-Type':path.endsWith('.woff2')?'font/woff2':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.wav')?'audio/wav':'image/webp'});return res.end(readFileSync('public'+path));}
   if(path==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<meta charset="utf-8"><style>body{margin:0}*,*::before,*::after{box-sizing:border-box}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`);}
   res.writeHead(404);res.end();
  }catch(e){serverErrors.push(String(e));res.writeHead(500);res.end();}});
  const io=new Server(http,{path:'/mahjong/socket.io',addTrailingSlash:false,transports:[transport]});io.on('connection',s=>{rooms.connection(players[0].userId,1);live=s;s.emit('mahjong:state',response());});
  await new Promise<void>(r=>http.listen(0,'127.0.0.1',r));const port=(http.address() as import('node:net').AddressInfo).port;
  const hasTouch=(action==='blank-discard'||action==='automatic-discard')&&viewport.width===667;
  const context=await browser.newContext({viewport,hasTouch});
  if(action==='blank-discard')await context.addInitScript(()=>localStorage.setItem('yougui.mahjong.doubleClick','1'));
  await context.addInitScript(()=>{
   const samples:{state:string;duration:number}[]=[];(window as any).__openingAudio=samples;
   const contexts:AudioContext[]=[];(window as any).__audioContexts=contexts;
   const sorts:any[]=[];(window as any).__openingSorts=sorts;
   const animate=Element.prototype.animate;
   Element.prototype.animate=function(frames:any,options:any){
    const animation=animate.call(this,frames,options);
    if(Array.isArray(frames)&&frames[0]?.translate&&options?.easing==='linear'){
     animation.pause();animation.currentTime=0;sorts.push({element:this,animation,frames,options});
    }
    return animation;
   };
   const RealContext=window.AudioContext;
   window.AudioContext=class extends RealContext{constructor(...args:ConstructorParameters<typeof AudioContext>){super(...args);contexts.push(this);}};
   const prototype=AudioBufferSourceNode.prototype,original=prototype.start;
   prototype.start=function(...args:Parameters<AudioBufferSourceNode['start']>){
    samples.push({state:this.context.state,duration:this.buffer?.duration??0});return original.apply(this,args);
   };
  });
  if(!soundEnabled)await context.addInitScript(()=>localStorage.setItem('yougui.mahjong.sound','off'));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:'+port+'/');await page.locator('.mahjong-link-state.is-connected').waitFor();assert.equal(live!.conn.transport.name,transport);
   await page.clock.install({time:0});await page.clock.pauseAt(10000);await page.getByRole('button',{name:/开始对局/}).click();
   await poll(()=>page.evaluate(()=>document.querySelector('.mahjong-game')?.getAttribute('data-round-opening')==='0'));
   const stages:any[]=[],sample=async(expected:number,dora:number,operations:boolean)=>{
    // Clock callbacks enqueue React's commit outside the browser timer task.
    // Poll the same frozen-clock frame; never advance the deadline to make it pass.
    await poll(()=>page.evaluate(n=>[...document.querySelectorAll<HTMLElement>('.mahjong-hand button[data-hand-instance-id]')].filter(t=>getComputedStyle(t).visibility!=='hidden').length===n,expected));
    const state=await page.evaluate(()=>{
     const hand=[...document.querySelectorAll<HTMLElement>('.mahjong-hand button[data-hand-instance-id]')],opponents=[...document.querySelectorAll('.mahjong-player__hidden')].map(r=>({total:r.querySelectorAll('.mahjong-standing-tile').length,shown:[...r.querySelectorAll<HTMLElement>('.mahjong-standing-tile')].filter(t=>getComputedStyle(t).visibility!=='hidden').length}));
     return{tiles:hand.map(t=>t.dataset.handInstanceId!.split(':').at(-1)),shown:hand.filter(t=>getComputedStyle(t).visibility!=='hidden').length,disabled:hand.every(t=>t.hasAttribute('disabled')),dora:document.querySelectorAll('.mahjong-table__dora .mahjong-tile').length,operations:!!document.querySelector('.mahjong-action-dock'),opponents,drawnMargin:getComputedStyle(document.querySelector('.mahjong-hand .is-drawn')!).marginLeft};
    });assert.deepEqual(state.tiles,dora?(action==='nuki'?['p1','p2','p3','p4','p5','p6','p7','p8','p9','s1','s2','z4','z5','z7']:action==='automatic-discard'?['p1','p2','p3','p4','p5','p6','p7','p8','p8','s1','s2','s4','z2','z2']:['p1','p2','p3','p4','p5','p6','p7','p8','p9','s1','s2','s3','z2','z2']):[...rooms.view(players[0].userId)!.game!.initialDeal!,action==='nuki'?'z4':'p1']);assert.equal(state.shown,expected);assert.equal(state.dora,dora);assert.equal(state.operations,operations&&rooms.view(players[0].userId)!.game!.choices.some(c=>c.type!=='discard'));assert.equal(state.disabled,!operations);for(const p of state.opponents)assert.equal(p.shown,Math.min(expected,p.total));assert.equal(posts.length,1,'no operation submitted during presentation');stages.push(state);
   };
   await sample(4,0,false);if(soundEnabled)await poll(()=>page.evaluate(()=>(window as any).__openingAudio.length===1));for(const [ms,count]of [[299,4],[1,8],[300,12],[300,14],[299,14]] as const){await page.clock.runFor(ms);await sample(count,0,false);}
   const openingAudio=await page.evaluate(()=>(window as any).__openingAudio);assert.equal(openingAudio.length,soundEnabled?4:0);assert(openingAudio.every((x:any)=>x.state==='running'&&x.duration>0));
   await page.clock.runFor(1);await poll(()=>page.evaluate(()=>document.querySelector('.mahjong-game')?.getAttribute('data-opening-sorted')==='true'));await sample(14,1,false);
   const sortSamples=await page.evaluate(()=>{
    return (window as any).__openingSorts.map((sort:any)=>{
     const {animation,element,frames,options}=sort;
     const delta=parseFloat(frames[0].translate),positions:number[]=[],lefts:number[]=[];
     for(const progress of [0,.25,1]){animation.currentTime=options.duration*progress;const translate=getComputedStyle(element).translate;positions.push(translate==='none'?0:parseFloat(translate));lefts.push(element.getBoundingClientRect().left);}
     return {delta,duration:animation.effect.getTiming().duration,easing:animation.effect.getTiming().easing,positions,lefts};
    });
   });
   assert(sortSamples.length>0,'real deal order must move physical nodes');
   for(const sample of sortSamples){assert.equal(sample.easing,'linear');assert(sample.duration>0);assert(Math.abs(sample.positions[0]-sample.delta)<.05);assert(Math.abs(sample.positions[1]-sample.delta*.75)<.05);assert(Math.abs(sample.positions[2])<.05);assert(Math.abs((sample.lefts[1]-sample.lefts[2])/(sample.lefts[0]-sample.lefts[2])-.75)<.02);}
   await page.clock.runFor(299);await sample(14,1,false);await page.clock.runFor(1);await poll(()=>page.evaluate(()=>!document.querySelector('.mahjong-game')?.hasAttribute('data-round-opening')));await sample(14,1,true);
   await page.clock.runFor(400);
   const firstDecision=rooms.view(players[0].userId)!.game!;
   const drawn=page.locator('.mahjong-hand button[data-hand-instance-id^="drawn:"]'),separated=page.locator('.mahjong-hand button.is-drawn');
   assert.equal(await drawn.getAttribute('data-tile-face'),action==='nuki'?'z4':'p1');assert.equal(await separated.getAttribute('data-tile-face'),action==='nuki'?'z7':'z2');
   if(action==='automatic-discard'){
    const summary=page.locator('.mahjong-automatic summary'),toggle=page.getByRole('button',{name:/^自动摸切\s*关$/});
    if(hasTouch){await summary.tap();await toggle.tap();}else{await summary.click();await toggle.click();}
    await page.clock.runFor(1);
   }
   else if(action==='blank-discard'){
    const blank=await page.evaluate(()=>{const b=document.querySelector('.mahjong-table')!.getBoundingClientRect();for(let y=b.top+b.height*.12;y<b.top+b.height*.75;y+=12)for(let x=b.left+b.width*.15;x<b.left+b.width*.85;x+=12)if(document.elementFromPoint(x,y)?.matches('.mahjong-table__surface'))return{x,y};throw Error('no directly hittable felt');});
    const tap=async()=>hasTouch?await page.touchscreen.tap(blank.x,blank.y):await page.mouse.click(blank.x,blank.y);
    await tap();await page.clock.runFor(60);await tap();
   }
   else if(action==='nuki')await page.getByRole('button',{name:'拔北',exact:true}).click();
   else if(action==='tsumo')await page.getByRole('button',{name:'自摸',exact:true}).click();
   else await (action==='drawn-discard'?drawn:separated).dblclick({delay:40});
   await poll(async()=>posts.length===2);
   if(action==='tsumo'){assert.equal(rooms.view(players[0].userId)!.game!.settlement?.winMethod,'tsumo');assert.equal(rooms.view(players[0].userId)!.game!.settlement?.winningTile,'p1');}
   else if(action==='nuki'){assert.equal(rooms.view(players[0].userId)!.game!.players.find(p=>p.seat===0)!.nuki,1);assert.equal(rooms.view(players[0].userId)!.game!.initialDeal,undefined);const tray=page.locator('[data-nuki-seat="0"]');await tray.waitFor();assert.equal(await tray.locator('[data-nuki-index]').count(),1);assert.equal(await tray.locator('small').innerText(),'拔北 × 1');}
   else {const expected=action==='drawn-discard'?'p1_':'z2';assert.equal(posts[1].choiceId,firstDecision.choices.find(choice=>choice.type==='discard'&&choice.value===expected)!.id);assert.equal(rooms.view(players[0].userId)!.game!.players.find(p=>p.seat===0)!.discards.at(-1),expected);}
   assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${transport}-${order}-${soundEnabled}-${action}.png`});results.push({engine:engine.name(),variant,viewport,transport,order,soundEnabled,hasTouch,action,stages,posts,openingAudio,sortSamples});console.log('PASS',engine.name(),variant,viewport.width,transport,order,soundEnabled,action);
  }catch(e){writeFileSync(out+'/failure.json',JSON.stringify({error:String(e),errors,serverErrors,posts,audio:await page.evaluate(()=>({sources:(window as any).__openingAudio,states:(window as any).__audioContexts.map((x:AudioContext)=>x.state)})),room:response().room},null,2));await page.screenshot({path:out+'/failure.png'});throw e;}finally{for(const t of timers)clearTimeout(t);await context.close();await new Promise<void>(r=>io.close(()=>r()));}
 }}finally{await browser.close();}
}
assert(!process.env.MAHJONG_OPENING_ACTION||['blank-discard','automatic-discard'].includes(process.env.MAHJONG_OPENING_ACTION),'unsupported action filter');assert.equal(results.length,process.env.MAHJONG_OPENING_ACTION?(process.env.MAHJONG_NATIVE_ENGINE?32:64):(process.env.MAHJONG_NATIVE_ENGINE?176:352));assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS'+results.length+' real RoomStore HTTP Socket opening with real audio',out);
