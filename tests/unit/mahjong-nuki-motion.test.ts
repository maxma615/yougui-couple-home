import { expect, it } from 'vitest';
import { acceptedNukiEvent, uniqueOwnNorthInstance } from '@/components/mahjong/nuki-motion';
import type { RoomView } from '@/modules/mahjong/types';
const before = {
  id: 'r',
  version: 1,
  status: 'playing',
  mySeat: 0,
  variant: 'sanma',
  game: {
    gameInstanceId: 'g',
    handId: 1,
    decisionId: 'a',
    phase: 'nuki',
    turnSeat: 0,
    settlement: null,
    hand: ['p0', 'z4'],
    drawnTile: 'p0',
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
    }]
  }
} as unknown as RoomView;
const next = () => ({
  ...before,
  version: 2,
  game: {
    ...before.game!,
    decisionId: 'b',
    phase: 'nukizimo',
    hand: ['p0', 's4'],
    drawnTile: 's4',
    players: before.game!.players.map(p => ({
      ...p,
      nuki: p.seat === 0 ? 1 : 0
    }))
  }
});
it('acceptsOnlyConsecutivePublicNuki', () => {
  const after = next();
  expect(acceptedNukiEvent(before, after)).toEqual({
    seat: 0,
    index: 0,
    id: 'nuki:r:g:1:0:0'
  });
  expect(acceptedNukiEvent(null, after)).toBeNull();
  for (const bad of [{
    ...after,
    version: 3
  }, {
    ...after,
    id: 'other'
  }, {
    ...after,
    mySeat: 1
  }, {
    ...after,
    status: 'finished'
  }, {
    ...after,
    game: {
      ...after.game,
      gameInstanceId: undefined
    }
  }, {
    ...after,
    game: {
      ...after.game,
      handId: 2
    }
  }, {
    ...after,
    game: {
      ...after.game,
      decisionId: 'a'
    }
  }, {
    ...after,
    game: {
      ...after.game,
      settlement: {}
    }
  }, {
    ...after,
    game: {
      ...after.game,
      players: after.game.players.map(p => ({
        ...p,
        nuki: 2
      }))
    }
  }, {
    ...after,
    game: {
      ...after.game,
      players: after.game.players.map(p => ({
        ...p,
        discards: ['p2']
      }))
    }
  }, {
    ...after,
    game: {
      ...after.game,
      players: after.game.players.map(p => ({
        ...p,
        melds: ['p111+']
      }))
    }
  }, {
    ...after,
    game: {
      ...after.game,
      hand: ['p5', 's4']
    }
  }]) expect(acceptedNukiEvent(before, bad as RoomView)).toBeNull();
  expect(acceptedNukiEvent(after, {
    ...after,
    version: 3
  })).toBeNull();
});
it('uniqueNorthDoesNotGuessDuplicates', () => {
  const t = (id: string, face: string) => ({
    instanceId: id,
    face,
    rect: {
      x: 0,
      y: 0,
      width: 20,
      height: 30
    }
  });
  expect(uniqueOwnNorthInstance([t('a', 'p0'), t('b', 'z4')])).toBe('b');
  expect(uniqueOwnNorthInstance([t('a', 'z4'), t('b', 'z4')])).toBeNull();
  expect(uniqueOwnNorthInstance([t('a', 'p0')])).toBeNull();
});
