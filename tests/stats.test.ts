import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  NEUTRAL,
  STATS_KEY,
  confidence,
  emptyStats,
  loadStats,
  personalityFromStats,
  readStyle,
  recordClaimOffer,
  recordHand,
  recordSelfKong,
  recordThrow,
  saveStats,
  suitBucket,
  type PlayStats,
  type ThrowContext,
} from '../src/client/stats';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

/** A throw with everything a normal discard carries. */
const ctx = (o: Partial<ThrowContext> = {}): ThrowContext => ({
  discardsSoFar: 2,
  danger: 0.4,
  bestDanger: 0.4,
  wasBest: true,
  afterLoss: false,
  ...o,
});

describe('recording what happened', () => {
  it('buckets a tile kind by suit', () => {
    expect(suitBucket(0)).toBe(0); // 1 dot
    expect(suitBucket(8)).toBe(0); // 9 dots
    expect(suitBucket(9)).toBe(1); // 1 bamboo
    expect(suitBucket(17)).toBe(1);
    expect(suitBucket(18)).toBe(2); // 1 char
    expect(suitBucket(26)).toBe(2);
    expect(suitBucket(27)).toBe(3); // east wind
    expect(suitBucket(41)).toBe(3); // a season
  });

  it('counts throws into the right suit bucket', () => {
    let s = emptyStats();
    s = recordThrow(s, 3, ctx({ discardsSoFar: 0 }));
    s = recordThrow(s, 12, ctx({ discardsSoFar: 1 }));
    s = recordThrow(s, 20, ctx({ discardsSoFar: 2 }));
    expect(s.throwsBySuit).toEqual([1, 1, 1, 0]);
  });

  it('flags honours dumped early but not late', () => {
    let s = emptyStats();
    s = recordThrow(s, 27, ctx({ discardsSoFar: 2 })); // east wind on my third throw
    expect(s.earlyHonourDumps).toBe(1);
    s = recordThrow(s, 28, ctx({ discardsSoFar: 9 })); // south wind much later
    expect(s.earlyHonourDumps).toBe(1);
  });

  it('keeps the risk it accepted and the risk that was available', () => {
    let s = emptyStats();
    s = recordThrow(s, 5, ctx({ danger: 0.6, bestDanger: 0.2, wasBest: false }));
    expect(s.dangerAccepted).toBeCloseTo(0.6);
    expect(s.dangerAvailable).toBeCloseTo(0.2);
    expect(s.scoredThrows).toBe(1);
    expect(s.efficientThrows).toBe(0);
  });

  it('counts a post-loss throw only when asked', () => {
    let s = emptyStats();
    s = recordThrow(s, 5, ctx({ afterLoss: true, danger: 0.9 }));
    s = recordThrow(s, 6, ctx({ afterLoss: false, danger: 0.1 }));
    expect(s.postLossThrows).toBe(1);
    expect(s.postLossDanger).toBeCloseTo(0.9);
  });

  it('counts an offer whether or not it was taken, and a kong either way', () => {
    let s = recordClaimOffer(emptyStats(), 'pon');
    s = recordClaimOffer(s, null);
    s = recordClaimOffer(s, 'kan');
    s = recordSelfKong(s); // a kong declared from your own hand is not an offer
    expect(s.claimOffers).toBe(3);
    expect(s.claims.pon).toBe(1);
    expect(s.claims.kan).toBe(1);
    expect(s.kongs).toBe(2);
  });

  it('records the hand outcome and keeps the recent fan history bounded', () => {
    let s = recordHand(emptyStats(), { won: true, draw: false, fan: 3 });
    s = recordHand(s, { won: false, draw: true, fan: 0 });
    expect(s.hands).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.draws).toBe(1);
    expect(s.winFan).toEqual([3]);

    for (let i = 0; i < 60; i++) s = recordHand(s, { won: true, draw: false, fan: 1 });
    expect(s.winFan.length).toBe(40);
  });
});

