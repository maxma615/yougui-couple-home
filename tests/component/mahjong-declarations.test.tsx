// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MahjongDeclarations} from '@/components/mahjong/mahjong-declarations';
import {GameRoom} from '@/components/mahjong/mahjong-client';
import {declarationPair,declarationChoose,declarationRoom} from '../fixtures/mahjong-declaration-game';

afterEach(()=>{cleanup();vi.useRealTimers();});
describe('native desk declarations',()=>{
 it('keeps the first winner panel behind the declaration intro on the actual GameRoom',()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  const {before,after}=declarationPair('yonma','ron');
  const props={room:before,connected:true,ownSeat:0,host:false,busy:false,onChoice:()=>{},onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}};
  const v=render(<GameRoom {...props}/>);v.rerender(<GameRoom {...props} room={after}/>);
  expect(v.container.querySelector('.mahjong-settlement-panel')).toBeNull();
  act(()=>vi.advanceTimersByTime(300));expect(v.container.querySelectorAll('[data-declaration-event]')).toHaveLength(2);
  expect(v.container.querySelector('.mahjong-call-announcement.is-win')).toBeNull();
  act(()=>vi.advanceTimersByTime(900));expect(v.container.querySelectorAll('[data-declaration-event]')).toHaveLength(0);
  expect(v.container.querySelector('.mahjong-settlement-panel')).not.toBeNull();
 });
 it('shows both ron winners together at 300ms, expires at 1200ms, never replays a detail ACK',()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  const {before,after,game}=declarationPair('yonma','ron');
  const props={room:before,connected:true,canAnimate:true,ownSeat:0};
  const v=render(<MahjongDeclarations {...props}/>);
  v.rerender(<MahjongDeclarations {...props} room={after}/>);
  expect(v.container.querySelectorAll('[data-declaration-event]')).toHaveLength(0);
  act(()=>vi.advanceTimersByTime(300));
  expect([...v.container.querySelectorAll('[data-declaration-event]')].map(n=>n.getAttribute('data-declaration-seat'))).toEqual(['1','2']);
  act(()=>vi.advanceTimersByTime(900));expect(v.container.querySelectorAll('[data-declaration-event]')).toHaveLength(0);
  declarationChoose(game,0,'ack');v.rerender(<MahjongDeclarations {...props} room={declarationRoom(game,'yonma',12)}/>);
  act(()=>vi.advanceTimersByTime(300));expect(v.container.querySelectorAll('[data-declaration-event]')).toHaveLength(0);
 });
 it.each(['offline','get','scope'] as const)('cancels pending announcements on %s without reconnect catch-up',reason=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  const {before,after}=declarationPair('sanma','tsumo');
  const props={room:before,connected:true,canAnimate:true,ownSeat:0},v=render(<MahjongDeclarations {...props}/>);
  v.rerender(<MahjongDeclarations {...props} room={after}/>);
  const changed=structuredClone(after);if(reason==='scope')changed.id='another';
  v.rerender(<MahjongDeclarations {...props} room={changed} connected={reason!=='offline'} canAnimate={reason!=='get'}/>);
  act(()=>vi.advanceTimersByTime(400));expect(v.container.querySelectorAll('[data-declaration-event]')).toHaveLength(0);
  v.rerender(<MahjongDeclarations {...props} room={changed}/>);
  act(()=>vi.advanceTimersByTime(400));expect(v.container.querySelectorAll('[data-declaration-event]')).toHaveLength(0);
 });
 it('silences an initial result mount and places a live riichi at the acting seat',()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  const {before,after}=declarationPair('sanma','riichi');
  const v=render(<MahjongDeclarations room={after} connected canAnimate ownSeat={1}/>);
  act(()=>vi.advanceTimersByTime(400));expect(v.container.querySelectorAll('[data-declaration-event]')).toHaveLength(0);
  v.unmount();const live=render(<MahjongDeclarations room={before} connected canAnimate ownSeat={1}/>);
  live.rerender(<MahjongDeclarations room={after} connected canAnimate ownSeat={1}/>);
  act(()=>vi.advanceTimersByTime(300));const node=live.container.querySelector('[data-declaration-event]');
  expect(node?.classList.contains('is-west')).toBe(true);expect(node?.getAttribute('aria-label')).toBe('玩家1 · 立直');
  act(()=>vi.advanceTimersByTime(700));expect(live.container.querySelectorAll('[data-declaration-event]')).toHaveLength(0);
 });
});
