"use client";
import {useEffect, useState, type CSSProperties} from "react";
import type {RoomMember, Settlement, SettlementFlow} from "@/modules/mahjong/types";
import {abortBaseAt} from "./settlement-presentation";

/** Public declarations stay tied to the viewer's native result clock and seats. */
export function MahjongAbortAnnouncements({settlement,flow,elapsed,members,ownSeat,capacity,reducedMotion}: {
  settlement: Settlement; flow?: SettlementFlow; elapsed: number; members: RoomMember[]; ownSeat: number; capacity: number; reducedMotion: boolean;
}) {
  const key=flow ? `${flow.id}:${flow.stage}:${flow.detailIndex}` : "";
  const [maximum,setMaximum]=useState({key,elapsed});
  const age=maximum.key===key ? Math.max(maximum.elapsed,elapsed) : elapsed;
  useEffect(()=>setMaximum({key,elapsed:age}),[key,age]);
  if (!flow || flow.stage!=="draw" || settlement.drawInfo?.kind!=="abort") return null;
  const metadata=settlement.drawInfo.abortPresentation;
  if (!metadata) return null;
  const declarations:{seat:number;type:"ron"|"riichi";start:number;end:number}[]=[];
  if (metadata.riichiSeat!==undefined) declarations.push({seat:metadata.riichiSeat,type:"riichi",start:300,end:1000});
  if (settlement.name==="三家和") for(const seat of metadata.ronSeats) declarations.push({seat,type:"ron",start:abortBaseAt(settlement)+300,end:abortBaseAt(settlement)+1200});
  return <div key={key} className={`mahjong-abort-announcements${reducedMotion?" is-reduced-motion":""}`} aria-label="流局前声明">
    {declarations.filter(d=>Number.isInteger(d.seat)&&d.seat>=0&&d.seat<capacity&&age>=d.start&&age<d.end).map(d=>{
      const relative=(d.seat-ownSeat+capacity)%capacity;
      const position=relative===0?"south":relative===1?"east":relative===3||capacity===3?"west":"north";
      const actor=d.seat===ownSeat?"你":members.find(m=>m.seat===d.seat)?.displayName||`座位 ${d.seat+1}`;
      return <div key={`${key}:${d.type}:${d.seat}`} className={`mahjong-abort-declaration is-${d.type} is-${position}`} role="status" aria-label={`${actor} · ${d.type==="ron"?"荣和":"立直"}`}
        {...(d.type==="ron"?{"data-abort-ron-seat":d.seat}:{"data-abort-riichi-seat":d.seat})}
        style={{"--abort-animation-age":`${-Math.min(200,age-d.start)}ms`} as CSSProperties}>
        <b aria-hidden="true">{d.type==="ron"?"荣":"立直"}</b><small aria-hidden="true" title={actor}>{actor}</small>
      </div>;
    })}
  </div>;
}
