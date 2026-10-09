import {expect,it} from 'vitest';
import {acceptedActionVoices} from '@/components/mahjong/action-voices';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import {kakanSoundFixture} from '../fixtures/mahjong-audio-game';
import {northReplacementFixture} from '../fixtures/mahjong-view-game';
import type {GameVariant,MahjongGame,RoomView} from '@/modules/mahjong/types';
const room=(game:MahjongGame,variant:GameVariant,version:number,seat=0):RoomView=>({id:'action-voice-room',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:seat,game:game.view(seat),members:[]});
function choose(game:MahjongGame,seat:number,type:string,value?:string){const v=game.view(seat),c=v.choices.find(c=>c.type===type&&(!value||c.value===value));expect(c).toBeDefined();game.respond(seat,v.decisionId,c!.id);}
function openPair(kind:'chi'|'pon'|'kan',variant:GameVariant='yonma'){
 const hands=kind==='chi'?{0:'p3s123456789z123',1:'p12s123456789z45'}:kind==='pon'?{0:'p1s123456789z123',1:'p11s123456789z45'}:{0:'p1s123456789z123',1:'p111s123456789z4'};
 const game=physicalEngine(variant,hands,'p9');choose(game,0,'discard',kind==='chi'?'p3':'p1');const before=room(game,variant,1);choose(game,1,kind);
 for(let seat=2;seat<(variant==='sanma'?3:4);seat++){const v=game.view(seat);if(v.choices.some(c=>c.type==='pass'))choose(game,seat,'pass');}
 return {before,after:room(game,variant,2)};
}
for(const [variant,kind] of [['yonma','chi'],['yonma','pon'],['yonma','kan'],['sanma','pon'],['sanma','kan']] as const)it(`proves ${variant} open ${kind} at its declaration, independently of landing`,()=>{
 const {before,after}=openPair(kind,variant),events=acceptedActionVoices(before,after);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({kind,seat:1,decisionId:after.game!.decisionId});
 expect(events[0].id).toMatch(/^action-voice:call:/);expect(events[0]).not.toHaveProperty('tile');expect(acceptedActionVoices(null,after)).toEqual([]);
});
for(const variant of ['sanma','yonma'] as const)it(`proves ${variant} concealed kan without reading another hand`,()=>{
 const game=physicalEngine(variant,{0:'p111s123456789z2'},'p1');const before=room(game,variant,1,1);choose(game,0,'kan');const after=room(game,variant,2,1);expect(before.game!.hand).not.toContain('p1');
 expect(acceptedActionVoices(before,after)).toMatchObject([{kind:'kan',seat:0}]);
});
it('announces added kan during the robbing window once; resolution cannot create a second voice',()=>{
 const game=kakanSoundFixture(true),before=room(game,'yonma',1);choose(game,1,'kan');const declared=room(game,'yonma',2);
 expect(declared.game!.phase).toBe('gang');expect(acceptedActionVoices(before,declared)).toMatchObject([{kind:'kan',seat:1}]);
 choose(game,2,'pass');const next=room(game,'yonma',3);expect(acceptedActionVoices(declared,next)).toEqual([]);
});
it('robbed added kan retains its original declaration but cannot create a successful-kan voice',()=>{
 const game=kakanSoundFixture(true),before=room(game,'yonma',1);choose(game,1,'kan');const declared=room(game,'yonma',2);
 expect(acceptedActionVoices(before,declared)).toMatchObject([{kind:'kan',seat:1}]);choose(game,2,'ron');expect(acceptedActionVoices(declared,room(game,'yonma',3))).toEqual([]);
});
it('repeated north extractions have different public identities and no replacement voice',()=>{
 const game=northReplacementFixture(true);let before=room(game,'sanma',1,1);const ids:string[]=[];
 for(let n=0;n<2;n++){choose(game,0,'nuki');for(let seat=1;seat<3;seat++){if(game.view(seat).choices.some(c=>c.type==='pass'))choose(game,seat,'pass');}const after=room(game,'sanma',before.version+1,1);const events=acceptedActionVoices(before,after);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({kind:'north',seat:0});ids.push(events[0].id);before=after;}
 expect(new Set(ids).size).toBe(2);
});
for(const reason of ['gap','old','room','viewer','variant','instance','hand','decision','settled','rewrite'] as const)it(`refuses unproved ${reason} call voice`,()=>{
 const {before,after}=openPair('pon');
 if(reason==='gap')after.version+=2;if(reason==='old')after.version=before.version;if(reason==='room')after.id='other';if(reason==='viewer')after.mySeat=1;if(reason==='variant')after.variant='sanma';
 if(reason==='instance')after.game!.gameInstanceId='other';if(reason==='hand')after.game!.handId=2;if(reason==='decision')after.game!.decisionId=before.game!.decisionId;
 if(reason==='settled')after.status='finished';if(reason==='rewrite')after.game!.players[2].melds=['p222-'];
 expect(acceptedActionVoices(before,after)).toEqual([]);
});

import {actionVoiceSequence} from '../fixtures/mahjong-action-voice-game';
for(const kind of ['north-pass','north-robbed','closed-kan-pass','closed-kan-robbed'] as const)it(`speaks the public pending ${kind} before its resolution, once`,()=>{
 const {frames}=actionVoiceSequence('sanma',kind);expect(frames[1].game!.phase).toBe(kind.startsWith('north')?'nuki':'gang');
 expect(acceptedActionVoices(frames[0],frames[1])).toMatchObject([{kind:kind.startsWith('north')?'north':'kan',seat:0,decisionId:frames[1].game!.decisionId}]);
 for(let n=2;n<frames.length;n++)expect(acceptedActionVoices(frames[n-1],frames[n])).toEqual([]);
});
for(const reason of ['gap','wrong-variant','wrong-seat','other-nuki','other-meld','remaining','stick','same-decision','missing-instance'] as const)it(`refuses unproved pending action ${reason}`,()=>{
 const {frames}=actionVoiceSequence('sanma','north-pass'),before=structuredClone(frames[0]),after=structuredClone(frames[1]);
 if(reason==='gap')after.version+=1;if(reason==='wrong-variant'){after.variant='yonma';before.variant='yonma';}if(reason==='wrong-seat')after.game!.turnSeat=1;
 if(reason==='other-nuki')after.game!.players[1].nuki=1;if(reason==='other-meld')after.game!.players[1].melds=['p111-'];if(reason==='remaining')after.game!.remainingTiles--;
 if(reason==='stick')after.game!.riichiSticks++;if(reason==='same-decision')after.game!.decisionId=before.game!.decisionId;if(reason==='missing-instance')after.game!.gameInstanceId=undefined;
 expect(acceptedActionVoices(before,after)).toEqual([]);
});
