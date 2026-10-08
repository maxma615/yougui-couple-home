import {describe, expect, it} from 'vitest';
import {acceptedDeclarationSounds} from '@/components/mahjong/declaration-sounds';
import {SettlementSequenceGame} from '@/modules/mahjong/settlement-sequence';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import {kakanSoundFixture} from '../fixtures/mahjong-audio-game';
import type {GameVariant, MahjongGame, RoomView, Choice} from '@/modules/mahjong/types';

const room = (game:MahjongGame, variant:GameVariant, version:number):RoomView => ({id:'declaration-room',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:0,game:game.view(0),members:[]});
function choose(game:MahjongGame, seat:number, type:Choice['type']) {
 const v=game.view(seat), c=v.choices.find(c=>c.type===type);expect(c).toBeDefined();game.respond(seat,v.decisionId,c!.id);
}
function pair(variant:GameVariant, kind:'ron'|'tsumo'|'riichi') {
 const count=variant==='sanma'?3:4;
 const game=new SettlementSequenceGame(physicalEngine(variant,kind==='ron'?{1:'p123456789s123z2',2:'p123456789s123z2'}:{0:'p123456789s123z2'},'z2'),count);
 if(kind==='ron'){
  const v=game.view(0),c=v.choices.find(c=>c.type==='discard'&&c.value==='z2_')!;game.respond(0,v.decisionId,c.id);choose(game,1,'ron');
 }
 const before=room(game,variant,10);choose(game,kind==='ron'?2:0,kind);
 return {before,after:room(game,variant,11),game};
}
describe('strict public declaration sounds',()=>{
 it('announces native chankan winners from the continuously observed added-kan reaction',()=>{
  const game=new SettlementSequenceGame(kakanSoundFixture('double'),4);
  const v=game.view(1),kan=v.choices.find(c=>c.type==='kan'&&!!c.value?.match(/^[mpsz]\d{3}[+\-=]\d$/));expect(kan).toBeDefined();game.respond(1,v.decisionId,kan!.id);
  choose(game,2,'ron');const before=room(game,'yonma',10);choose(game,3,'ron');const after=room(game,'yonma',11);
  expect(after.game!.settlement?.yaku.some(y=>y.name==='槍槓')).toBe(true);
  expect(acceptedDeclarationSounds(before,after)).toMatchObject([{kind:'ron',seat:2},{kind:'ron',seat:3}]);
 });
 it.each(['sanma','yonma'] as const)('%s declares all native winners at the first result boundary',variant=>{
  const {before,after,game}=pair(variant,'ron');
  const cues=acceptedDeclarationSounds(before,after);
  expect(cues).toMatchObject([{kind:'ron',seat:1,atMs:300},{kind:'ron',seat:2,atMs:330}]);
  expect(new Set(cues.map(c=>c.id)).size).toBe(2);
  choose(game,0,'ack');const next=room(game,variant,12);
  expect(acceptedDeclarationSounds(after,next)).toEqual([]);
  expect(acceptedDeclarationSounds(null,after)).toEqual([]);
 });
 it.each(['sanma','yonma'] as const)('%s distinguishes the native tsumo and riichi discard',variant=>{
  const tsumo=pair(variant,'tsumo');expect(acceptedDeclarationSounds(tsumo.before,tsumo.after)).toMatchObject([{kind:'tsumo',seat:0,atMs:300}]);
  const riichi=pair(variant,'riichi');expect(acceptedDeclarationSounds(riichi.before,riichi.after)).toMatchObject([{kind:'riichi',seat:0,atMs:300}]);
 });
 it.each(['gap','get','room','viewer','hand','instance','decision','late','scores','detail','count','duplicate','seat','method','winner','public-rewrite'] as const)('does not announce an unproved %s boundary',reason=>{
  const {before,after}=pair('yonma','ron');
  const flow=after.game!.settlementFlow!;
  if(reason==='gap')after.version+=1;
  if(reason==='get')after.version=before.version;
  if(reason==='room')after.id='other';
  if(reason==='viewer')after.mySeat=1;
  if(reason==='hand')after.game!.handId=2;
  if(reason==='instance')after.game!.gameInstanceId='other';
  if(reason==='decision')after.game!.decisionId=before.game!.decisionId;
  if(reason==='late')flow.elapsedMs=1200;
  if(reason==='scores')flow.stage='scores';
  if(reason==='detail')flow.detailIndex=1;
  if(reason==='count')flow.detailCount=1;
  if(reason==='duplicate')flow.winDeclarations![1].seat=1;
  if(reason==='seat')flow.winDeclarations![0].seat=4;
  if(reason==='method')flow.winDeclarations![1].winMethod='tsumo';
  if(reason==='winner')after.game!.settlement!.winnerSeat=3;
  if(reason==='public-rewrite')after.game!.players[0].melds=['p111-'];
  expect(acceptedDeclarationSounds(before,after)).toEqual([]);
 });
});
