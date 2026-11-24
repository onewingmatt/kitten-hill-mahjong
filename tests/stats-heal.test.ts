import { describe, expect, it } from 'vitest';
import { emptyStats, healStats, personalityFromStats } from '../src/client/stats';

/**
 * Anything from localStorage or a backup code is untrusted input. A missing
 * array used to reach `reduce` and blank the whole app.
 */
describe('healStats', () => {
  it('returns empty stats for nothing at all', () => {
    expect(healStats(null)).toEqual(emptyStats());
    expect(healStats(undefined)).toEqual(emptyStats());
    expect(healStats('nonsense')).toEqual(emptyStats());
  });

  it('keeps a shape missing throwsBySuit from reaching reduce', () => {
    const healed = healStats({ hands: 6, wins: 2, draws: 1 });
    expect(healed.throwsBySuit).toEqual([0, 0, 0, 0]);
    expect(healed.claims).toEqual({ chi: 0, pon: 0, kan: 0 });
    expect(healed.winFan).toEqual([]);
    expect(() => personalityFromStats(healed)).not.toThrow();
  });

  it('drops numbers that are not numbers', () => {
    const healed = healStats({ hands: 'lots', throwsBySuit: [1, 2], winFan: [3, 'x', null, 5] });
    expect(healed.hands).toBe(0);
    expect(healed.throwsBySuit).toEqual([0, 0, 0, 0]);
    expect(healed.winFan).toEqual([3, 5]);
  });

  it('passes a full v2 record through untouched', () => {
    const real = {
      hands: 9,
      wins: 3,
      draws: 2,
      throwsBySuit: [12, 8, 5, 3] as [number, number, number, number],
      claimOffers: 11,
      claims: { chi: 2, pon: 3, kan: 1 },
      earlyHonourDumps: 4,
      winFan: [3, 6, 9],
      dangerAccepted: 18.4,
      dangerAvailable: 11.2,
      efficientThrows: 61,
      scoredThrows: 72,
      kongs: 2,
      postLossThrows: 9,
      postLossDanger: 4.1,
    };
    expect(healStats(real)).toEqual(real);
  });

  it('fills a v1 record with neutral v2 counters rather than zeroes', () => {
    const v1 = { hands: 9, wins: 3, draws: 2, throwsBySuit: [12, 8, 5, 3], claimOffers: 11, claims: { chi: 2, pon: 3, kan: 1 }, earlyHonourDumps: 4, winFan: [3, 6, 9] };
    const healed = healStats(v1);
    expect(healed.dangerAvailable).toBe(0);
    expect(healed.scoredThrows).toBe(0);
    expect(healed.hands).toBe(9);
    // unmeasured ratios must read neutral, not "reckless"
    const style = personalityFromStats(healed);
    expect(style.caution).toBeCloseTo(0.5, 5);
    expect(style.efficiency).toBeCloseTo(0.9, 5);
    expect(style.tilt).toBeCloseTo(0.2, 5);
  });
});
