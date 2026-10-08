// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
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
 const r=room();r.game!.hand=['m1','m2','m3','p1','p2','p3','s4','s5','s6','s7','s8','s9','z1','z2'];r.game!.drawnTile='z2';r.game!.choices=[{id:'z2',type:'discard',value:'z2_'}];render(<GameRoom room={r} ownSeat={0} connected motionCanAnimate={false} host busy={false} onChoice={()=>{}} onRematch={()=>{}} onFinish={()=>{}} onLeave={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'切出 南风'}));const text=screen.getByRole('status',{name:'待牌预览'}).textContent;expect(text).toContain('无役');expect(text).not.toContain('振听');expect(text).not.toContain('张');
});

it('waiting players hold current waits without commands and disconnect clears the hold',()=>{
 const r=room();r.game!.hand.pop();r.game!.drawnTile=null;r.game!.choices=[];r.game!.turnSeat=1;r.game!.ronBlocked=true;
 const onChoice=vi.fn(),props={room:r,ownSeat:0,motionCanAnimate:false,host:true,busy:false,onChoice,onRematch:()=>{},onFinish:()=>{},onLeave:()=>{}};
 const mounted=render(<GameRoom {...props} connected/>);
 const toggle=screen.getByRole('button',{name:'查看待牌'});expect(toggle.getAttribute('aria-pressed')).toBe('false');
 fireEvent.keyDown(toggle,{key:' '});expect(screen.getByRole('status',{name:'待牌预览'}).textContent).toContain('振听');expect(onChoice).not.toHaveBeenCalled();
 fireEvent.keyUp(toggle,{key:' '});expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();fireEvent.keyDown(toggle,{key:'Enter'});
 mounted.rerender(<GameRoom {...props} connected={false}/>);expect(screen.queryByRole('button',{name:'查看待牌'})).toBeNull();expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();
 mounted.rerender(<GameRoom {...props} connected/>);expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();expect(onChoice).not.toHaveBeenCalled();
});
it('mouse hover previews without selection, while touch entry does not open a preview',()=>{
 const onChoice=vi.fn();render(<GameRoom room={room()} ownSeat={0} connected motionCanAnimate={false} host busy={false} onChoice={onChoice} onRematch={()=>{}} onFinish={()=>{}} onLeave={()=>{}}/>);
 const button=screen.getAllByRole('button',{name:'切出 东风'}).find(b=>!(b as HTMLButtonElement).disabled)!;
 const enter=(kind:string)=>{const event=new Event('pointerover',{bubbles:true});Object.defineProperty(event,'pointerType',{value:kind});fireEvent(button,event);};
 enter('touch');expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();enter('mouse');expect(screen.getByRole('status',{name:'待牌预览'})).toBeTruthy();expect(button.getAttribute('aria-pressed')).toBe('false');expect(onChoice).not.toHaveBeenCalled();
 const leave=new Event('pointerout',{bubbles:true});Object.defineProperty(leave,'pointerType',{value:'mouse'});fireEvent(button,leave);expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();
 fireEvent.click(button);expect(onChoice).not.toHaveBeenCalled();fireEvent.click(button);expect(onChoice).toHaveBeenCalledOnce();
});

it('press release, cancellation, leaving, blur and viewport changes dismiss current waits',()=>{
 const r=room();r.game!.hand.pop();r.game!.drawnTile=null;r.game!.choices=[];r.game!.turnSeat=1;
 const onChoice=vi.fn();render(<GameRoom room={r} ownSeat={0} connected motionCanAnimate={false} host busy={false} onChoice={onChoice} onRematch={()=>{}} onFinish={()=>{}} onLeave={()=>{}}/>);
 const button=screen.getByRole('button',{name:'查看待牌'});
 const pointer=(name:string,kind='mouse',buttonNumber=0)=>{const e=new MouseEvent(name,{bubbles:true,button:buttonNumber});Object.defineProperties(e,{pointerType:{value:kind},pointerId:{value:7},isPrimary:{value:true}});fireEvent(button,e);};
 pointer('pointerdown','mouse',2);expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();
 for(const end of ['pointerup','pointercancel','lostpointercapture','pointerout']){pointer('pointerdown');expect(screen.getByRole('status',{name:'待牌预览'})).toBeTruthy();pointer(end);expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();}
 pointer('pointerdown','touch');expect(screen.getByRole('status',{name:'待牌预览'})).toBeTruthy();pointer('pointercancel','touch');expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();
 for(const name of ['resize','orientationchange','blur','pagehide']){fireEvent.keyDown(button,{key:'Enter'});expect(screen.getByRole('status',{name:'待牌预览'})).toBeTruthy();fireEvent(window,new Event(name));expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();}
 fireEvent.keyDown(button,{key:'Enter'});fireEvent.blur(button);expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();fireEvent.click(button);expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();expect(onChoice).not.toHaveBeenCalled();
});

