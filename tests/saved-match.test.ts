import { describe, expect, it } from 'vitest';
import { createHand } from '../src/engine/game';
import { looksWhole } from '../src/client/match';
import type { GameState, Meld } from '../src/engine/types';

function save(overrides: { game?: (g: GameState) => void } = {}) {
  const game = createHand({ seed: 5, dealer: 0 });
  overrides.game?.(game);
  return {
    v: 1,
    savedAt: Date.now(),
    target: 2 as const,
    handNo: 1,
    dealer: 0,
    handWins: [0, 0, 0, 0],
    seats: [0, 1, 2, 3].map((i) => ({ name: `Cat ${i}`, cat: {}, personality: {}, tag: 'bot' })),
    game,
    mySeat: 0,
    myOrder: game.seats[0].hand.slice(),
    keep: [],
    matchOver: false,
    lastWinSeat: null,
    resultOpen: false,
  };
}

describe('a saved match is only resumed when it is whole', () => {
  it('accepts a fresh deal', () => {
    expect(looksWhole(save())).toBe(true);
  });

  // JSON.stringify turns an undefined slot into null: this is what a hole in a
  // hand looks like on the way back in, and it used to be resumed
  it('drops a hand with a hole', () => {
    const s = save({ game: (g) => { (g.seats[1].hand as unknown[])[3] = null; } });
    expect(looksWhole(s)).toBe(false);
  });

  it('drops a hand holding something that is not a tile', () => {
    const s = save({ game: (g) => { (g.seats[2].hand as unknown[])[0] = '2-dot'; } });
    expect(looksWhole(s)).toBe(false);
  });

  it('drops a rack that cannot exist', () => {
    const short = save({ game: (g) => { g.seats[1].hand = g.seats[1].hand.slice(0, 11); } });
    expect(looksWhole(short)).toBe(false);
    const long = save({ game: (g) => { g.seats[1].hand = [...g.seats[1].hand, 0, 1]; } });
    expect(looksWhole(long)).toBe(false);
  });

  it('drops a meld that is not three or four tiles', () => {
    const twoTiles = save({
      game: (g) => {
        g.seats[1].melds = [{ type: 'pung', k: 0, concealed: false, from: 0, tiles: [0, 0] } as Meld];
        g.seats[1].hand = g.seats[1].hand.slice(0, 10);
      },
    });
    expect(looksWhole(twoTiles)).toBe(false);
    const kongOfThree = save({
      game: (g) => {
        g.seats[1].melds = [{ type: 'kong', k: 0, concealed: true, from: null, tiles: [0, 0, 0] } as Meld];
        g.seats[1].hand = g.seats[1].hand.slice(0, 10);
      },
    });
    expect(looksWhole(kongOfThree)).toBe(false);
  });

  it('accepts a real called hand', () => {
    const s = save({
      game: (g) => {
        g.seats[1].melds = [{ type: 'pung', k: 4, concealed: false, from: 0, tiles: [4, 4, 4] } as Meld];
        g.seats[1].hand = [0, 1, 2, 9, 10, 11, 18, 19, 20, 27];
      },
    });
    expect(looksWhole(s)).toBe(true);
  });

  it('drops a wall or a pending tile that is not a tile', () => {
    expect(looksWhole(save({ game: (g) => { (g.wall as unknown[])[0] = null; } }))).toBe(false);
    expect(looksWhole(save({ game: (g) => { g.lastDrawn = undefined as unknown as number; } }))).toBe(true);
    expect(looksWhole(save({ game: (g) => { g.lastDrawn = 99; } }))).toBe(false);
  });
});
