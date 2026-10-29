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
  recordThrow,
  saveStats,
  suitBucket,
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
    s = recordThrow(s, 3, 0);
    s = recordThrow(s, 12, 1);
    s = recordThrow(s, 20, 2);
    expect(s.throwsBySuit).toEqual([1, 1, 1, 0]);
  });

  it('flags honours dumped early but not late', () => {
    let s = emptyStats();
    s = recordThrow(s, 27, 2); // east wind on my third throw
    expect(s.earlyHonourDumps).toBe(1);
    s = recordThrow(s, 28, 9); // south wind much later
    expect(s.earlyHonourDumps).toBe(1);
  });

  it('counts an offer whether or not it was taken', () => {
    let s = recordClaimOffer(emptyStats(), 'pon');
    s = recordClaimOffer(s, null);
    s = recordClaimOffer(s, 'chi');
    expect(s.claimOffers).toBe(3);
    expect(s.claims.pon).toBe(1);
    expect(s.claims.chi).toBe(1);
    expect(s.claims.kan).toBe(0);
  });

  it('records the hand outcome and keeps the recent fan history bounded', () => {
    let s = emptyStats();
    s = recordHand(s, { won: true, draw: false, fan: 3 });
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
  it('likes least the suit it throws most', () => {
    let s = emptyStats();
    for (let i = 0; i < 20; i++) s = recordThrow(s, i % 9, i); // only dots
    const style = readStyle(s);
    expect(style.suits[0]).toBeLessThan(style.suits[1]);
    expect(style.suits[0]).toBeLessThan(style.suits[2]);
  });

  it('gets more cautious the more claims it turns down', () => {
    let timid = emptyStats();
    let bold = emptyStats();
    for (let i = 0; i < 10; i++) timid = recordClaimOffer(timid, null);
    for (let i = 0; i < 10; i++) bold = recordClaimOffer(bold, 'pon');
    expect(readStyle(timid).caution).toBeGreaterThan(readStyle(bold).caution);
    expect(readStyle(bold).aggression).toBeGreaterThan(readStyle(timid).aggression);
    expect(readStyle(bold).setBias).toBeGreaterThan(readStyle(timid).setBias);
  });

  it('holds honours when it stops dumping them', () => {
    let dumper = emptyStats();
    let keeper = emptyStats();
    for (let i = 0; i < 10; i++) dumper = recordThrow(dumper, 27 + (i % 7), i);
    for (let i = 0; i < 10; i++) keeper = recordThrow(keeper, i % 9, i);
    expect(readStyle(keeper).honourLoyalty).toBeGreaterThan(readStyle(dumper).honourLoyalty);
  });

  it('hunts limits more when its wins are worth more', () => {
    let small = emptyStats();
    let big = emptyStats();
    for (let i = 0; i < 6; i++) small = recordHand(small, { won: true, draw: false, fan: 0 });
    for (let i = 0; i < 6; i++) big = recordHand(big, { won: true, draw: false, fan: 6 });
    expect(readStyle(big).limitHunter).toBeGreaterThan(readStyle(small).limitHunter);
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
    expect(afterTen.caution).toBeGreaterThan(afterOne.caution);
    expect(afterTen.caution).toBeGreaterThan(NEUTRAL.caution);
  });

  it('never leaves the legal range', () => {
    let s = emptyStats();
    for (let i = 0; i < 40; i++) s = recordThrow(s, 27, i);
    for (let i = 0; i < 40; i++) s = recordClaimOffer(s, null);
    s = recordHand(s, { won: true, draw: false, fan: 12 });
    const p = personalityFromStats(s);
    for (const v of [p.setBias, p.greed, p.caution, p.aggression, p.honourLoyalty, p.limitHunter, p.tilt]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    for (const suit of p.suits) {
      expect(suit).toBeGreaterThan(0);
      expect(suit).toBeLessThanOrEqual(2.2);
    }
  });
});

describe('persistence', () => {
  it('round-trips through storage', () => {
    let s = emptyStats();
    s = recordThrow(s, 5, 0);
    s = recordClaimOffer(s, 'pon');
    s = recordHand(s, { won: true, draw: false, fan: 2 });
    saveStats(s);
    expect(store.get(STATS_KEY)).toBeTruthy();
    expect(loadStats()).toEqual(s);
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
