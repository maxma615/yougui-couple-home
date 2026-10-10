import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Server, type Socket} from 'socket.io';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {GameVariant,MahjongResponse} from '../../src/modules/mahjong/types';
const out=`.local/audit/automatic-network-${Date.now()}`;mkdirSync(out);
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['src/components/mahjong/hand-rack.ts','src/components/mahjong/use-opening-sort.ts','tests/browser/mahjong-automatic-network.tsx','src/components/mahjong/automatic-choice.ts','src/components/mahjong/use-automatic-play.ts','tests/fixtures/mahjong-settlement-game.ts','src/components/mahjong/mahjong-client.tsx','src/components/api-client.ts','src/hooks/use-session.tsx','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts','src/modules/mahjong/server.ts','public/fonts/mahjong-brush.woff2',...cssFiles];
const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MahjongClient}from'./src/components/mahjong/mahjong-client';createRoot(document.getElementById('root')).render(React.createElement(MahjongClient));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'local-next-navigation',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'local-navigation'}));b.onLoad({filter:/.*/,namespace:'local-navigation'},()=>({contents:`const router={replace:url=>{window.navigationRequests??=[];window.navigationRequests.push(url)}};export const useRouter=()=>router;export const usePathname=()=>'/mahjong';`,loader:'js'}));}}]})).outputFiles[0].text;
const results:any[]=[];
const pause=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const transport of ['websocket','polling'] as const)for(const order of ['socket-before-http','http-before-socket'] as const)for(const kind of ['win','manual-pointer','manual-key','cut','calls','ron','special',...(variant==='sanma'?['north']:[])]){
  const seat=kind==='calls'||kind==='ron'?1:0;
  const game=physicalEngine(variant,kind==='calls'||kind==='ron'?{0:'p789s234567z1234',1:kind==='calls'?'p11s123456789z23':'p1123456789s123'}:{0:kind==='win'||kind.startsWith('manual-')||kind==='special'?'p123456789s123z2':'p123456789s124z2'},kind==='calls'||kind==='ron'?'p1':kind==='win'||kind.startsWith('manual-')?'z2':kind==='special'?'z3':kind==='north'?'z4':'s2');
  if(seat===1){const g=game.view(0);game.respond(0,g.decisionId,g.choices.find(c=>c.value==='p1_')!.id);}
  let version=10,completed=0,gets=0,connections=0,inFlight=0,maxInFlight=0;const posts:any[]=[],requests:string[]=[],serverErrors:string[]=[],timers=new Set<ReturnType<typeof setTimeout>>();let live:Socket|undefined;
  const response=():MahjongResponse=>({serviceRunning:true,room:{id:'native-auto-network',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:seat,game:game.view(seat),members:game.view(seat).players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))}});
  const json=(res:import('node:http').ServerResponse,status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  const http=createServer(async(req,res)=>{
   try{
    const path=new URL(req.url!,'http://local').pathname;requests.push(req.method+' '+path);
    if(path==='/api/session')return json(res,200,{user:{id:String(seat),displayName:'玩家'+seat,email:null,role:'member'},home:null});
    if(path==='/api/mahjong'&&req.method==='GET'){gets++;return json(res,200,response());}
    if(path==='/api/mahjong'&&req.method==='POST'){
     let body='';for await(const chunk of req)body+=chunk;const command=JSON.parse(body);assert.equal(command.action,'respond');assert.equal(command.roomId,'native-auto-network');assert.equal(command.decisionId,game.view(seat).decisionId);assert(game.view(seat).choices.some(c=>c.id===command.choiceId));assert(!posts.some(c=>c.nonce===command.nonce||c.decisionId===command.decisionId));
     inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);game.respond(seat,command.decisionId,command.choiceId);version++;posts.push(command);const snapshot=response();
     if(order==='socket-before-http'){live!.emit('mahjong:state',snapshot);live!.emit('mahjong:state',snapshot);await pause(200);}
     json(res,200,snapshot);completed++;inFlight--;
     if(order==='http-before-socket'){const timer=setTimeout(()=>{timers.delete(timer);live?.emit('mahjong:state',snapshot);live?.emit('mahjong:state',snapshot);},200);timers.add(timer);}
     return;
    }
    if(path.startsWith('/images/')||path.startsWith('/fonts/')){const bytes=readFileSync('public'+path);res.writeHead(200,{'Content-Type':path.endsWith('.woff2')?'font/woff2':path.endsWith('.svg')?'image/svg+xml':'image/webp'});return res.end(bytes);}
    if(path==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(`<style>body{margin:0}*,*::before,*::after{box-sizing:border-box}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};window.autoDispatch=[];const nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>{if(String(input)==='/api/mahjong'&&init?.method==='POST'){const command=JSON.parse(init.body);window.autoDispatch.push({choiceId:command.choiceId,decisionId:command.decisionId,held:!!document.querySelector('.mahjong-drawn-wrap.is-nuki-held'),arriving:!!document.querySelector('.is-drawn.is-draw-arriving')});}return nativeFetch(input,init);};${bundle}</script>`);}
    res.writeHead(404);res.end();
   }catch(e){serverErrors.push(String(e));json(res,500,{error:{message:String(e)}});}
  });
  const io=new Server(http,{path:'/mahjong/socket.io',addTrailingSlash:false,transports:[transport]});
  io.on('connection',s=>{connections++;live=s;s.emit('mahjong:state',response());});
  await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));const port=(http.address() as import('node:net').AddressInfo).port;
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(`http://127.0.0.1:${port}/`);await page.getByTestId('mahjong-board').waitFor();await page.waitForFunction(()=>document.querySelector('.mahjong-header__sync')?.textContent?.includes('实时同步')||!!document.querySelector('.mahjong-game__phase i.is-live'));assert.equal(live!.conn.transport.name,transport);
   await page.locator('.mahjong-automatic summary').click();const label=kind==='win'||kind.startsWith('manual-')||kind==='ron'?'自动和牌':kind==='calls'?'不鸣牌':kind==='north'?'自动拔北':'自动摸切';
   // A real ron must remain offered while the player has only disabled calls.
   if(kind==='ron'){await page.getByRole('button',{name:/^不鸣牌\s*关$/}).click();await page.waitForTimeout(850);assert.equal(posts.length,0);assert(await page.getByRole('button',{name:'荣和',exact:true}).isEnabled());}
   if(kind==='ron')await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${transport}-${order}-before-win.png`});
   await page.getByRole('button',{name:new RegExp('^'+label+'\\s*关$')}).click();
   // Native input must take precedence over the still pending 800ms automatic win.
   if(kind.startsWith('manual-')){
    const tile=page.locator('.mahjong-hand button[data-choice-id]').first();
    if(kind==='manual-pointer')await tile.click();
    else{await tile.focus();await tile.press('ArrowRight');}
    await page.waitForTimeout(900);
    assert.equal(posts.length,0,'manual hand input cancels automatic win');
    assert.equal((await page.evaluate(()=>(window as any).autoDispatch)).length,0);
    assert(await page.getByRole('button',{name:'自摸',exact:true}).isEnabled());
    await page.getByRole('button',{name:'自摸',exact:true}).click();
   }
   const expected=kind==='special'?0:kind==='north'?3:1;
   if(expected)for(let i=0;i<240&&completed<expected;i++)await page.waitForTimeout(25);else await page.waitForTimeout(850);
   await page.waitForTimeout(350);assert.equal(posts.length,expected);assert.equal(completed,expected);assert.equal(maxInFlight,expected?1:0);assert.equal(inFlight,0);assert.equal(new Set(posts.map(p=>p.nonce)).size,expected);assert.equal(new Set(posts.map(p=>p.decisionId)).size,expected);assert.deepEqual(serverErrors,[]);assert.deepEqual(errors,[]);
   if(expected){const type=kind==='win'||kind.startsWith('manual-')?'tsumo':kind==='ron'?'ron':kind==='calls'?'pass':kind==='north'?'nuki':'discard';assert(posts.every(c=>c.choiceId.startsWith(type+':')||c.choiceId===type));}
   if(kind==='cut'){assert.equal(posts[0].choiceId,'discard:s2_');assert(game.view(seat).players[seat].discards.at(-1)?.includes('s2_'));}
   const dispatches=await page.evaluate(()=>(window as any).autoDispatch);assert.equal(dispatches.length,expected);if(kind==='north')assert(dispatches.every((d:any)=>!d.held&&!d.arriving),'auto north waits for replacement presentation');
   if(kind==='north'){assert.equal(game.view(seat).players[seat].nuki,3);await page.getByTestId('nuki-tiles-'+seat).filter({hasText:'拔北 × 3'}).waitFor();assert.equal(await page.locator(`[data-nuki-seat="${seat}"] [data-nuki-index]`).count(),3);}
   if(kind==='win'||kind.startsWith('manual-')||kind==='ron')assert.equal(game.view(seat).settlement?.winMethod,kind==='ron'?'ron':'tsumo');
   if(kind==='calls')assert.equal(game.view(seat).players[seat].melds.length,0);
   if(kind==='special'){assert(game.view(seat).choices.some(c=>c.type==='riichi'));assert(await page.getByRole('button',{name:'立直',exact:true}).isEnabled());}
   assert.equal(await page.getByRole('status',{name:'连接状态'}).count(),0);assert.equal(timers.size,0);
   results.push({engine:engine.name(),variant,viewport,transport,kind,order,connections,gets,posts,completed,maxInFlight,dispatches});console.log('PASS',engine.name(),variant,viewport.width,transport,kind,order);
  }catch(error){await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${transport}-${order}-${kind}-failure.png`});const dispatches=await page.evaluate(()=>(window as any).autoDispatch);const metrics=await page.evaluate(()=>[...document.querySelectorAll('.mahjong-automatic button')].map(n=>{const r=n.getBoundingClientRect();return{text:n.textContent,rect:{x:r.x,y:r.y,w:r.width,h:r.height},hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML}}));writeFileSync(out+`/${engine.name()}-${variant}-${viewport.width}-${transport}-${order}-${kind}-failure.json`,JSON.stringify({error:String(error),dispatches,metrics,errors,serverErrors,posts,completed,requests,body:await page.locator('body').innerText()},null,2));throw error;}finally{for(const timer of timers)clearTimeout(timer);await context.close();await new Promise<void>(resolve=>io.close(()=>resolve()));}
 }}finally{await browser.close();}
}
assert.equal(results.length,240);assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS 240 native HTTP Socket automatic scenes',out);