describe('reading the style off the record', () => {
  const throws = (s: PlayStats, counts: [number, number, number, number]): PlayStats => {
    let out = s;
    const kinds = [0, 9, 18, 27];
    counts.forEach((n, bucket) => {
      for (let i = 0; i < n; i++) out = recordThrow(out, kinds[bucket], ctx({ discardsSoFar: 9 }));
    });
    return out;
  };

  it('is neutral at an even split and dislikes the suit it throws most', () => {
    const even = readStyle(throws(emptyStats(), [10, 10, 10, 0]));
    expect(even.suits[0]).toBeCloseTo(1, 5);
    expect(even.suits[2]).toBeCloseTo(1, 5);

    const dotty = readStyle(throws(emptyStats(), [18, 11, 11, 0]));
    expect(dotty.suits[0]).toBeLessThan(dotty.suits[1]);
    expect(dotty.suits[1]).toBeGreaterThan(1);
  });

  // the old curve returned 1.85 for anything under a third: no gradient at all
  it('moves smoothly instead of flat-lining under a third', () => {
    const mixed = readStyle(throws(emptyStats(), [14, 13, 13, 0]));
    const dotty = readStyle(throws(emptyStats(), [40, 10, 10, 0]));
    expect(mixed.suits[0]).toBeGreaterThan(dotty.suits[0]);
    expect(dotty.suits[0]).toBeLessThan(0.8);
  });

  it('turns down claims without calling itself reckless', () => {
    let timid = emptyStats();
    let bold = emptyStats();
    for (let i = 0; i < 10; i++) timid = recordClaimOffer(timid, null);
    for (let i = 0; i < 10; i++) bold = recordClaimOffer(bold, 'pon');
    expect(readStyle(bold).aggression).toBeGreaterThan(readStyle(timid).aggression);
    expect(readStyle(bold).setBias).toBeGreaterThan(readStyle(timid).setBias);
    // caution is about the tile you throw, not the tile you decline
    expect(readStyle(timid).caution).toBe(readStyle(bold).caution);
  });

  it('gets more cautious when it throws riskier tiles than it had to', () => {
    let safe = emptyStats();
    let loose = emptyStats();
    for (let i = 0; i < 20; i++) {
      safe = recordThrow(safe, 5, ctx({ danger: 0.1, bestDanger: 0.1 }));
      loose = recordThrow(loose, 5, ctx({ danger: 0.8, bestDanger: 0.1 }));
    }
    expect(readStyle(safe).caution).toBeGreaterThan(readStyle(loose).caution);
    expect(readStyle(loose).caution).toBeLessThan(0.3);
  });

  it('reads efficiency off the throws that kept the best line', () => {
    let clean = emptyStats();
    let sloppy = emptyStats();
    for (let i = 0; i < 20; i++) {
      clean = recordThrow(clean, 5, ctx({ wasBest: true }));
      sloppy = recordThrow(sloppy, 5, ctx({ wasBest: i % 2 === 0 }));
    }
    expect(readStyle(clean).efficiency).toBeCloseTo(1, 5);
    expect(readStyle(sloppy).efficiency).toBeCloseTo(0.5, 5);
  });

  it('reads tilt off the risk it takes right after a loss', () => {
    let steady = emptyStats();
    let tilty = emptyStats();
    for (let i = 0; i < 20; i++) {
      steady = recordThrow(steady, 5, ctx({ danger: 0.3, afterLoss: i < 3 }));
      tilty = recordThrow(tilty, 5, ctx({ danger: i < 3 ? 0.9 : 0.3, afterLoss: i < 3 }));
    }
    expect(readStyle(tilty).tilt).toBeGreaterThan(readStyle(steady).tilt);
    expect(readStyle(steady).tilt).toBeLessThan(0.6);
  });

  it('hunts limits when its wins are big, and the gate the bot uses is reachable', () => {
    let small = emptyStats();
    let big = emptyStats();
    for (let i = 0; i < 8; i++) {
      small = recordHand(small, { won: true, draw: false, fan: 0 });
      big = recordHand(big, { won: true, draw: false, fan: 4 });
    }
    expect(readStyle(big).limitHunter).toBeGreaterThan(readStyle(small).limitHunter);
    expect(readStyle(big).limitHunter).toBeGreaterThan(0.35);
  });

  it('holds honours when it stops dumping them early', () => {
    const hand = () => recordHand(emptyStats(), { won: false, draw: false, fan: 0 });
    // dumper: three honours in the first five discards of the hand
    let dump = hand();
    dump = recordThrow(dump, 27, ctx({ discardsSoFar: 0 }));
    dump = recordThrow(dump, 28, ctx({ discardsSoFar: 1 }));
    dump = recordThrow(dump, 31, ctx({ discardsSoFar: 2 }));
    // keeper: same hands, honours never in the opening throws
    let keep = hand();
    keep = recordThrow(keep, 0, ctx({ discardsSoFar: 0 }));
    keep = recordThrow(keep, 9, ctx({ discardsSoFar: 1 }));
    keep = recordThrow(keep, 18, ctx({ discardsSoFar: 2 }));
    expect(readStyle(keep).honourLoyalty).toBeGreaterThan(readStyle(dump).honourLoyalty);
  });
});

