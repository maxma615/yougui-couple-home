// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {MahjongFinalRanking} from "@/components/mahjong/mahjong-final-ranking";
import type {RoomMember} from "@/modules/mahjong/types";
beforeEach(()=>vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]}));
afterEach(()=>{cleanup();vi.useRealTimers();});
const tick=(ms:number)=>act(()=>vi.advanceTimersByTime(ms));
function setup(count:number,elapsedMs=0){
 const ranking=Array.from({length:count},(_,i)=>({seat:i,rank:i+1,score:i===count-1?-1200:35000}));
 const members:RoomMember[]=ranking.map(row=>({userId:String(row.seat),seat:row.seat,displayName:row.seat===0?"很长的玩家名字用于显示终局排行榜":"玩家"+row.seat,kind:"human",ready:true,connected:true}));
 const onRematch=vi.fn(),onFinish=vi.fn();
 return {ranking,members,ownSeat:1,flow:{id:"match-a",elapsedMs},host:true,connected:true,busy:false,onRematch,onFinish};
}
it.each([3,4])("%i rows reveal in order and unlock only after complete presentation",count=>{
 const props=setup(count);const {container}=render(<MahjongFinalRanking {...props}/>);
 const visible=()=>container.querySelectorAll('[data-ranking-visible="true"]').length;
 expect(visible()).toBe(0);tick(1799);expect(visible()).toBe(0);tick(1);expect(visible()).toBe(1);
 for(let i=1;i<count;i++){tick(799);expect(visible()).toBe(i);tick(1);expect(visible()).toBe(i+1);}
 expect(screen.queryByRole("button",{name:"再开一场"})).toBeNull();tick(800);
 fireEvent.click(screen.getByRole("button",{name:"再开一场"}));expect(props.onRematch).toHaveBeenCalledOnce();
 expect(screen.getByText("-1,200 点")).toBeTruthy();expect(container.querySelector('[data-own-seat="true"]')).toBeTruthy();
 expect(vi.getTimerCount()).toBe(0);tick(30000);expect(props.onRematch).toHaveBeenCalledOnce();
});
it("reconnect fast forwards, stale ages never rewind, a new match resets",()=>{
 const props=setup(4,3000);const {container,rerender}=render(<MahjongFinalRanking {...props}/>);
 const visible=()=>container.querySelectorAll('[data-ranking-visible="true"]').length;
 expect(visible()).toBe(2);tick(400);expect(visible()).toBe(3);
 rerender(<MahjongFinalRanking {...props} flow={{id:"match-a",elapsedMs:0}}/>);expect(visible()).toBe(3);
 rerender(<MahjongFinalRanking {...props} flow={{id:"match-a",elapsedMs:6000}}/>);expect(visible()).toBe(4);
 rerender(<MahjongFinalRanking {...props} flow={{id:"match-b",elapsedMs:0}}/>);expect(visible()).toBe(0);
});
it("finished reconnect blocks rematch offline or busy and nonhost has no rematch",()=>{
 const props=setup(3,6000);const {rerender}=render(<MahjongFinalRanking {...props} connected={false}/>);
 expect((screen.getByRole("button",{name:"再开一场"}) as HTMLButtonElement).disabled).toBe(true);
 rerender(<MahjongFinalRanking {...props} busy/>);expect((screen.getByRole("button",{name:"再开一场"}) as HTMLButtonElement).disabled).toBe(true);
 rerender(<MahjongFinalRanking {...props} host={false}/>);expect(screen.queryByRole("button",{name:"再开一场"})).toBeNull();
});
it("unmount cancels pending presentation timers",()=>{
 const {unmount}=render(<MahjongFinalRanking {...setup(4)}/>);expect(vi.getTimerCount()).toBe(1);unmount();expect(vi.getTimerCount()).toBe(0);
});

it("same-match stale ages cannot rewind the CSS fade origin",()=>{
 const props=setup(3,900);const {container,rerender}=render(<MahjongFinalRanking {...props}/>);
 const delay=()=> (container.querySelector('.mahjong-ranking') as HTMLElement).style.getPropertyValue('--ranking-start-age');
 expect(delay()).toBe('-900ms');tick(300);
 rerender(<MahjongFinalRanking {...props} flow={{id:'match-a',elapsedMs:0}}/>);expect(delay()).toBe('-900ms');
 rerender(<MahjongFinalRanking {...props} flow={{id:'match-a',elapsedMs:6000}}/>);expect(delay()).toBe('-1000ms');
 rerender(<MahjongFinalRanking {...props} flow={{id:'match-b',elapsedMs:0}}/>);expect(delay()).toBe('0ms');
});