it('a single tenpai discard exposes the hold entry before any tile selection',()=>{
 const r=room(),onChoice=vi.fn();r.game!.hand=['p1','p2','p3','p4','p5','p6','p7','p8','p9','s1','s2','z1','z1','z7'];r.game!.drawnTile='z7';r.game!.choices=r.game!.hand.map((tile,i)=>({id:'cut:'+i,type:'discard',value:tile+(i===13?'_':'')}));
 render(<GameRoom room={r} ownSeat={0} connected motionCanAnimate={false} host busy={false} onChoice={onChoice} onRematch={()=>{}} onFinish={()=>{}} onLeave={()=>{}}/>);
 expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();const peek=screen.getByRole('button',{name:'查看待牌'});fireEvent.keyDown(peek,{key:' '});expect(screen.getByRole('status',{name:'待牌预览'}).textContent).toContain('4 张');expect(screen.getAllByRole('button',{pressed:true})).toEqual([peek]);expect(onChoice).not.toHaveBeenCalled();fireEvent.keyUp(peek,{key:' '});expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();
});
it('multiple tenpai discards have no ambiguous hold entry',()=>{
 const r=room();r.game!.hand=['p1','p2','p3','p4','p5','p6','p7','p8','p9','s1','s2','s3','z1','z2'];r.game!.drawnTile='z2';r.game!.choices=r.game!.hand.map((tile,i)=>({id:'cut:'+i,type:'discard',value:tile+(i===13?'_':'')}));
 render(<GameRoom room={r} ownSeat={0} connected motionCanAnimate={false} host busy={false} onChoice={()=>{}} onRematch={()=>{}} onFinish={()=>{}} onLeave={()=>{}}/>);expect(screen.queryByRole('button',{name:'查看待牌'})).toBeNull();
});
it('the single discard hold entry follows the current riichi mode and never submits a declaration',()=>{
 const r=room(),onChoice=vi.fn();r.game!.hand=['p1','p2','p3','p4','p5','p6','p7','p8','p9','s1','s2','z1','z1','z7'];r.game!.drawnTile='z7';r.game!.choices=[{id:'cut',type:'discard',value:'z7_'},{id:'r',type:'riichi',value:'z7_'}];
 render(<GameRoom room={r} ownSeat={0} connected motionCanAnimate={false} host busy={false} onChoice={onChoice} onRematch={()=>{}} onFinish={()=>{}} onLeave={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'立直'}));const peek=screen.getByRole('button',{name:'查看待牌'});fireEvent.keyDown(peek,{key:'Enter'});expect(screen.getByRole('status',{name:'待牌预览'})).toBeTruthy();fireEvent.keyUp(peek,{key:'Enter'});expect(onChoice).not.toHaveBeenCalled();expect(screen.queryByRole('status',{name:'待牌预览'})).toBeNull();
});


it('desktop dwell preselects a physical tile so the next click submits its native choice',()=>{
 vi.useFakeTimers();
 try {
  const onChoice=vi.fn();render(<GameRoom room={room()} ownSeat={0} connected motionCanAnimate={false} host busy={false} onChoice={onChoice} onRematch={()=>{}} onFinish={()=>{}} onLeave={()=>{}}/>);
  const button=screen.getAllByRole('button',{name:'切出 东风'}).find(b=>!(b as HTMLButtonElement).disabled)!;
  const enter=new Event('pointerover',{bubbles:true});Object.defineProperty(enter,'pointerType',{value:'mouse'});fireEvent(button,enter);
  act(()=>vi.advanceTimersByTime(11));expect(button.getAttribute('aria-pressed')).toBe('true');expect(onChoice).not.toHaveBeenCalled();
  fireEvent.click(button,{detail:1});expect(onChoice).toHaveBeenCalledOnce();expect(onChoice.mock.calls[0][0]).toEqual({id:'cut',type:'discard',value:'z1_'});
 } finally {vi.useRealTimers();}
});
