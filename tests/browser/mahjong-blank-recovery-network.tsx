import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {RoomStore} from '../../src/modules/mahjong/rooms';
import {Server, type Socket} from 'socket.io';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {GameVariant,MahjongResponse,MahjongCommand} from '../../src/modules/mahjong/types';
const out=`.local/audit/blank-recovery-network-${Date.now()}`;mkdirSync(out);
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['tests/browser/mahjong-blank-recovery-network.tsx','src/components/mahjong/use-blank-table-double-tap.ts','src/components/mahjong/blank-table-action.ts','src/components/mahjong/automatic-choice.ts','src/components/mahjong/use-automatic-play.ts','tests/fixtures/mahjong-settlement-game.ts','src/components/mahjong/mahjong-client.tsx','src/components/api-client.ts','src/hooks/use-session.tsx','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts','src/modules/mahjong/server.ts','src/modules/mahjong/rooms.ts','src/modules/mahjong/settlement-sequence.ts','public/fonts/mahjong-brush.woff2',...cssFiles];
const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MahjongClient}from'./src/components/mahjong/mahjong-client';createRoot(document.getElementById('root')).render(React.createElement(MahjongClient));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'local-next-navigation',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'local-navigation'}));b.onLoad({filter:/.*/,namespace:'local-navigation'},()=>({contents:`const router={replace:url=>{window.navigationRequests??=[];window.navigationRequests.push(url)}};export const useRouter=()=>router;export const usePathname=()=>'/mahjong';`,loader:'js'}));}}]})).outputFiles[0].text;
declare global {interface Window {dispatches:any[];requestsPending:number;}}
const results:any[]=[];
const pause=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
for(const browserType of [chromium,webkit]) {
 const browser=await browserType.launch();
 try {for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const transport of ['websocket','polling'] as const)for(const hasTouch of [false,true])for(const operation of ['discard','pass'] as const)for(const kind of ['rejected','failed-get','committed-before','committed-after','stale-get','later-get','later-socket'] as const){
  const seat=operation==='pass'?1:0;
  const game=physicalEngine(variant,operation==='pass'?{0:'p789s234567z1234',1:'p1123456789s123'}:{0:'p123456789s124z2'},operation==='pass'?'p1':'s2');
  if(operation==='pass'){const g=game.view(0);game.respond(0,g.decisionId,g.choices.find(c=>c.value==='p1_')!.id);}
  const identities=Array.from({length:variant==='sanma'?3:4},(_,n)=>({userId:String(n),displayName:'玩家'+n}));
  const store=new RoomStore({gameFactory:()=>game});
  const execute=(n:number,c:Omit<MahjongCommand,'nonce'>)=>store.execute(identities[n],{...c,nonce:randomUUID()} as MahjongCommand);
  const created=execute(0,{action:'create',mode:'east',variant} as any)!;
  for(let n=1;n<identities.length;n++)execute(n,{action:'join',code:created.code} as any);
  for(let n=0;n<identities.length;n++){store.connection(String(n),1);execute(n,{action:'ready',ready:true,roomId:created.id} as any);}
  execute(0,{action:'start',roomId:created.id} as any);
  let version=10,live:Socket|undefined,firstFailed=false,inFlight=0,maxInFlight=0,gets=0,transportReplays=0,recoveryReady=false;
  const posts:any[]=[],accepted:any[]=[],errors:string[]=[],serverErrors:string[]=[],timers=new Set<ReturnType<typeof setTimeout>>();
  const response=():MahjongResponse=>({serviceRunning:true,room:{...store.view(String(seat))!,version}});
  const initial=response(),initialDecision=initial.room!.game!.decisionId;
  const json=(res:import('node:http').ServerResponse,status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  const http=createServer(async(req,res)=>{try{
   const path=new URL(req.url!,'http://local').pathname;
   if(path==='/api/session')return json(res,200,{user:{id:String(seat),displayName:'玩家'+seat,email:null,role:'member'},home:null});
   if(path==='/api/mahjong'&&req.method==='GET'){
    gets++;
    if(firstFailed&&(kind==='failed-get'||kind.startsWith('later-')&&!recoveryReady))return json(res,503,{error:{message:'GET unavailable'}});
    if(firstFailed&&kind==='stale-get'){version++;live!.emit('mahjong:state',response());await pause(150);return json(res,200,initial);}
    return json(res,200,response());
   }
   if(path==='/api/mahjong'&&req.method==='POST'){
    let body='';for await(const chunk of req)body+=chunk;const command=JSON.parse(body);
    assert.equal(command.action,'respond');assert.equal(command.roomId,created.id);
    if(posts.some(p=>p.nonce===command.nonce)){
     assert(kind.startsWith('committed'));const before=JSON.stringify(store.view(String(seat)));
     store.execute(identities[seat],command);assert.equal(JSON.stringify(store.view(String(seat))),before);transportReplays++;
     return json(res,503,{error:{message:'committed response unavailable'}});
    }
    posts.push(command);inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
    if(posts.length===1){
     firstFailed=true;
     if(kind.startsWith('committed')){
      store.execute(identities[seat],command);accepted.push(command);version++;
      if(kind==='committed-before')live!.emit('mahjong:state',response());
      res.destroy();inFlight--;
      if(kind==='committed-after'){const timer=setTimeout(()=>{timers.delete(timer);live!.emit('mahjong:state',response());},150);timers.add(timer);}
      return;
     }
     json(res,503,{error:{message:'POST rejected before operation'}});inFlight--;return;
    }
    assert(kind==='rejected'||kind==='stale-get'||kind.startsWith('later-')||kind.startsWith('committed')&&operation==='pass','only explicit retries or the next native turn');
    assert.equal(command.decisionId,game.view(seat).decisionId);
    if(!kind.startsWith('committed'))assert.equal(command.decisionId,initialDecision);
    else assert.notEqual(command.decisionId,initialDecision);assert(game.view(seat).choices.some(c=>c.id===command.choiceId));
    store.execute(identities[seat],command);accepted.push(command);version++;
    live!.emit('mahjong:state',response());json(res,200,response());inFlight--;return;
   }
   if(path.startsWith('/images/')||path.startsWith('/fonts/')){res.writeHead(200,{'Content-Type':path.endsWith('.woff2')?'font/woff2':path.endsWith('.svg')?'image/svg+xml':'image/webp'});return res.end(readFileSync('public'+path));}
   if(path==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(`<style>body{margin:0}*,*::before,*::after{box-sizing:border-box}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};localStorage.setItem('yougui.mahjong.doubleClick','1');window.dispatches=[];window.requestsPending=0;const nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>{const tracked=String(input)==='/api/mahjong';if(tracked)window.requestsPending++;if(tracked&&init?.method==='POST')window.dispatches.push(JSON.parse(init.body));return nativeFetch(input,init).finally(()=>{if(tracked)window.requestsPending--;});};${bundle}</script>`);}
   res.writeHead(404);res.end();
  }catch(error){serverErrors.push(String(error));if(!res.destroyed)json(res,500,{error:{message:String(error)}});}});
  const io=new Server(http,{path:'/mahjong/socket.io',addTrailingSlash:false,transports:[transport]});io.on('connection',socket=>{live=socket;socket.emit('mahjong:state',response());});
  await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));
  const context=await browser.newContext({viewport,hasTouch}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(`http://127.0.0.1:${(http.address() as import('node:net').AddressInfo).port}/`);
   await page.getByTestId('mahjong-board').waitFor();await page.waitForFunction(()=>!!document.querySelector('.mahjong-game__phase i.is-live'));assert.equal(live!.conn.transport.name,transport);
   const point=await page.evaluate(()=>{const surface=document.querySelector('.mahjong-table__surface')!,r=surface.getBoundingClientRect();for(let y=.15;y<.9;y+=.1)for(let x=.15;x<.9;x+=.1){const px=r.left+x*r.width,py=r.top+y*r.height;if(document.elementFromPoint(px,py)===surface)return{x:px,y:py};}throw Error('no direct blank surface');});
   const pair=async()=>{for(let i=0;i<2;i++){if(hasTouch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);}};
   await pair();await page.waitForFunction(()=>window.dispatches.length===1&&window.requestsPending===0);
   // Let actual React state and delayed Socket delivery settle without synthetic timers.
   await page.waitForTimeout(250);assert.equal(posts.length,1);assert.equal((await page.evaluate(()=>window.dispatches)).length,1,'no automatic replay');
   if(kind.startsWith('later-')){
    await pair();await page.waitForTimeout(100);assert.equal(posts.length,1,'failed GET alone stays consumed');recoveryReady=true;
    if(kind==='later-socket')live!.emit('mahjong:state',response());else await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.waitForFunction(()=>window.requestsPending===0);await page.waitForTimeout(150);assert.equal(posts.length,1,'fresh baseline never auto replays');
   }
   const nextTurn=kind.startsWith('committed')&&operation==='pass';
   if(nextTurn)await page.waitForFunction(()=>!document.querySelector('.is-draw-arriving')&&!document.querySelector('.is-nuki-held'));
   const current=game.view(seat),nextChoice=nextTurn?current.choices.find(c=>c.type==='discard'&&c.value===current.drawnTile+'_'):null;
   if(nextTurn)assert(nextChoice,'native next turn drawn discard');
   await pair();await page.waitForFunction(()=>window.requestsPending===0);await page.waitForTimeout(250);
   const expected=kind==='rejected'||kind==='stale-get'||kind.startsWith('later-')||nextTurn?2:1;assert.equal(posts.length,expected);assert.equal(accepted.length,kind==='failed-get'?0:nextTurn?2:1);assert.equal(maxInFlight,1);assert.equal(inFlight,0);assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);assert.equal(timers.size,0);
   if(accepted.length)assert.equal(accepted[0].choiceId,initial.room!.game!.choices.find(c=>operation==='pass'?c.type==='pass':c.value==='s2_')!.id);
   if(nextTurn){assert.equal(accepted[1].choiceId,nextChoice!.id);assert.notEqual(accepted[1].decisionId,initialDecision);}
   assert.equal(new Set(accepted.map(c=>c.decisionId)).size,accepted.length,'one native operation per decision');
   assert.equal(new Set(posts.map(c=>c.nonce)).size,expected);assert.equal(await page.getByRole('status',{name:'连接状态'}).count(),0);
   results.push({browser:browserType.name(),variant,viewport,transport,hasTouch,operation,kind,gets,posts,accepted,maxInFlight,transportReplays});console.log('PASS',browserType.name(),variant,viewport.width,transport,hasTouch,operation,kind);
  }catch(error){await page.screenshot({path:out+`/${browserType.name()}-${variant}-${viewport.width}-${transport}-${hasTouch}-${operation}-${kind}-failure.png`});writeFileSync(out+'/failure.json',JSON.stringify({error:String(error),posts,accepted,errors,serverErrors,body:await page.locator('body').innerText()},null,2));throw error;}finally{for(const timer of timers)clearTimeout(timer);await context.close();await new Promise<void>(resolve=>io.close(()=>resolve()));}
 }}finally{await browser.close();}
}
assert.equal(results.length,448);assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS 448 native HTTP Socket blank recovery scenes',out);
