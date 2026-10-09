import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Server,type Socket} from 'socket.io';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {MahjongResponse} from '../../src/modules/mahjong/types';
const out='.local/audit/automatic-round-network-'+Date.now();mkdirSync(out);
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import \"\.\/(mahjong[^\"\n]*\.css)\";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['tests/browser/mahjong-automatic-round-network.tsx','tests/fixtures/mahjong-automatic-round-reference.json','tests/fixtures/mahjong-settlement-game.ts','src/components/mahjong/use-automatic-play.ts','src/components/mahjong/automatic-choice.ts','src/components/mahjong/mahjong-client.tsx','src/hooks/use-session.tsx','src/components/api-client.ts','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts',...cssFiles];
const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MahjongClient}from'./src/components/mahjong/mahjong-client';createRoot(document.getElementById('root')).render(React.createElement(MahjongClient));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'local-next-navigation',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'local-navigation'}));b.onLoad({filter:/.*/,namespace:'local-navigation'},()=>({contents:`const router={replace:url=>{window.navigationRequests??=[];window.navigationRequests.push(url)}};export const useRouter=()=>router;export const usePathname=()=>'/mahjong';`,loader:'js'}));}}]})).outputFiles[0].text;
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const transport of ['websocket','polling'] as const)for(const order of ['socket-before-http','http-before-socket'] as const)for(const kind of ['pending','completed'] as const){
  const game=physicalEngine(variant,{0:'p123456789s123z2'},'z2'),first=game.view(0);assert(first.choices.some(c=>c.type==='tsumo'));
  let version=10,live:Socket|undefined,completed=0,connections=0;const posts:any[]=[],errors:string[]=[],serverErrors:string[]=[],timers=new Set<ReturnType<typeof setTimeout>>();
  const response=():MahjongResponse=>({serviceRunning:true,room:{id:'round-network',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:0,game:game.view(0),members:game.view(0).players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))}});
  const json=(res:import('node:http').ServerResponse,data:unknown)=>{res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  const pause=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
  const http=createServer(async(req,res)=>{try{
   const path=new URL(req.url!,'http://local').pathname;
   if(path==='/api/session')return json(res,{user:{id:'0',displayName:'玩家0',email:null,role:'member'},home:null});
   if(path==='/api/mahjong'&&req.method==='GET')return json(res,response());
   if(path==='/api/mahjong'&&req.method==='POST'){
    let body='';for await(const chunk of req)body+=chunk;const cmd=JSON.parse(body);assert.equal(cmd.action,'respond');assert.equal(cmd.roomId,'round-network');assert.equal(cmd.decisionId,game.view(0).decisionId);assert(game.view(0).choices.some(c=>c.id===cmd.choiceId));assert(!posts.some(p=>p.nonce===cmd.nonce));
    game.respond(0,cmd.decisionId,cmd.choiceId);posts.push(cmd);version++;const state=response();
    if(order==='socket-before-http'){live!.emit('mahjong:state',state);live!.emit('mahjong:state',state);await pause(200);}
    json(res,state);completed++;
    if(order==='http-before-socket'){const t=setTimeout(()=>{timers.delete(t);live?.emit('mahjong:state',state);live?.emit('mahjong:state',state);},200);timers.add(t);}return;
   }
   if(path.startsWith('/images/')||path.startsWith('/fonts/')){res.writeHead(200,{'Content-Type':path.endsWith('.woff2')?'font/woff2':path.endsWith('.svg')?'image/svg+xml':'image/webp'});return res.end(readFileSync('public'+path));}
   if(path==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<meta charset="utf-8"><style>body{margin:0}*,*::before,*::after{box-sizing:border-box}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`);}
   res.writeHead(404);res.end();
  }catch(e){serverErrors.push(String(e));res.writeHead(500);res.end();}});
  const io=new Server(http,{path:'/mahjong/socket.io',addTrailingSlash:false,transports:[transport]});io.on('connection',s=>{connections++;live=s;s.emit('mahjong:state',response());});
  await new Promise<void>(r=>http.listen(0,'127.0.0.1',r));const port=(http.address() as import('node:net').AddressInfo).port;
  const context=await browser.newContext({viewport}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:'+port+'/');await page.getByTestId('mahjong-board').waitFor();await page.waitForFunction(()=>!!document.querySelector('.mahjong-game__phase i.is-live'));assert.equal(live!.conn.transport.name,transport);
   await page.locator('.mahjong-automatic summary').click();
   for(const label of ['不鸣牌','自动摸切',...(variant==='sanma'?['自动拔北']:[]),'自动和牌'])await page.getByRole('button',{name:new RegExp('^'+label+'\\s*关$')}).click();
   if(kind==='pending'){await page.waitForTimeout(350);assert.equal(posts.length,0);const g=game.view(0),win=g.choices.find(c=>c.type==='tsumo')!;game.respond(0,g.decisionId,win.id);}
   else{await page.waitForFunction(()=>!!document.querySelector('.mahjong-settlement'));for(let n=0;completed<1&&n<100;n++)await page.waitForTimeout(10);assert.equal(posts.length,1);assert.equal(completed,1);assert(posts[0].choiceId==='tsumo'||posts[0].choiceId.startsWith('tsumo:'));await page.waitForTimeout(250);}
   assert(game.view(0).settlement);
   // Actual legal ACKs from each seat advance the engine; no new-round DTO is fabricated.
   const capacity=variant==='sanma'?3:4;
   for(let seat=0;seat<capacity;seat++){const g=game.view(seat),ack=g.choices.find(c=>c.type==='ack');assert(ack,'native settlement ACK');game.respond(seat,g.decisionId,ack.id);}
   const next=game.view(0);assert.equal(next.gameInstanceId,first.gameInstanceId);assert.equal(next.handId,first.handId!+1);assert.equal(next.roundNumber,first.roundNumber);assert(next.honba>first.honba,'dealer repeat is still a new hand');assert.equal(next.settlement,null);assert(next.choices.some(c=>c.type==='tsumo'));
   version++;live!.emit('mahjong:state',response());live!.emit('mahjong:state',response());
   await page.getByRole('button',{name:'自摸',exact:true}).waitFor();
   for(const label of ['自动和牌','不鸣牌','自动摸切',...(variant==='sanma'?['自动拔北']:[])]){const toggle=page.getByRole('button',{name:new RegExp('^'+label+'\\s*关$')});await toggle.waitFor();assert.equal(await toggle.getAttribute('aria-pressed'),'false');}
   await page.waitForTimeout(1000);assert.equal(posts.length,kind==='pending'?0:1,'new hand must not inherit auto win or submit');
   const baselinePosts=posts.length;await page.getByRole('button',{name:/^自动和牌\s*关$/}).click();
   for(let n=0;completed<baselinePosts+1&&n<150;n++)await page.waitForTimeout(10);
   assert.equal(posts.length,baselinePosts+1,'explicit re-enable on the new hand still works');assert.equal(completed,baselinePosts+1);assert.equal(game.view(0).settlement?.winMethod,'tsumo');assert.equal(new Set(posts.map(p=>p.decisionId)).size,posts.length);assert.equal(new Set(posts.map(p=>p.nonce)).size,posts.length);
   await page.waitForTimeout(300);assert.equal(posts.length,baselinePosts+1);assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);
   await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${transport}-${order}-${kind}.png`});
   results.push({engine:engine.name(),variant,viewport,transport,order,kind,firstHand:first.handId,nextHand:next.handId,dealerRepeated:true,posts,connections});console.log('PASS',engine.name(),variant,viewport.width,transport,order,kind);
  }catch(e){writeFileSync(out+'/failure.json',JSON.stringify({error:String(e),errors,serverErrors,posts,game:game.view(0)},null,2));await page.screenshot({path:out+'/failure.png'});throw e;}finally{for(const t of timers)clearTimeout(t);await context.close();await new Promise<void>(r=>io.close(()=>r()));}
 }}finally{await browser.close();}
}
assert.equal(results.length,64);assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS64 real HTTP Socket new-round reset',out);
