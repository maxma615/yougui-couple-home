// Actual client, HTTP and Socket.IO; synthetic authenticated identities only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Server} from 'socket.io';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
import {RoomStore,parseMahjongCommand} from '../../src/modules/mahjong/rooms';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
const out='.local/audit/global-dialogs-'+Date.now();mkdirSync(out,{recursive:true});
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>'src/app/mahjong/'+m[1]);
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MahjongClient}from'./src/components/mahjong/mahjong-client';createRoot(document.getElementById('root')).render(React.createElement(MahjongClient));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,metafile:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'navigation',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`const router={replace:url=>{throw Error('Unexpected navigation:'+url)}};export const useRouter=()=>router;export const usePathname=()=>'/mahjong';`,loader:'js'}));}}]});
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const sourceFiles=[...Object.keys(bundle.metafile!.inputs).filter(f=>!f.includes(':')&&!f.startsWith('<')&&!f.startsWith('node_modules/')), ...cssFiles,'tests/browser/mahjong-global-dialogs.tsx'];
const sources=Object.fromEntries([...new Set(sourceFiles)].map(f=>[f,sha(readFileSync(f))]));writeFileSync(out+'/manifest.json',JSON.stringify({sources,bundle:sha(bundle.outputFiles[0].text)},null,2));
const results:any[]=[];
const cases=[{width:375,height:667,touch:true},{width:390,height:844,touch:true},{width:412,height:915,touch:true},{width:844,height:390,touch:true},{width:1440,height:810,touch:false}];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const variant of ['sanma','yonma'] as const)for(const viewport of cases){
  const players=Array.from({length:variant==='sanma'?3:4},(_,seat)=>({userId:randomUUID(),displayName:'合成玩家'+seat}));
  const rooms=new RoomStore({gameFactory:()=>physicalEngine(variant,{0:'p23887654s421z22'},'p1')});
  const command=(body:object)=>parseMahjongCommand({...body,nonce:randomUUID()});const room=rooms.execute(players[0],command({action:'create',variant,mode:'east'}))!;
  for(const player of players.slice(1))rooms.execute(player,command({action:'join',code:room.code}));
  for(const player of players)rooms.execute(player,command({action:'ready',ready:true,roomId:room.id}));
  rooms.execute(players[0],command({action:'start',roomId:room.id}));
  const posts:any[]=[],errors:string[]=[],serverErrors:string[]=[];
  const state=()=>({room:rooms.view(players[0].userId),serviceRunning:true});let socketServer:Server;
  const server=createServer(async(req,res)=>{try{
   const path=new URL(req.url!,'http://local').pathname;
   const json=(v:unknown)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(v));};
   if(path==='/api/session')return json({user:{id:players[0].userId,displayName:players[0].displayName,role:'member',email:null},home:null});
   if(path==='/api/mahjong'&&req.method==='GET')return json(state());
   if(path==='/api/mahjong'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const c=parseMahjongCommand(JSON.parse(body));posts.push(c);assert.equal(c.action,'finish');rooms.execute(players[0],c);socketServer.emit('mahjong:state',state());return json(state());}
   if(path.startsWith('/images/')||path.startsWith('/fonts/')||path.startsWith('/audio/')){res.writeHead(200);return res.end(readFileSync('public'+path));}
   if(path==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*,*::before,*::after{box-sizing:border-box}${cssFiles.map(f=>readFileSync(f,'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.process={env:{NODE_ENV:'development'}};globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});${bundle.outputFiles[0].text}</script>`);}
   res.writeHead(404);res.end();
  }catch(e){serverErrors.push(String(e));res.writeHead(500);res.end();}});
  socketServer=new Server(server,{path:'/mahjong/socket.io',addTrailingSlash:false});socketServer.on('connection',s=>s.emit('mahjong:state',state()));
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as import('node:net').AddressInfo).port;
  const context=await browser.newContext({viewport,hasTouch:viewport.touch});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const press=async(button:import('@playwright/test').Locator)=>viewport.touch?button.tap():button.click();
  const checkDialog=async(dialog:import('@playwright/test').Locator)=>{
   const rotated=await page.locator('.mahjong-game').getAttribute('data-table-rotated')==='true';
   const values=await dialog.evaluate(node=>{const css=getComputedStyle(node),r=node.getBoundingClientRect();return{transform:css.transform,rect:{x:r.x,y:r.y,width:r.width,height:r.height},vw:css.getPropertyValue('--mahjong-vw'),vh:css.getPropertyValue('--mahjong-vh')};});
   const matrix=values.transform==='none'?[1,0,0,1]:values.transform.match(/matrix\(([^)]+)\)/)![1].split(',').map(Number);
   assert.ok(Math.abs(matrix[0]-(rotated?0:1))<.001&&Math.abs(matrix[1]-(rotated?1:0))<.001,JSON.stringify(values));
   const frame=(await page.locator('.mahjong-game').boundingBox())!,r=values.rect;
   assert.ok(r.x>=frame.x-1&&r.y>=frame.y-1&&r.x+r.width<=frame.x+frame.width+1&&r.y+r.height<=frame.y+frame.height+1,JSON.stringify({frame,r}));
   assert.ok(Math.abs(r.x+r.width/2-(frame.x+frame.width/2))<1&&Math.abs(r.y+r.height/2-(frame.y+frame.height/2))<1);
   for(const b of await dialog.locator('button').all()){const rect=(await b.boundingBox())!;assert.ok(rect.width>=43.5&&rect.height>=43.5,JSON.stringify(rect));}
  };
  try{
   await page.goto('http://127.0.0.1:'+port);await page.locator('.mahjong-game[data-table-fitted="true"]').waitFor();
   const exit=page.getByRole('button',{name:'结束并解散牌桌',exact:true});await press(exit);
   const finish=page.getByRole('dialog',{name:'确定解散这张牌桌？',exact:true});await finish.waitFor();await checkDialog(finish);
   await press(finish.getByRole('button',{name:'继续打牌',exact:true}));await finish.waitFor({state:'detached'});assert.equal(posts.length,0);assert.equal(await exit.evaluate(node=>document.activeElement===node),true);
   await press(exit);await finish.waitFor();await page.keyboard.press('Escape');await finish.waitFor({state:'detached'});assert.equal(posts.length,0);
   const ruleTrigger=page.getByRole('button',{name:'查看规则',exact:true});await press(ruleTrigger);
   const rules=page.getByRole('dialog',{name:variant==='sanma'?'三人麻将规则':'四人麻将规则',exact:true});await rules.waitFor();await checkDialog(rules);
   if(variant==='sanma'&&viewport.touch){assert.equal(await rules.evaluate(d=>d.scrollHeight>d.clientHeight),true);const scrollBox=(await rules.boundingBox())!;await page.mouse.move(scrollBox.x+scrollBox.width/2,scrollBox.y+scrollBox.height/2);await page.mouse.wheel(0,500);await page.waitForFunction(()=>document.querySelector<HTMLDialogElement>('.mahjong-rules')!.scrollTop>0);await page.mouse.wheel(0,-500);await page.waitForFunction(()=>document.querySelector<HTMLDialogElement>('.mahjong-rules')!.scrollTop===0);}
   if(viewport.touch&&viewport.width<viewport.height){await page.setViewportSize({width:viewport.height,height:viewport.width});await page.waitForFunction(()=>!document.querySelector('[data-table-rotated="true"]'));await checkDialog(rules);await page.setViewportSize(viewport);await page.waitForFunction(()=>Boolean(document.querySelector('[data-table-rotated="true"]')));await checkDialog(rules);}
   await page.screenshot({path:`${out}/${engine.name()}-${variant}-${viewport.width}-rules.png`});
   await press(rules.getByRole('button',{name:'关闭规则',exact:true}));await rules.waitFor({state:'detached'});assert.equal(await ruleTrigger.evaluate(node=>document.activeElement===node),true);
   await press(ruleTrigger);await rules.waitFor();await page.keyboard.press('Escape');await rules.waitFor({state:'detached'});assert.equal(posts.length,0);
   await press(exit);await finish.waitFor();await checkDialog(finish);await press(finish.getByRole('button',{name:'解散牌桌',exact:true}));await page.getByRole('button',{name:'创建东风牌桌',exact:true}).waitFor();assert.equal(posts.length,1);assert.equal(posts[0].action,'finish');assert.equal(rooms.view(players[0].userId),null);
   // Lobby rules keep the normal physical portrait rather than table rotation.
   await press(page.getByRole('button',{name:'查看规则',exact:true}));await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').evaluate(node=>getComputedStyle(node).transform),'none');await press(page.getByRole('button',{name:'关闭规则',exact:true}));
   assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);results.push({browser:engine.name(),variant,viewport,finishPosts:posts.length,focus:true,scroll:variant==='sanma'&&viewport.touch,orientation:true});writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log('PASS',engine.name(),variant,viewport.width,viewport.height);
  }finally{await context.close();await new Promise<void>(r=>socketServer.close(()=>r()));if(server.listening)await new Promise<void>(r=>server.close(()=>r()));}
 }}finally{await browser.close();}
}
for(const[file,digest]of Object.entries(sources))assert.equal(sha(readFileSync(file)),digest,file+' changed during native verification');
console.log('PASS',results.length,'actual client/global modal/network cases',out);
