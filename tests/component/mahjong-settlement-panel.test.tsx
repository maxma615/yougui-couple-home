// @vitest-environment jsdom
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {GameRoom} from "@/components/mahjong/mahjong-client";
import type {GameView, RoomView} from "@/modules/mahjong/types";
afterEach(cleanup);
// Payload boundary fixture deliberately separates current scores and authoritative
// delta from hand value: rendering must never compute either from fu/han/counters.
function room(variant:"sanma"|"yonma", method:"ron"|"tsumo"="ron"):RoomView {
 const count=variant==="sanma"?3:4;
 const game:GameView={decisionId:"hule:1",phase:"hule",roundWind:0,roundNumber:1,honba:2,riichiSticks:1,remainingTiles:20,doraIndicators:["m1"],turnSeat:0,hand:[],drawnTile:null,choices:[{id:"ack",type:"ack"}],ranking:null,
 players:Array.from({length:count},(_,seat)=>({seat,wind:seat,score:seat===2?34000:35000,handCount:13,discards:[],melds:[],riichi:false})),
 settlement:{kind:"win",name:"和了",winnerSeat:1,winMethod:method,winningTile:"z2",hand:"p123456s123z5552",fu:50,han:1,points:1600,delta:count===3?[-2000,3000,0]:[-2200,3200,0,0],yaku:[{name:"翻牌 白",han:1}],uraIndicators:["p0"]}};
 return {id:"payment",code:"ABCDEFGH",hostUserId:"0",variant,mode:"east",status:"playing",version:1,mySeat:0,game,members:Array.from({length:count},(_,seat)=>({userId:String(seat),displayName:["甲","乙","丙","丁"][seat],seat,kind:"human",ready:true,connected:true}))};
}
function show(r:RoomView, connected=true, busy=false){const choice=vi.fn();const result=render(<GameRoom room={r} ownSeat={0} connected={connected} busy={busy} motionCanAnimate={false} host={false} onChoice={choice} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/>);return {...result,choice,panel:screen.getByRole("region",{name:"本局结算"})};}
it.each(["sanma","yonma"] as const)("explains hand value and fixed-seat actual transfers for %s",variant=>{
 const r=room(variant),{panel}=show(r);
 expect(within(panel).getByText("乙 · 荣和")).toBeTruthy();
 expect(within(panel).getByText("牌型点数")).toBeTruthy();
 expect(within(panel).getByText("1,600 点")).toBeTruthy();
 const rows=panel.querySelectorAll('[data-settlement-seat]');expect(rows.length).toBe(r.game!.players.length);
 rows.forEach((row,seat)=>{expect(row.getAttribute('data-settlement-seat')).toBe(String(seat));expect(row.textContent).toContain(`当前 ${r.game!.players[seat].score.toLocaleString()}`);});
 expect(rows[0].textContent).toContain(variant==="sanma"?"支付 −2,000":"支付 −2,200");
 expect(rows[1].textContent).toContain(variant==="sanma"?"获得 +3,000":"获得 +3,200");expect(rows[2].textContent).toContain("不变 0");
 expect(panel.textContent).toContain("本场 2");expect(panel.textContent).toContain("立直棒 1");
 expect(panel.querySelectorAll('.mahjong-winning-hand [data-tile-face]')).toHaveLength(14);
 expect(panel.querySelectorAll('.mahjong-ura-indicators [data-tile-face]')).toHaveLength(1);
});
it("limits subsequent multi-ron to its current winner and current delta",()=>{
 const r=room("sanma");const {rerender,panel}=show(r);
 const next=structuredClone(r);next.version++;next.game!.decisionId="hule:2";next.game!.riichiSticks=0;next.game!.players[0].score=33000;next.game!.players[1].score=38000;next.game!.settlement!.winnerSeat=2;next.game!.settlement!.delta=[-2000,0,2000];
 rerender(<GameRoom room={next} ownSeat={0} connected busy={false} motionCanAnimate={false} host={false} onChoice={()=>{}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/>);
 expect(within(panel).getByText("丙 · 荣和")).toBeTruthy();expect(panel.textContent).toContain("仅显示当前和牌者的本次结算");expect(panel.textContent).not.toContain("+3,000");expect(panel.textContent).toContain("获得 +2,000");expect(panel.textContent).not.toContain("总计");
});
it("identifies sanma tsumo loss and sends only the legal acknowledgement",()=>{const r=room("sanma","tsumo"),{panel,choice}=show(r);expect(panel.textContent).toContain("三麻采用自摸损");const ack=within(panel).getByRole("button",{name:"继续"});fireEvent.click(ack);expect(choice).toHaveBeenCalledExactlyOnceWith(r.game!.choices[0]);});
it.each([[false,false],[true,true]])("disables acknowledgement when connected=%s busy=%s",(connected,busy)=>{const {panel,choice}=show(room("sanma"),connected,busy);const ack=within(panel).getByRole("button",{name:"继续"}) as HTMLButtonElement;expect(ack.disabled).toBe(true);fireEvent.click(ack);expect(choice).not.toHaveBeenCalled();});
