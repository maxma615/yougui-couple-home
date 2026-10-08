// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {GameRoom} from '@/components/mahjong/mahjong-client';
import type {GameView,RoomView} from '@/modules/mahjong/types';
afterEach(cleanup);
function room():RoomView{
 const hand=['p1','p2','p3','p4','p5','p6','p7','p8','p9','s1','s2','s3','z1','z1'];
 const game:GameView={decisionId:'d',phase:'zimo',roundWind:0,roundNumber:1,honba:0,riichiSticks:0,remainingTiles:30,doraIndicators:['z7'],turnSeat:0,hand,drawnTile:'z1',players:[0,1,2,3].map(seat=>({seat,wind:seat,score:25000,handCount:13,discards:[],melds:[],riichi:false})),choices:[{id:'cut',type:'discard',value:'z1_'}],settlement:null,ranking:null};
 return {id:'r',code:'ABCDEFGH',hostUserId:'0',variant:'yonma',mode:'east',status:'playing',version:1,mySeat:0,game,members:[0,1,2,3].map(seat=>({seat,userId:String(seat),displayName:String(seat),kind:'human',ready:true,connected:true}))};
}
it('selection reveals wait tiles without submitting, the second activation submits and hides it',()=>{
 const onChoice=vi.fn();render(<GameRoom room={room()} ownSeat={0} connected motionCanAnimate={false} host busy={false} onChoice={onChoice} onRematch={()=>{}} onFinish={()=>{}} onLeave={()=>{}}/>);
 expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();const button=screen.getAllByRole('button',{name:'切出 东风'}).find(b=>!(b as HTMLButtonElement).disabled)!;
 fireEvent.click(button);expect(screen.getByRole('status',{name:'待牌预览'}).textContent).toContain('2 张');expect(screen.getByRole('status',{name:'待牌预览'}).textContent).toContain('振听');expect(onChoice).not.toHaveBeenCalled();
 fireEvent.click(button);expect(onChoice).toHaveBeenCalledOnce();expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();
});
it('disconnect hides the selected preview and prevents submitting',()=>{
 const onChoice=vi.fn(),r=room(),props={room:r,ownSeat:0,motionCanAnimate:false,host:true,busy:false,onChoice,onRematch:()=>{},onFinish:()=>{},onLeave:()=>{}};const mounted=render(<GameRoom {...props} connected/>);
 fireEvent.click(screen.getAllByRole('button',{name:'切出 东风'}).find(b=>!(b as HTMLButtonElement).disabled)!);expect(screen.getByRole('status',{name:'待牌预览'})).toBeTruthy();mounted.rerender(<GameRoom {...props} connected={false}/>);expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();expect(onChoice).not.toHaveBeenCalled();
});
it('switching to riichi hides a previous ordinary selection until a riichi tile is selected',()=>{
 const r=room();r.game!.choices.push({id:'riichi',type:'riichi',value:'z1_'});const onChoice=vi.fn();render(<GameRoom room={r} ownSeat={0} connected motionCanAnimate={false} host busy={false} onChoice={onChoice} onRematch={()=>{}} onFinish={()=>{}} onLeave={()=>{}}/>);
 fireEvent.click(screen.getAllByRole('button',{name:'切出 东风'}).find(b=>!(b as HTMLButtonElement).disabled)!);expect(screen.getByRole('status',{name:'待牌预览'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'立直'}));expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();
 fireEvent.click(screen.getAllByRole('button',{name:'立直后切出 东风'}).find(b=>!(b as HTMLButtonElement).disabled)!);expect(screen.getByRole('status',{name:'待牌预览'})).toBeTruthy();expect(onChoice).not.toHaveBeenCalled();
});

it('shows the no-yaku label for a different discard that keeps a closed tsumo yaku',()=>{
 const r=room();r.game!.hand=['m1','m2','m3','p1','p2','p3','s4','s5','s6','s7','s8','s9','z1','z2'];r.game!.drawnTile='z2';r.game!.choices=[{id:'z2',type:'discard',value:'z2_'}];render(<GameRoom room={r} ownSeat={0} connected motionCanAnimate={false} host busy={false} onChoice={()=>{}} onRematch={()=>{}} onFinish={()=>{}} onLeave={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'切出 南风'}));const text=screen.getByRole('status',{name:'待牌预览'}).textContent;expect(text).toContain('无役');expect(text).not.toContain('振听');
});
