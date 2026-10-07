// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render} from '@testing-library/react';
import {GameRoom} from '@/components/mahjong/mahjong-client';
import {northReplacementFixture} from '../fixtures/mahjong-view-game';
import type {Choice, RoomView} from '@/modules/mahjong/types';
afterEach(cleanup);
const cases: [Choice['type'], string, number, number][] = [
  ['chi','p340-',3,0], ['pon','p550+',3,0], ['kan','p5550+',4,0],
  ['kan','p5550',2,2], ['kan','p555+0',4,0],
];
function setup(choices: Choice[], options = {busy:false, connected:true}) {
  const game = northReplacementFixture().view(0);
  game.choices = choices;
  const room: RoomView = {id:'call-preview',code:'ABCDEFGH',hostUserId:'u0',variant:'sanma',mode:'east',status:'playing',version:1,mySeat:0,game,members:[0,1,2].map(seat=>({seat,userId:`u${seat}`,displayName:`玩家${seat}`,kind:'human',ready:true,connected:true}))};
  const onChoice=vi.fn();
  const props={room,ownSeat:0,host:true,...options,onChoice,onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}};
  return {...render(<GameRoom {...props}/>),onChoice,props};
}
it.each(cases)('shows exact full %s %s combination in its contextual button', (type,value,faces,backs)=>{
  const choice={type,value,id:`${type}:${value}`};
  const {container,onChoice}=setup([choice]);
  const button=container.querySelector<HTMLButtonElement>(`button[data-choice-id="${choice.id}"]`)!;
  expect(button.querySelectorAll('[data-tile-face]')).toHaveLength(faces);
  expect(button.querySelectorAll('.mahjong-meld__back')).toHaveLength(backs);
  expect(button.querySelectorAll('[data-tile-face="p0"]')).toHaveLength(1);
  if(value==='p555+0') expect(button.querySelector('[data-layer="added"] [data-tile-face="p0"]')).not.toBeNull();
  else if(type!=='kan'||backs===0) expect(button.querySelector('[data-called]')).not.toBeNull();
  fireEvent.click(button);
  expect(onChoice).toHaveBeenCalledExactlyOnceWith(choice);
});
it('preserves both red and ordinary IDs in the entry and each dialog option',()=>{
  const choices:Choice[]=[{id:'pon:p555+',type:'pon',value:'p555+'},{id:'pon:p505+',type:'pon',value:'p505+'}];
  const {container,onChoice}=setup(choices);
  const entry=container.querySelector<HTMLButtonElement>('.mahjong-action-dock [data-choice-type="pon"]')!;
  expect(entry.querySelectorAll('[data-tile-face]')).toHaveLength(6);
  fireEvent.click(entry); expect(onChoice).not.toHaveBeenCalled();
  const options=container.querySelectorAll<HTMLButtonElement>('dialog [data-choice-id]');
  expect([...options].map(b=>b.dataset.choiceId)).toEqual(choices.map(c=>c.id));
  expect(options[1].querySelectorAll('[data-tile-face="p0"]')).toHaveLength(1);
  expect(options[1].getAttribute('aria-label')).toContain('赤');
  fireEvent.click(options[1]); expect(onChoice).toHaveBeenCalledExactlyOnceWith(choices[1]);
});
it.each([{busy:true,connected:true},{busy:false,connected:false}])('does not submit unavailable choices %j',options=>{
  const choice:Choice={id:'pon:p550+',type:'pon',value:'p550+'};
  const {container,onChoice}=setup([choice],options);
  const button=container.querySelector<HTMLButtonElement>('[data-choice-id="pon:p550+"]')!;
  expect(button.disabled).toBe(true); fireEvent.click(button); expect(onChoice).not.toHaveBeenCalled();
});
it('removes a pending dialog when the decision changes',()=>{
  const choices:Choice[]=[{id:'pon:p555+',type:'pon',value:'p555+'},{id:'pon:p505+',type:'pon',value:'p505+'}];
  const {container,props,rerender,onChoice}=setup(choices);
  fireEvent.click(container.querySelector('.mahjong-action-dock [data-choice-type="pon"]')!);
  expect(container.querySelector('dialog')).not.toBeNull();
  rerender(<GameRoom {...props} room={{...props.room,game:{...props.room.game!,decisionId:'next',choices:[]}}}/>);
  expect(container.querySelector('dialog')).toBeNull(); expect(onChoice).not.toHaveBeenCalled();
});