describe('confidence', () => {
  it('starts neutral and reaches full weight after eight hands', () => {
    const fresh = personalityFromStats(emptyStats());
    expect(fresh).toEqual(NEUTRAL);
    expect(confidence(emptyStats())).toBe(0);
    expect(confidence({ ...emptyStats(), hands: 4 })).toBeCloseTo(0.5);
    expect(confidence({ ...emptyStats(), hands: 8 })).toBe(1);
    expect(confidence({ ...emptyStats(), hands: 40 })).toBe(1);
  });

  it('moves away from neutral as hands accumulate', () => {
    let s = emptyStats();
    for (let i = 0; i < 12; i++) s = recordClaimOffer(s, null);
    const afterOne = personalityFromStats({ ...s, hands: 1 });
    const afterTen = personalityFromStats({ ...s, hands: 10 });
    expect(afterTen.aggression).toBeLessThan(afterOne.aggression);
    expect(afterTen.aggression).toBeLessThan(NEUTRAL.aggression);
  });

  it('never leaves the legal range', () => {
    let s = emptyStats();
    for (let i = 0; i < 40; i++) s = recordThrow(s, 27, ctx({ danger: 1, bestDanger: 0, wasBest: false, afterLoss: true }));
    for (let i = 0; i < 40; i++) s = recordClaimOffer(s, null);
    s = recordHand(s, { won: true, draw: false, fan: 12 });
    const p = personalityFromStats(s);
    for (const v of [p.setBias, p.greed, p.caution, p.aggression, p.honourLoyalty, p.limitHunter, p.tilt, p.efficiency]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    for (const suit of p.suits) {
      expect(suit).toBeGreaterThan(0);
      expect(suit).toBeLessThanOrEqual(2.4);
    }
  });
});

describe('persistence and migration', () => {
  it('round-trips through storage', () => {
    let s = recordThrow(emptyStats(), 5, ctx());
    s = recordClaimOffer(s, 'pon');
    s = recordHand(s, { won: true, draw: false, fan: 2 });
    saveStats(s);
    expect(store.get(STATS_KEY)).toBeTruthy();
    expect(loadStats()).toEqual(s);
  });

  // a v1 record keeps its throws, claims and wins; the ratios it never measured
  // read neutral rather than zero, so nobody's cat turns into a caricature
  it('carries a v1 record forward without inventing a personality', () => {
    store.set('khm.stats.v1', JSON.stringify({
      hands: 6, wins: 2, draws: 1, throwsBySuit: [20, 10, 10, 5],
      claimOffers: 12, claims: { chi: 1, pon: 3, kan: 0 }, earlyHonourDumps: 3, winFan: [1, 2],
    }));
    const s = loadStats();
    expect(s.hands).toBe(6);
    expect(s.throwsBySuit).toEqual([20, 10, 10, 5]);
    expect(s.dangerAccepted).toBe(0);
    expect(s.scoredThrows).toBe(0);
    expect(store.get(STATS_KEY)).toBeTruthy();
    const p = personalityFromStats(s);
    expect(p.efficiency).toBeCloseTo(NEUTRAL.efficiency, 5);
    expect(p.caution).toBeCloseTo(NEUTRAL.caution, 5);
  });

  it('falls back to an empty record when storage holds junk', () => {
    store.set(STATS_KEY, 'not json');
    expect(loadStats()).toEqual(emptyStats());
    store.set(STATS_KEY, JSON.stringify({ hands: 3 }));
    const partial = loadStats();
    expect(partial.hands).toBe(3);
    expect(partial.throwsBySuit).toEqual([0, 0, 0, 0]);
    expect(partial.claims).toEqual({ chi: 0, pon: 0, kan: 0 });
    expect(partial.winFan).toEqual([]);
  });

  it('survives a storage that throws (private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadStats()).toEqual(emptyStats());
    expect(() => saveStats(emptyStats())).not.toThrow();
  });
});
