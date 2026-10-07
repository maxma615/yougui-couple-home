// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDrawArrival } from '@/components/mahjong/use-draw-arrival';
import type { GameView } from '@/modules/mahjong/types';
const game = {
  gameInstanceId: 'g',
  handId: 1,
  decisionId: 'a',
  phase: 'zimo',
  turnSeat: 0,
  drawnTile: 'z4',
  settlement: null
} as GameView;
const next = {
  ...game,
  decisionId: 'b',
  phase: 'nukizimo',
  drawnTile: 's4'
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('inputReleasesHeldReplacement', () => {
  vi.useFakeTimers();
  const {
    result,
    rerender
  } = renderHook(({
    g,
    hold
  }: {
    g: GameView;
    hold: string | null;
  }) => useDrawArrival(g, 'r', 0, {
    connected: true,
    canAnimate: true,
    heldDecisionId: hold
  }), {
    initialProps: {
      g: game,
      hold: null as string | null
    }
  });
  rerender({
    g: next,
    hold: 'b'
  });
  expect(result.current.arriving).toBe(false);
  act(() => vi.advanceTimersByTime(300));
  expect(result.current.arriving).toBe(false);
  rerender({
    g: next,
    hold: null
  });
  expect(result.current.arriving).toBe(true);
  act(() => vi.advanceTimersByTime(220));
  expect(result.current.arriving).toBe(false);
  rerender({
    g: next,
    hold: null
  });
  expect(result.current.arriving).toBe(false);
});
it('cancel discards pending entrance', () => {
  const {
    result,
    rerender
  } = renderHook(({
    g,
    hold
  }: {
    g: GameView;
    hold: string | null;
  }) => useDrawArrival(g, 'r', 0, {
    connected: true,
    canAnimate: true,
    heldDecisionId: hold
  }), {
    initialProps: {
      g: game,
      hold: null as string | null
    }
  });
  rerender({
    g: next,
    hold: 'b'
  });
  act(() => result.current.cancel());
  rerender({
    g: next,
    hold: null
  });
  expect(result.current.arriving).toBe(false);
});
it('same decision quiet GET preserves held entrance but a new quiet decision baselines it', () => {
  vi.useFakeTimers();
  const {
    result,
    rerender
  } = renderHook(({
    g,
    hold,
    live
  }: {
    g: GameView;
    hold: string | null;
    live: boolean;
  }) => useDrawArrival(g, 'r', 0, {
    connected: true,
    canAnimate: live,
    heldDecisionId: hold
  }), {
    initialProps: {
      g: game,
      hold: null as string | null,
      live: true
    }
  });
  rerender({
    g: next,
    hold: 'b',
    live: true
  });
  rerender({
    g: next,
    hold: 'b',
    live: false
  });
  expect(result.current.arriving).toBe(false);
  rerender({
    g: next,
    hold: null,
    live: false
  });
  expect(result.current.arriving).toBe(true);
  act(() => vi.advanceTimersByTime(220));
  expect(result.current.arriving).toBe(false);
  rerender({
    g: {
      ...next,
      decisionId: 'c'
    },
    hold: null,
    live: false
  });
  expect(result.current.arriving).toBe(false);
  rerender({
    g: {
      ...next,
      decisionId: 'c'
    },
    hold: null,
    live: true
  });
  expect(result.current.arriving).toBe(false);
});
