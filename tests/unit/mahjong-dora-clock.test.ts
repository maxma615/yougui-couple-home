import {it, expect} from 'vitest';
import reference from '../fixtures/mahjong-dora-clock-reference.json';
import {advanceDoraSheen, createDoraSheenClock} from '@/components/mahjong/dora-sheen-clock';

it.each(reference.profiles)('matches isolated reference vectors at $name', profile => {
  let state = {offset: 0, speed: 0};
  for (let i = 0; i < profile.deltas.length; i++) {
    state = advanceDoraSheen(state, profile.deltas[i]);
    expect(state.offset).toBeCloseTo(profile.expected[i][0], 12);
    expect(state.speed).toBeCloseTo(profile.expected[i][1], 12);
  }
});

it.each([0, -1, NaN, Infinity])('ignores invalid clock deltas without mutating the state: %s', delta => {
  const state = Object.freeze({offset: -.5, speed: .4});
  expect(advanceDoraSheen(state, delta)).toBe(state);
});

function harness() {
  let visible = true, refresh = () => {}, listens = 0, removals = 0, id = 0;
  const frames = new Map<number, (timestamp: number) => void>(), paint: number[] = [];
  const clock = createDoraSheenClock({
    requestFrame: callback => { frames.set(++id, callback); return id; },
    cancelFrame: token => { frames.delete(token); },
    active: () => visible,
    paint: offset => { paint.push(offset); },
    listen: callback => { listens++; refresh = callback; return () => { removals++; }; },
  });
  const tick = (time: number) => {
    expect(frames.size).toBe(1);
    const [token, callback] = [...frames][0]; frames.delete(token); callback(time);
  };
  return {clock, frames, paint, tick, pause: () => { visible = false; refresh(); },
    resume: () => { visible = true; refresh(); }, counts: () => ({listens, removals})};
}

it('shares one scheduler and one phase with late subscribers and overlapping consumers', () => {
  const h = harness(), disposeA = h.clock.subscribe();
  h.tick(1000); h.tick(1016); h.tick(1049);
  const phase = h.clock.snapshot(), disposeB = h.clock.subscribe();
  expect(h.frames.size).toBe(1); expect(h.clock.snapshot().elapsed).toBe(phase.elapsed);
  expect(h.paint.at(-1)).toBe(phase.offset); expect(h.counts()).toEqual({listens: 1, removals: 0});
  disposeA(); disposeA(); expect(h.frames.size).toBe(1);
  h.tick(1082); expect(h.clock.snapshot().elapsed).toBe(82);
  disposeB(); expect(h.frames.size).toBe(0); expect(h.clock.snapshot().subscribers).toBe(0);
  expect(h.counts()).toEqual({listens: 1, removals: 1});
});

it('pauses offscreen or for reduced motion and resumes without simulating the hidden interval', () => {
  const h = harness(), dispose = h.clock.subscribe(); h.tick(10); h.tick(26);
  const before = h.clock.snapshot(); h.pause(); expect(h.frames.size).toBe(0);
  h.resume(); h.tick(10000); expect(h.clock.snapshot().offset).toBe(before.offset);
  expect(h.clock.snapshot().elapsed).toBe(before.elapsed);
  h.tick(10016); expect(h.clock.snapshot().elapsed).toBe(before.elapsed + 16);
  dispose(); expect(h.frames.size).toBe(0);
});

it('does not create frames while inactive and retains the shared phase across unmount and remount', () => {
  const h = harness(); h.pause(); const dispose = h.clock.subscribe(); expect(h.frames.size).toBe(0);
  h.resume(); h.tick(1); h.tick(101); const before = h.clock.snapshot(); dispose();
  const next = h.clock.subscribe(); h.tick(5000); expect(h.clock.snapshot().offset).toBe(before.offset);
  expect(h.clock.snapshot().elapsed).toBe(before.elapsed); next();
});
