// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useNukiMotion } from '@/components/mahjong/use-nuki-motion';
import { DiscardFlightLayer } from '@/components/mahjong/use-discard-motion';
import { useDrawArrival } from '@/components/mahjong/use-draw-arrival';
import { useHandReflow } from '@/components/mahjong/use-hand-reflow';
import type { RoomView } from '@/modules/mahjong/types';
let reduced = false;
let sourceOffset = 0;
const media = new Set<() => void>();
const animations: any[] = [];
const initialNorthStyles = new Map<string, string>();
const source = {
  id: 'r',
  code: 'ABCDEFGH',
  hostUserId: 'u0',
  variant: 'sanma',
  mode: 'east',
  status: 'playing',
  version: 1,
  mySeat: 0,
  members: [],
  game: {
    gameInstanceId: 'g',
    handId: 1,
    decisionId: 'a',
    phase: 'zimo',
    turnSeat: 0,
    roundWind: 0,
    roundNumber: 1,
    honba: 0,
    riichiSticks: 0,
    remainingTiles: 20,
    doraIndicators: [],
    hand: ['p0', 'p5', 'z4', 'p5'],
    drawnTile: 'p5',
    players: [{
      seat: 0,
      nuki: 0,
      discards: [],
      melds: []
    }, {
      seat: 1,
      nuki: 0,
      discards: [],
      melds: []
    }, {
      seat: 2,
      nuki: 0,
      discards: [],
      melds: []
    }],
    choices: [],
    settlement: null,
    ranking: null
  }
} as unknown as RoomView;
const accepted = {
  ...source,
  version: 2,
  game: {
    ...source.game!,
    decisionId: 'b',
    phase: 'nukizimo',
    hand: ['p0', 'p5', 'p5', 's4'],
    drawnTile: 's4',
    players: source.game!.players.map(p => ({
      ...p,
      nuki: p.seat === 0 ? 1 : 0
    }))
  }
};
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, l: () => void) => media.add(l),
    removeEventListener: (_: string, l: () => void) => media.delete(l)
  }));
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const id = this.dataset.handInstanceId || '';
    const x = (id.startsWith('drawn:') ? 500 : id ? Number(id.split(':')[1]) * 50 : 20) + (id ? sourceOffset : 0);
    return {
      x,
      y: 100,
      left: x,
      top: 100,
      width: 40,
      height: 60,
      right: x + 40,
      bottom: 160,
      toJSON: () => ({})
    } as DOMRect;
  });
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: function (this: HTMLElement, frames: any, options: any) {
      const a = {
        id: '',
        onfinish: null,
        cancel: vi.fn()
      };
      animations.push({
        target: this,
        frames,
        options,
        a
      });
      return a;
    }
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (Element.prototype as any).animate;
  animations.length = 0;
  initialNorthStyles.clear();
  reduced = false;
  sourceOffset = 0;
  media.clear();
});
function Harness({
  room,
  connected = true,
  canAnimate = true,
  importantNorthStyles = false
}: {
  room: RoomView;
  connected?: boolean;
  canAnimate?: boolean;
  importantNorthStyles?: boolean;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  const nukiRefs = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const nukiRef = (key: string) => {
    let callback = nukiRefs.current.get(key);
    if (!callback) {
      callback = element => {
        if (!element || !importantNorthStyles) return;
        element.style.setProperty('visibility', 'visible', 'important');
        initialNorthStyles.set(key, element.getAttribute('style') || '');
      };
      nukiRefs.current.set(key, callback);
    }
    return callback;
  };
  const motion = useNukiMotion({
    room,
    ownSeat: room.mySeat,
    connected,
    canAnimate,
    tableRef
  });
  const draw = useDrawArrival(room.game, room.id, room.mySeat, {
    connected,
    canAnimate,
    heldDecisionId: motion.heldDecisionId
  });
  const reflow = useHandReflow({
    room,
    ownSeat: room.mySeat,
    connected,
    canAnimate,
    intent: null,
    tableRef
  });
  const g = room.game!,
    hand = g.hand.slice(0, -1);
  return <div ref={tableRef}><div className="mahjong-hand">{hand.map((f, i) => <button key={`hand:${i}:${f}`} data-hand-instance-id={`hand:${i}:${f}`} data-tile-face={f} />)}<button data-hand-instance-id={`drawn:${g.decisionId}:${g.drawnTile}`} data-tile-face={g.drawnTile} data-testid="draw" data-arriving={draw.arriving} data-held={motion.heldDecisionId} /></div><div data-nuki-seat="0">{Array.from({
        length: g.players[0].nuki || 0
      }, (_, i) => <span key={i} data-nuki-index={i}><span data-testid={`north-volume-${i}`} data-nuki-volume style={{width:'40px',height:'60px'}} ref={nukiRef(`volume-${i}`)}><span data-flight-base/><span data-flight-cap><span className="mahjong-tile" data-testid={`north-${i}`} data-tile-face="z4" style={importantNorthStyles ? {outline:'2px solid rgb(10, 20, 30)'} : undefined} ref={nukiRef(`cap-${i}`)}/></span><span data-flight-contact/>{(['top','left','right','bottom'] as const).map(side=><span key={side} data-flight-side={side}/>)}</span></span>)}</div><button onClick={() => {
      draw.cancel();
      motion.cancel();
      reflow.cancel();
    }}>input</button>{motion.flight ? <DiscardFlightLayer kind="nuki" flight={motion.flight} onFinish={motion.finishFlight} /> : null}</div>;
}
function start() {
  const v = render(<Harness room={source} />);
  v.rerender(<Harness room={accepted} />);
  return v;
}
it('acceptedNorthRestoresTray', () => {
  const v = start();
  expect(screen.getByTestId('mahjong-nuki-flight')).toBeTruthy();
  expect(screen.getByTestId('north-0').style.visibility).toBe('hidden');
  expect(screen.getByTestId('draw').dataset.held).toBe('b');
  expect(animations.filter(r => r.a.id.startsWith('mahjong-hand-reflow:'))).toHaveLength(1);
  act(() => animations.find(r => r.options.duration === 230).a.onfinish());
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
  expect(screen.getByTestId('north-0').style.visibility).toBe('');
  expect(screen.getByTestId('draw').dataset.arriving).toBe('true');
  v.unmount();
  expect(animations.every(r => r.a.cancel.mock.calls.length > 0)).toBe(true);
});
it('keeps a face-up six-plane volume in the North flight and grows sides to measured tray depth', () => {
  const v = start();
  const flight = screen.getByTestId('mahjong-nuki-flight');
  expect(flight.querySelector('[data-flight-volume]')).not.toBeNull();
  expect([...flight.querySelectorAll<HTMLElement>('[data-flight-side]')].map(side=>side.dataset.flightSide).sort())
    .toEqual(['bottom','left','right','top']);
  expect(flight.querySelector('[data-flight-base]')).not.toBeNull();
  expect(flight.querySelector('[data-flight-contact]')).not.toBeNull();
  expect(flight.querySelector('[data-tile-face="z4"]')).not.toBeNull();
  const sideAnimations = animations.filter(record => (record.target as HTMLElement).dataset.flightSide);
  expect(sideAnimations).toHaveLength(4);
  expect(sideAnimations.every(record=>Object.values(record.frames.at(-1)).includes('24px'))).toBe(true);
  v.unmount();
});
it('hides and restores the whole North volume and cap visibility with their exact priorities', () => {
  const v = render(<Harness room={source} importantNorthStyles/>);
  v.rerender(<Harness room={accepted} importantNorthStyles/>);
  const volume = screen.getByTestId('north-volume-0');
  const cap = screen.getByTestId('north-0');
  const volumeStyle = initialNorthStyles.get('volume-0');
  const capStyle = initialNorthStyles.get('cap-0');
  expect([volume.style.getPropertyValue('visibility'),volume.style.getPropertyPriority('visibility')]).toEqual(['hidden','important']);
  expect([cap.style.getPropertyValue('visibility'),cap.style.getPropertyPriority('visibility')]).toEqual(['hidden','important']);
  expect(cap.style.getPropertyValue('outline')).toBe('2px solid rgb(10, 20, 30)');
  fireEvent.click(screen.getByText('input'));
  expect([volume.style.getPropertyValue('visibility'),volume.style.getPropertyPriority('visibility')]).toEqual(['visible','important']);
  expect([cap.style.getPropertyValue('visibility'),cap.style.getPropertyPriority('visibility')]).toEqual(['visible','important']);
  expect(volume.getAttribute('style')).toBe(volumeStyle);
  expect(cap.getAttribute('style')).toBe(capStyle);
  v.unmount();
});
it('restores both visible North cap and volume byte-for-byte when unmounted mid-flight', () => {
  const v = render(<Harness room={source} importantNorthStyles/>);
  v.rerender(<Harness room={accepted} importantNorthStyles/>);
  const volume = screen.getByTestId('north-volume-0');
  const cap = screen.getByTestId('north-0');
  const volumeStyle = initialNorthStyles.get('volume-0');
  const capStyle = initialNorthStyles.get('cap-0');
  expect(screen.getByTestId('mahjong-nuki-flight')).toBeTruthy();
  expect(volume.style.visibility).toBe('hidden');
  expect(cap.style.visibility).toBe('hidden');
  v.unmount();
  expect(volume.getAttribute('style')).toBe(volumeStyle);
  expect(cap.getAttribute('style')).toBe(capStyle);
});
it('quietUpdateDoesNotReplay', () => {
  const v = start(),
    initial = animations.length;
  v.rerender(<Harness room={{
    ...accepted,
    version: 3
  }} />);
  expect(animations.length).toBe(initial);
  expect(screen.getByTestId('north-0').style.visibility).toBe('hidden');
  expect(animations.every(r => r.a.cancel.mock.calls.length === 0)).toBe(true);
});
it('inputReleasesHeldReplacement', () => {
  start();
  fireEvent.click(screen.getByText('input'));
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
  expect(screen.getByTestId('north-0').style.visibility).toBe('');
  expect(screen.getByTestId('draw').dataset.held).toBeUndefined();
  expect(screen.getByTestId('draw').dataset.arriving).toBe('false');
  expect(animations.every(r => r.a.cancel.mock.calls.length > 0)).toBe(true);
});
it('robWindowIsNotExtraction', () => {
  const v = render(<Harness room={source} />);
  const reaction = {
    ...source,
    version: 2,
    game: {
      ...source.game!,
      decisionId: 'reaction',
      phase: 'nuki'
    }
  };
  v.rerender(<Harness room={reaction} />);
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
  v.rerender(<Harness room={{
    ...accepted,
    version: 3
  }} />);
  expect(screen.getByTestId('mahjong-nuki-flight')).toBeTruthy();
});
it.each(['resize', 'orientationchange', 'fullscreenchange', 'webkitfullscreenchange', 'visibilitychange', 'motion', 'disconnect', 'scope', 'nextDecision'])('cancels and restores on %s', kind => {
  const v = start();
  if (kind === 'motion') {
    reduced = true;
    act(() => media.forEach(l => l()));
  } else if (kind === 'disconnect') v.rerender(<Harness room={accepted} connected={false} />);else if (kind === 'scope') v.rerender(<Harness room={{
    ...accepted,
    id: 'other'
  }} />);else if (kind === 'nextDecision') v.rerender(<Harness room={{
    ...accepted,
    game: {
      ...accepted.game,
      decisionId: 'c',
      phase: 'dapai'
    }
  }} />);else if (kind === 'quietGET') v.rerender(<Harness room={accepted} canAnimate={false} />);else fireEvent(kind === 'visibilitychange' ? document : window, new Event(kind));
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
  expect(screen.getByTestId('north-0').style.visibility).toBe('');
  expect(screen.getByTestId('draw').dataset.arriving).toBe('false');
});
it('baselines mount, reconnect, reduced motion and skipped versions', () => {
  const v = render(<Harness room={accepted} />);
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
  v.rerender(<Harness room={source} connected={false} />);
  v.rerender(<Harness room={accepted} />);
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
  v.rerender(<Harness room={source} />);
  reduced = true;
  v.rerender(<Harness room={accepted} />);
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
  reduced = false;
  v.rerender(<Harness room={source} />);
  v.rerender(<Harness room={{
    ...accepted,
    version: 4
  }} />);
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
});
it('opponent and ambiguous own North emphasize only the indexed real target', () => {
  const dup = {
    ...source,
    game: {
      ...source.game!,
      hand: ['p0', 'p5', 'z4', 'z4'],
      drawnTile: 'z4'
    }
  };
  const after = {
    ...accepted,
    game: {
      ...accepted.game,
      hand: ['p0', 'p5', 'z4', 's4']
    }
  };
  const v = render(<Harness room={dup} />);
  v.rerender(<Harness room={after} />);
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
  expect(animations.find(r => r.a.id.startsWith('mahjong-nuki-arrival:'))?.target).toBe(screen.getByTestId('north-0'));
  act(() => animations.find(r => r.a.id.startsWith('mahjong-nuki-arrival:')).a.onfinish());
  expect(screen.getByTestId('draw').dataset.arriving).toBe('true');
  v.rerender(<Harness room={{
    ...source,
    mySeat: 1
  }} />);
  v.rerender(<Harness room={{
    ...accepted,
    mySeat: 1
  }} />);
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
});
it('preserves flight across a quiet GET of the same decision', () => {
  const v = start(),
    initial = animations.length;
  v.rerender(<Harness room={{
    ...accepted,
    version: 3
  }} canAnimate={false} />);
  expect(screen.getByTestId('mahjong-nuki-flight')).toBeTruthy();
  expect(animations.length).toBe(initial);
  expect(screen.getByTestId('north-0').style.visibility).toBe('hidden');
});

it('environment invalidation emphasizes target until geometry has been recaptured', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const view = render(<Harness room={source}/>);
  sourceOffset = 300;
  fireEvent(window, new Event('resize'));
  view.rerender(<Harness room={accepted}/>);
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
  expect(animations.some(record => record.a.id.startsWith('mahjong-nuki-arrival:'))).toBe(true);
  act(() => frames.forEach(callback => callback(16)));
  expect(screen.queryByTestId('mahjong-nuki-flight')).toBeNull();
});
it.each(['resize', 'orientationchange', 'fullscreenchange', 'webkitfullscreenchange'])('recaptures source after %s without changing room state', event => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const view = render(<Harness room={source}/>);
  sourceOffset = 300;
  fireEvent(window, new Event(event));
  act(() => frames.forEach(callback => callback(16)));
  view.rerender(<Harness room={accepted}/>);
  expect(screen.getByTestId('mahjong-nuki-flight').style.left).toBe('420px');
});
it('input cancellation retains the eligible source baseline', () => {
  const view = render(<Harness room={source}/>);
  fireEvent.click(screen.getByText('input'));
  view.rerender(<Harness room={accepted}/>);
  expect(screen.getByTestId('mahjong-nuki-flight').style.left).toBe('120px');
});
