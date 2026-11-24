import { describe, expect, it } from 'vitest';
import { competitionRanks } from '../src/client/rank';

// The match is decided by hand wins alone: the points ledger is gone, so `wins`
// is the only column a rank can be built from.
const rank = (rows: Array<{ wins: number }>) => competitionRanks(rows).map((r) => r.rank);

describe('competitionRanks', () => {
  it('numbers a clean table 1..4', () => {
    expect(rank([{ wins: 2 }, { wins: 1 }, { wins: 1 }, { wins: 0 }])).toEqual([1, 2, 2, 4]);
  });

  it('does not share a place when the wins differ', () => {
    expect(rank([{ wins: 2 }, { wins: 1 }, { wins: 0 }, { wins: 0 }])).toEqual([1, 2, 3, 3]);
  });

  it('gives a four-way tie four firsts', () => {
    expect(rank([{ wins: 0 }, { wins: 0 }, { wins: 0 }, { wins: 0 }])).toEqual([1, 1, 1, 1]);
  });

  it('never hands out a rank beyond the first three medals', () => {
    // three-way tie at the top: 1,1,1 then 4 (no silver, no bronze)
    expect(rank([{ wins: 1 }, { wins: 1 }, { wins: 1 }, { wins: 0 }])).toEqual([1, 1, 1, 4]);
  });

  it('keeps the row data it was given', () => {
    const out = competitionRanks([{ seat: 2, wins: 1 }]);
    expect(out[0]).toEqual({ seat: 2, wins: 1, rank: 1 });
  });
});
