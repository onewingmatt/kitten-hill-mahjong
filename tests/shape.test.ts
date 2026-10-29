import { describe, expect, it } from 'vitest';
import { afterEachDiscard, blockByKind, decompose, describe as describeTile, distanceToReady } from '../src/engine/shape';

/** dots 1-9 = 0..8, bamboo 1-9 = 9..17, chars 1-9 = 18..26, east..north = 27..30, dragons = 31..33 */
const d = (n: number) => n - 1;
const b = (n: number) => 8 + n;
const c = (n: number) => 17 + n;
const E = 27, S = 28, W = 29, N = 30, RED = 31, GREEN = 32, WHITE = 33;

describe('decompose', () => {
  it('reads a completed run as one block and leaves the pair alone', () => {
    const blocks = decompose([d(1), d(2), d(3), b(5), b(5), E, S, W, N, RED, GREEN, WHITE, d(9)]);
    expect(blocks.filter((x) => x.shape === 'run')).toEqual([{ shape: 'run', tiles: [d(1), d(2), d(3)] }]);
    expect(blocks.filter((x) => x.shape === 'pair')).toHaveLength(1);
    expect(blocks.filter((x) => x.shape === 'single')).toHaveLength(8);
  });

  it('prefers a set over a run when a tile could be either', () => {
    const blocks = decompose([d(3), d(3), d(3), d(4), d(5)]);
    expect(blocks[0]).toEqual({ shape: 'set', tiles: [d(3), d(3), d(3)] });
    expect(blocks.some((x) => x.shape === 'partial')).toBe(true);
  });

  it('finds half-runs across a one-rank gap and keeps suits apart', () => {
    const blocks = decompose([d(2), d(4)]);
    expect(blocks).toEqual([{ shape: 'partial', tiles: [d(2), d(4)] }]);
    // dots 9 and bamboo 1 are not adjacent
    const split = decompose([d(9), b(1)]);
    expect(split.every((x) => x.shape === 'single')).toBe(true);
  });

  it('never invents a run across the 9 to 1 boundary', () => {
    const blocks = decompose([d(8), d(9), b(1)]);
    expect(blocks.every((x) => x.shape !== 'run')).toBe(true);
  });

  it('reads a quad as a set plus a spare and loses no tiles', () => {
    const hand = [d(7), d(7), d(7), d(7), b(1), b(2), b(3)];
    const blocks = decompose(hand);
    const flat = blocks.flatMap((x) => x.tiles).sort((x, y) => x - y);
    expect(flat).toEqual([...hand].sort((x, y) => x - y));
    expect(blocks.filter((x) => x.shape === 'set')).toHaveLength(1);
  });

  it('honours only ever pair up', () => {
    const blocks = decompose([E, E, RED, RED, RED]);
    expect(blocks.filter((x) => x.shape === 'run' || x.shape === 'partial')).toHaveLength(0);
    expect(blocks.filter((x) => x.shape === 'set')).toHaveLength(1);
    expect(blocks.filter((x) => x.shape === 'pair')).toHaveLength(1);
  });
});

describe('describe', () => {
  it('names the shape a tile sits in', () => {
    const blocks = decompose([d(3), d(4), d(5), d(7), d(7), E, S]);
    expect(describeTile(blocks, d(4))).toBe('a run');
    expect(describeTile(blocks, d(7))).toBe('a pair');
    expect(describeTile(blocks, E)).toBe('on its own');
  });
});

describe('afterEachDiscard', () => {
  it('reports what each discard would leave behind', () => {
    const hand = [d(1), d(2), d(3), d(1), d(2), d(3), b(1), b(2), b(3), c(1), c(2), c(3), E, E];
    const after = afterEachDiscard(hand, 0)!;
    expect(after.get(E)).toBe(0);          // dropping the spare honour leaves a ready hand
    expect(after.size).toBeGreaterThan(1);
  });

  it('says nothing when there is no discard to make', () => {
    expect(afterEachDiscard([d(1), d(2), d(3)], 0)).toBeUndefined();
  });
});

describe('distanceToReady', () => {
  it('calls a one-away hand one away', () => {
    // three runs, a pair, and a floating honour: one tile short of a win
    const hand = [d(1), d(2), d(3), b(1), b(2), b(3), c(1), c(2), c(3), E, E, S, S];
    expect(distanceToReady(hand, 0)).toBe(0);
  });

  it('counts the best discard when holding fourteen', () => {
    const hand = [d(1), d(2), d(3), b(1), b(2), b(3), c(1), c(2), c(3), E, E, S, S, WHITE];
    expect(distanceToReady(hand, 0)).toBe(0);
  });

  it('a junk hand is further out than a shapely one', () => {
    const junk = [d(1), d(4), d(7), b(2), b(6), b(9), c(1), c(5), c(9), E, S, W, N];
    const shapely = [d(1), d(2), d(3), d(4), d(5), b(3), b(4), b(5), c(2), c(3), c(4), E, E];
    expect(distanceToReady(junk, 0)).toBeGreaterThan(distanceToReady(shapely, 0));
  });
});

describe('blockByKind', () => {
  it('maps every kind in the hand to a block', () => {
    const hand = [d(1), d(2), d(3), E, E];
    const map = blockByKind(decompose(hand));
    for (const k of hand) expect(map.has(k)).toBe(true);
    expect(map.get(E)?.shape).toBe('pair');
  });
});
