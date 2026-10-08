import {expect,it} from 'vitest';
import {kakanSoundFixture} from '../fixtures/mahjong-audio-game';
it('returns only the requesting seat ron block through real kan/pass decisions',()=>{
 const game=kakanSoundFixture(true);
 for(let seat=0;seat<4;seat++){const v=game.view(seat);expect(typeof v.ronBlocked).toBe('boolean');expect(v.players.every(p=>!('ronBlocked' in p))).toBe(true)}
 const view=game.view(1),kan=view.choices.find(c=>c.type==='kan')!;expect(kan).toBeTruthy();game.respond(1,view.decisionId,kan.id);
 expect(game.view(2).choices.some(c=>c.type==='ron')).toBe(true);expect(game.view(2).ronBlocked).toBe(false);
 for(let seat=0;seat<4;seat++){const v=game.view(seat),pass=v.choices.find(c=>c.type==='pass');if(pass)game.respond(seat,v.decisionId,pass.id)}
 expect(game.view(2).ronBlocked).toBe(true);expect(game.view(0).ronBlocked).toBe(false);expect(game.view(0).players.every(p=>!('ronBlocked' in p))).toBe(true);
});
