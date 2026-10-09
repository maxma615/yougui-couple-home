import {randomUUID} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {expect,it} from 'vitest';
import {RoomStore} from '@/modules/mahjong/rooms';
import {BotRunner,BOT_WORKER_LIMITS} from '@/modules/mahjong/bot-runner';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {MahjongCommand} from '@/modules/mahjong/types';
const command=(body:object)=>({...body,nonce:randomUUID()}) as MahjongCommand;
for(const variant of ['sanma','yonma'] as const)it('production computer pacing waits for initial presentation in '+variant,async()=>{
 const store=new RoomStore({gameFactory:()=>physicalEngine(variant,{1:'p123456789s123z2'},'z2',1)}),human={userId:randomUUID(),displayName:'真人'};
 const room=store.execute(human,command({action:'create',mode:'east',variant}))!;store.execute(human,command({action:'fill-bots',roomId:room.id}));store.execute(human,command({action:'ready',ready:true,roomId:room.id}));store.connection(human.userId,1);store.execute(human,command({action:'start',roomId:room.id}));
 const decisions:{at:number;type:string}[]=[],start=performance.now();
 const runner=new BotRunner(store,{workerFactory:()=>new Worker(`const{parentPort}=require('node:worker_threads');parentPort.postMessage({type:'ready',heapLimitBytes:60000000,rssBytes:60000000});parentPort.on('message',j=>parentPort.postMessage({type:'result',id:j.id,choiceId:(j.view.choices.find(c=>c.type==='tsumo')??j.view.choices[0]).id,elapsedMs:0,rssBytes:60000000}));`,{eval:true,execArgv:[],resourceLimits:BOT_WORKER_LIMITS}),onDecision:e=>decisions.push({at:performance.now()-start,type:e.choiceType})});
 try{await new Promise(r=>setTimeout(r,1100));expect(decisions).toHaveLength(0);expect(store.view(human.userId)!.game!.settlement).toBeNull();for(let i=0;i<40&&!decisions.length;i++)await new Promise(r=>setTimeout(r,50));expect(decisions[0]?.type).toBe('tsumo');expect(decisions[0]?.at).toBeGreaterThanOrEqual(1500);expect(runner.metrics.peakWorkers).toBe(1);expect(runner.metrics.failures).toBe(0);}finally{await runner.close();}
});
