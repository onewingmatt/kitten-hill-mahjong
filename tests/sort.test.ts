import { describe, expect, it } from 'vitest';
import { sortHand, sortSmart } from '../src/client/sort';
import { decompose } from '../src/engine/shape';

/** dots 1-9 = 0..8, bamboo 1-9 = 9..17, chars 1-9 = 18..26, east..north = 27..30, dragons = 31..33 */
const d = (n: number) => n - 1;
const b = (n: number) => 8 + n;
const c = (n: number) => 17 + n;
const E = 27, S = 28, W = 29, N = 30, RED = 31, GREEN = 32, WHITE = 33;

describe('smart sort', () => {
  it('keeps every tile: it is a sort, not a filter', () => {
    const hand = [d(1), d(1), d(4), d(5), b(2), b(3), b(3), c(7), E, E, E, RED, GREEN];
    const out = sortSmart(hand);
    expect(out).toHaveLength(hand.length);
    expect([...out].sort((x, y) => x - y)).toEqual([...hand].sort((x, y) => x - y));
  });

  it('puts the suits in order: dots, bamboo, characters, then honours', () => {
    const out = sortSmart([RED, c(1), b(1), d(1), E]);
    expect(out).toEqual([d(1), b(1), c(1), E, RED]);
  });

  it('finishes a suit before starting the next one', () => {
    // a bamboo pung would lead a completeness-major sort; the suit order wins
    const out = sortSmart([b(1), b(1), b(1), d(9)]);
    expect(out).toEqual([d(9), b(1), b(1), b(1)]);
  });

  it('puts finished groups before the pair, and the pair before the near-misses', () => {
    const out = sortSmart([d(3), d(4), d(5), d(7), d(7), d(1), d(2)]);
    // decompose claims the lowest run first, so 1-2-3 is complete and 4-5 is the
    // near-miss that follows the pair. Deterministic, and the same reading the
    // ready tracker uses — the rack must not disagree with it.
    expect(out).toEqual([d(1), d(2), d(3), d(7), d(7), d(4), d(5)]);
  });

  it('reads a run and a pung of the same suit as one numeric sequence', () => {
    const out = sortSmart([d(7), d(7), d(7), d(1), d(2), d(3)]);
    expect(out).toEqual([d(1), d(2), d(3), d(7), d(7), d(7)]);
  });

  it('groups near-misses together and leaves strays at the end of the suit', () => {
    const out = sortSmart([d(9), d(4), d(5), d(2), d(2), d(1)]);
    // pair 22, then the 4-5, then the strays in rank order
    expect(out).toEqual([d(2), d(2), d(4), d(5), d(1), d(9)]);
  });

  it('orders honours by wind then dragon, sets before pairs before singles', () => {
    const out = sortSmart([WHITE, RED, RED, E, E, E, N]);
    expect(out).toEqual([E, E, E, N, RED, RED, WHITE]);
  });

  it('agrees with the engine on what belongs together', () => {
    // whatever decompose calls a block must be contiguous in the sorted order
    const hand = [d(1), d(2), d(3), d(5), d(6), b(1), b(1), b(1), c(9), c(9), E, GREEN, WHITE];
    const out = sortHand(hand, 'smart');
    for (const block of decompose(hand)) {
      const at = out.indexOf(block.tiles[0]);
      expect(out.slice(at, at + block.tiles.length)).toEqual(block.tiles);
    }
  });

  it('is stable under the 14th tile: a fresh draw never reshuffles the 13', () => {
    const hand = [d(1), d(2), d(3), d(5), d(5), b(4), b(6), c(2), c(2), E, S, W, RED];
    const before = sortHand(hand, 'smart');
    const after = sortHand([...hand, d(9)], 'smart');
    // the tile that was already there keeps its relative order
    const kept = after.filter((k) => k !== d(9));
    expect(kept).toEqual(before);
  });

  it('never touches manual order', () => {
    const hand = [d(9), d(1), d(5)];
    expect(sortHand(hand, 'manual')).toEqual([d(1), d(5), d(9)]);
  });
});
