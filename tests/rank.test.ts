import { describe, expect, it } from 'vitest';
import { competitionRanks } from '../src/client/rank';

const rank = (rows: Array<{ score: number; wins: number }>) =>
  competitionRanks(rows).map((r) => r.rank);

describe('competitionRanks', () => {
  it('numbers a clean table 1..4', () => {
    expect(rank([{ score: 144, wins: 1 }, { score: -36, wins: 0 }, { score: -36, wins: 0 }, { score: -72, wins: 0 }]))
      .toEqual([1, 2, 2, 4]);
  });

  it('shares a place on identical score and wins, and skips the next', () => {
    expect(
      rank([
        { score: 10, wins: 1 },
        { score: 5, wins: 0 },
        { score: 5, wins: 0 },
        { score: 0, wins: 0 },
      ]),
    ).toEqual([1, 2, 2, 4]);
  });

  it('does not share a place when the wins differ', () => {
    expect(
      rank([
        { score: 10, wins: 1 },
        { score: 10, wins: 0 },
        { score: 0, wins: 0 },
        { score: 0, wins: 0 },
      ]),
    ).toEqual([1, 2, 3, 3]);
  });

  it('gives a four-way tie four firsts', () => {
    expect(
      rank([
        { score: 0, wins: 0 },
        { score: 0, wins: 0 },
        { score: 0, wins: 0 },
        { score: 0, wins: 0 },
      ]),
    ).toEqual([1, 1, 1, 1]);
  });

  it('never hands out a rank beyond the first three medals', () => {
    // three-way tie at the top: 1,1,1 then 4 (no silver, no bronze)
    expect(
      rank([
        { score: 20, wins: 1 },
        { score: 20, wins: 1 },
        { score: 20, wins: 1 },
        { score: -60, wins: 0 },
      ]),
    ).toEqual([1, 1, 1, 4]);
  });

  it('keeps the row data it was given', () => {
    const out = competitionRanks([{ seat: 2, score: 5, wins: 0 }]);
    expect(out[0]).toEqual({ seat: 2, score: 5, wins: 0, rank: 1 });
  });
});
