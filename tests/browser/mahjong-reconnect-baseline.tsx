import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Server, type Socket} from 'socket.io';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {GameVariant,MahjongResponse} from '../../src/modules/mahjong/types';
const out=`.local/audit/reconnect-baseline-${Date.now()}`;mkdirSync(out);
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const files=['tests/browser/mahjong-reconnect-baseline.tsx','tests/fixtures/mahjong-settlement-game.ts','src/components/mahjong/mahjong-client.tsx','src/components/api-client.ts','src/hooks/use-session.tsx','src/modules/mahjong/engine.ts','src/modules/mahjong/sanma.ts','src/modules/mahjong/server.ts','public/fonts/mahjong-brush.woff2',...cssFiles];
const sources=Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))]));
const bundle=(await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MahjongClient}from'./src/components/mahjong/mahjong-client';createRoot(document.getElementById('root')).render(React.createElement(MahjongClient));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'local-next-navigation',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'local-navigation'}));b.onLoad({filter:/.*/,namespace:'local-navigation'},()=>({contents:`const router={replace:url=>{window.navigationRequests??=[];window.navigationRequests.push(url)}};export const useRouter=()=>router;export const usePathname=()=>'/mahjong';`,loader:'js'}));}}]})).outputFiles[0].text;
const results:any[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const variant of ['sanma','yonma'] as const)for(const viewport of [{width:667,height:375},{width:1440,height:810}])for(const transport of ['websocket','polling'] as const){
  const game=physicalEngine(variant,{0:'p123456789s123z2'},'z2');let version=10;const posts:any[]=[];const requests:string[]=[];let connections=0,live:Socket|undefined;
  const response=():MahjongResponse=>({serviceRunning:true,room:{id:'native-reconnect',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:0,game:game.view(0),members:game.view(0).players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))}});
  const json=(res:import('node:http').ServerResponse,status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  const http=createServer(async(req,res)=>{
   try{
    const path=new URL(req.url!,'http://local').pathname;requests.push(req.method+' '+path);
    if(path==='/api/session')return json(res,200,{user:{id:'0',displayName:'玩家0',email:null,role:'member'},home:null});
    if(path==='/api/mahjong'&&req.method==='GET')return json(res,200,response());
    if(path==='/api/mahjong'&&req.method==='POST'){
     let body='';for await(const chunk of req)body+=chunk;const command=JSON.parse(body);assert.equal(command.action,'respond');assert.equal(command.roomId,'native-reconnect');assert.equal(command.decisionId,game.view(0).decisionId);assert(game.view(0).choices.some(c=>c.id===command.choiceId));
     game.respond(0,command.decisionId,command.choiceId);version++;posts.push(command);return json(res,200,response());
    }
    if(path.startsWith('/images/')||path.startsWith('/fonts/')){const bytes=readFileSync('public'+path);res.writeHead(200,{'Content-Type':path.endsWith('.woff2')?'font/woff2':path.endsWith('.svg')?'image/svg+xml':'image/webp'});return res.end(bytes);}
    if(path==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(`<style>body{margin:0}*,*::before,*::after{box-sizing:border-box}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`);}
    res.writeHead(404);res.end();
   }catch(e){json(res,500,{error:{message:String(e)}});}
  });
  const io=new Server(http,{path:'/mahjong/socket.io',addTrailingSlash:false,transports:[transport]});
  io.on('connection',s=>{connections++;live=s;if(connections===1)s.emit('mahjong:state',response());});
  await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));const port=(http.address() as import('node:net').AddressInfo).port;
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>{const tile=document.querySelector<HTMLButtonElement>('.is-drawn[data-choice-type="discard"]');return tile&&!tile.disabled;});
   assert.equal(connections,1);assert.equal(live!.conn.transport.name,transport);await page.getByRole('button',{name:'立直',exact:true}).click();await page.getByRole('button',{name:'选择立直牌'}).waitFor();assert.equal(posts.length,0);
   live!.conn.close();await page.getByRole('status',{name:'连接状态'}).waitFor();
   for(let i=0;i<200&&connections<2;i++)await page.waitForTimeout(25);assert.equal(connections,2,'actual Socket.IO reconnect');
   await page.waitForTimeout(200);assert(await page.locator('.is-drawn[data-choice-type="discard"]').isDisabled());assert.equal(await page.locator('.mahjong-hand [data-choice-type="riichi"]').count(),0);
   const stale=response();stale.room!.version=9;live!.emit('mahjong:state',stale);await page.waitForTimeout(120);assert(await page.locator('.is-drawn[data-choice-type="discard"]').isDisabled());assert.equal(posts.length,0);
   await page.screenshot({path:out+`/${engine.name()}-${variant}-${viewport.width}-${transport}-waiting.png`});
   version=11;live!.emit('mahjong:state',response());await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('.is-drawn[data-choice-type="discard"]')?.disabled);assert.equal(await page.getByRole('status',{name:'连接状态'}).count(),0);
   const cut=page.locator('.is-drawn[data-choice-type="discard"]');await cut.click();await cut.click();
   for(let i=0;i<200&&posts.length===0;i++)await page.waitForTimeout(25);assert.equal(posts.length,1);assert.equal(posts[0].choiceId,'discard:z2_');assert.equal(game.view(0).players[0].riichi,false);assert.equal(game.view(0).players[0].discards.at(-1)?.replace(/[_*]/g,''),'z2');assert.deepEqual(errors,[]);
   results.push({engine:engine.name(),variant,viewport,transport,connections,postCount:posts.length,choiceId:posts[0].choiceId,ordinaryDiscardConfirmed:true});console.log('PASS',engine.name(),variant,viewport.width,transport);
  }catch(error){writeFileSync(out+`/${engine.name()}-${variant}-${viewport.width}-${transport}-failure.json`,JSON.stringify({error:String(error),errors,connections,requests,body:await page.locator('body').innerText()},null,2));throw error;}finally{await context.close();await new Promise<void>(resolve=>io.close(()=>resolve()));}
 }}finally{await browser.close();}
}
assert.equal(results.length,16);assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(readFileSync(f))])),sources);writeFileSync(out+'/proof.json',JSON.stringify({sources,bundleSha256:sha(bundle),results},null,2));console.log('PASS 16 native transport reconnect scenes',out);
