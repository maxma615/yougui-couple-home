"use client";

import {useEffect, useRef, useState} from "react";
import type {GameView, RoomMember} from "@/modules/mahjong/types";
import {tileName} from "./mahjong-tile";

type Feedback = {key:string; kind:string; text:string; seat?:number};
type Snapshot = {room:string; gameInstanceId?:string; handId?:number; round:string; decision:string; settlementIdentity:string|null; players:{seat:number;nuki:number;riichi:boolean;discards:string[];melds:string[]}[]};
type FeedbackSource = {connected:boolean; canAnimate:boolean};

// Feedback follows acknowledged public state, never an optimistic button press.
export function useTableFeedback(game:GameView|null, members:RoomMember[], ownSeat:number, roomId:string, source:FeedbackSource = {connected:true,canAnimate:true}) {
  const previous=useRef<Snapshot|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const activeKind=useRef<string|null>(null);
  const [feedback,setFeedback]=useState<Feedback|null>(null);
  useEffect(() => {
    if (!game) {if(timer.current) clearTimeout(timer.current); timer.current=null; activeKind.current=null; previous.current=null; setFeedback(null); return;}
    const next:Snapshot={room:roomId,gameInstanceId:game.gameInstanceId,handId:game.handId,round:`${game.roundWind}:${game.roundNumber}:${game.honba}`,decision:game.decisionId,settlementIdentity:game.settlement ? `${game.settlement.kind}:${game.settlement.winnerSeat ?? ""}` : null,
      players:game.players.map(p=>({seat:p.seat,nuki:p.nuki??0,riichi:p.riichi,discards:p.discards.slice(),melds:p.melds.slice()}))};
    const old=previous.current;
    previous.current=next;
    if (!old || old.room!==next.room || old.gameInstanceId!==next.gameInstanceId || old.handId!==next.handId || old.round!==next.round) {
      if (timer.current) clearTimeout(timer.current);
      timer.current=null; activeKind.current=null;
      setFeedback(null); return;
    }
    if (!source.connected) {
      if (timer.current) clearTimeout(timer.current);
      timer.current=null;
      activeKind.current=null;
      setFeedback(null);
      return;
    }
    if (old.decision===next.decision) return;
    // GET refreshes and a socket's first snapshot establish state only. They may
    // contain actions that happened while this view was disconnected.
    if (!source.canAnimate) return;
    let event:Omit<Feedback,'key'>|undefined;
    const actor=(seat:number)=>seat===ownSeat ? "你" : members.find(m=>m.seat===seat)?.displayName || "牌友";
    if (game.settlement && next.settlementIdentity!==old.settlementIdentity) {
      const winner=game.settlement.winnerSeat;
      event={kind:"win",text:game.settlement.kind==="win" ? `${winner===undefined ? "" : `${actor(winner)} · `}和牌` : "流局",seat:winner};
    }
    if (!event) for(const p of next.players) {
      const before=old.players.find(o=>o.seat===p.seat);
      if (before && p.nuki>before.nuki) {event={kind:"nuki",text:`${actor(p.seat)} · 拔北`,seat:p.seat};break;}
      if (before && p.riichi && !before.riichi) {event={kind:"riichi",text:`${actor(p.seat)} · 立直`,seat:p.seat};break;}
    }
    if (!event) for(const p of next.players) {
      const before=old.players.find(o=>o.seat===p.seat);
      if (!before) continue;
      const meld=p.melds.find((m,i)=>m!==before.melds[i]);
      if (meld) {const digits=meld.replace(/\D/g,"");event={kind:"call",text:`${actor(p.seat)} · ${digits.length===4 ? "杠" : /^(\d)\1\1$/.test(digits.replace(/0/g,"5")) || meld[0]==="z" ? "碰" : "吃"}`,seat:p.seat};break;}
    }
    if (!event) for(const p of next.players) {
      const before=old.players.find(o=>o.seat===p.seat);
      if (!before) continue;
      if (p.discards.length>before.discards.length) {event={kind:"discard",text:`${actor(p.seat)} · ${tileName(p.discards.at(-1)!)}`,seat:p.seat};break;}
    }
    if (!event && game.turnSeat===ownSeat && game.drawnTile && ["zimo","gangzimo","nukizimo"].includes(game.phase)) {
      event={kind:"draw",text:game.phase==="zimo" ? "摸牌" : "补牌",seat:ownSeat};
    }
    if (!event) return;
    // Routine updates must not erase an important announcement or extend its
    // deadline. A newer special action still replaces the previous one at once.
    if (["draw","discard"].includes(event.kind) && activeKind.current && !["draw","discard"].includes(activeKind.current)) return;
    if (timer.current) clearTimeout(timer.current);
    activeKind.current=event.kind;
    setFeedback({...event,key:game.decisionId});
    timer.current=setTimeout(()=>{activeKind.current=null;setFeedback(null);timer.current=null;},900);
  },[game,roomId,ownSeat,members,source.connected,source.canAnimate]);
  useEffect(()=>()=>{if(timer.current) clearTimeout(timer.current);},[]);
  return feedback;
}
