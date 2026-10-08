"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type {Choice,RoomView} from '@/modules/mahjong/types';
import {automaticChoice,automaticOff,type AutomaticPreferences} from './automatic-choice';

export function useAutomaticPlay({room,ownSeat,connected,busy,onChoice}:{room:RoomView;ownSeat:number;connected:boolean;busy:boolean;onChoice:(choice:Choice)=>void}){
 const scope=JSON.stringify([room.id,ownSeat,room.game?.gameInstanceId]);
 const [state,setState]=useState({scope,options:{...automaticOff}});
 const options=state.scope===scope?state.options:automaticOff;
 const [visibleEpoch,setVisibleEpoch]=useState(0);
 const latest=useRef({room,connected,busy,onChoice});latest.current={room,connected,busy,onChoice};
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null), consumed=useRef<string|null>(null);
 const decision=JSON.stringify([scope,room.game?.decisionId]);
 const candidate=room.status==='playing'&&room.game?automaticChoice(room.game,options):null;
 const clear=useCallback(()=>{if(timer.current!==null)clearTimeout(timer.current);timer.current=null;},[]);
 const manual=useCallback(()=>{clear();consumed.current=decision;},[clear,decision]);
 const toggle=useCallback((key:keyof AutomaticPreferences)=>{
  clear();consumed.current=null;
  setState(old=>({scope,options:{...(old.scope===scope?old.options:automaticOff),[key]:!(old.scope===scope?old.options:automaticOff)[key]}}));
 },[scope,clear]);
 useEffect(()=>{
  const hidden=()=>{if(document.visibilityState==='hidden')clear();else setVisibleEpoch(n=>n+1);};
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',clear);
  return()=>{clear();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',clear);};
 },[clear]);
 useEffect(()=>{
  clear();
  if(!candidate||!connected||busy||document.visibilityState==='hidden'||consumed.current===decision)return;
  const id=candidate.id;
  timer.current=setTimeout(()=>{
   timer.current=null;const current=latest.current,g=current.room.game;
   if(!current.connected||current.busy||current.room.status!=='playing'||!g||document.visibilityState==='hidden'||JSON.stringify([JSON.stringify([current.room.id,ownSeat,g.gameInstanceId]),g.decisionId])!==decision||consumed.current===decision)return;
   const choice=automaticChoice(g,options);if(choice?.id!==id)return;
   consumed.current=decision;current.onChoice(choice);
  },candidate.type==='ron'||candidate.type==='tsumo'?800:0);
  return clear;
 },[candidate?.id,candidate?.type,decision,connected,busy,options,ownSeat,visibleEpoch,clear]);
 return {options,toggle,manual};
}
