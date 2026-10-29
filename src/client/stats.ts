import type { Personality } from '../engine/types';

/**
 * What the table actually remembers about you.
 *
 * There is no "how do you play?" question at character creation: the play-style vector is
 * measured from real decisions and stored here. A brand new cat starts neutral and becomes
 * distinctive over its first several hands — the same vector that a shareable bot code encodes.
 */
export interface PlayStats {
  /** Completed hands (won, lost or drawn). */
  hands: number;
  wins: number;
  draws: number;
  /** Every tile you threw away, counted by suit: dots, bamboo, chars, honours. */
  throwsBySuit: [number, number, number, number];
  /** Tiles you passed on claiming, out of every claim you were offered. */
  claimOffers: number;
  claims: { chi: number; pon: number; kan: number };
  /** Honours you dumped before you had a meld — the clearest tell for honour loyalty. */
  earlyHonourDumps: number;
  /** Fan of each hand you won, useful for greed and limit-hunting. */
  winFan: number[];
}

export const STATS_KEY = 'khm.stats.v1';

export const emptyStats = (): PlayStats => ({
  hands: 0,
  wins: 0,
  draws: 0,
  throwsBySuit: [0, 0, 0, 0],
  claimOffers: 0,
  claims: { chi: 0, pon: 0, kan: 0 },
  earlyHonourDumps: 0,
  winFan: [],
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Tile kind -> suit bucket. 0-8 dots, 9-17 bamboo, 18-26 chars, 27+ honours/flowers. */
export function suitBucket(kind: number): 0 | 1 | 2 | 3 {
  if (kind < 9) return 0;
  if (kind < 18) return 1;
  if (kind < 27) return 2;
  return 3;
}

export function recordThrow(s: PlayStats, kind: number, discardsSoFar: number): PlayStats {
  const throwsBySuit = s.throwsBySuit.slice() as [number, number, number, number];
  const bucket = suitBucket(kind);
  throwsBySuit[bucket] += 1;
  const earlyHonourDumps = s.earlyHonourDumps + (bucket === 3 && discardsSoFar < 5 ? 1 : 0);
  return { ...s, throwsBySuit, earlyHonourDumps };
}

export function recordClaimOffer(s: PlayStats, claimed: 'chi' | 'pon' | 'kan' | null): PlayStats {
  const claims = { ...s.claims };
  if (claimed) claims[claimed] += 1;
  return { ...s, claimOffers: s.claimOffers + 1, claims };
}

export function recordHand(s: PlayStats, outcome: { won: boolean; draw: boolean; fan: number }): PlayStats {
  return {
    ...s,
    hands: s.hands + 1,
    wins: s.wins + (outcome.won ? 1 : 0),
    draws: s.draws + (outcome.draw ? 1 : 0),
    winFan: outcome.won ? [...s.winFan, outcome.fan].slice(-40) : s.winFan,
  };
}

/** The neutral vector a cat plays with before it has a history. */
export const NEUTRAL: Personality = {
  name: 'you',
  setBias: 0.5,
  greed: 0.5,
  caution: 0.5,
  aggression: 0.42,
  honourLoyalty: 0.5,
  suits: [1, 1, 1],
  limitHunter: 0.25,
  tilt: 0.2,
};

/**
 * Read the vector off the record. Every trait is a ratio of things you did to things you were
 * offered, so playing badly does not make the profile weird — it makes it yours.
 */
export function readStyle(s: PlayStats): Personality {
  const totalThrows = s.throwsBySuit.reduce((a, b) => a + b, 0);
  const throwShare = s.throwsBySuit.map((n) => (totalThrows ? n / totalThrows : 0.25));

  // a suit you keep throwing is a suit you do not want
  const suits = throwShare.slice(0, 3).map((share) => clamp(1.85 - Math.max(0, share - 1 / 3) * 4.2, 0.45, 2.2));

  const claimRate = s.claimOffers ? (s.claims.chi + s.claims.pon + s.claims.kan) / s.claimOffers : 0.45;
  const ponShare = s.claims.pon + s.claims.chi ? s.claims.pon / (s.claims.pon + s.claims.chi) : 0.5;
  const fanAvg = s.winFan.length ? s.winFan.reduce((a, b) => a + b, 0) / s.winFan.length : 1;
  const honourShare = totalThrows ? s.throwsBySuit[3] / totalThrows : 0.2;
  const earlyHonourRate = totalThrows ? s.earlyHonourDumps / totalThrows : 0;

  return {
    name: 'you',
    setBias: clamp(0.1 + ponShare * 0.85, 0.1, 0.95),
    greed: clamp(0.25 + fanAvg * 0.2, 0.15, 0.95),
    caution: clamp(0.12 + (1 - claimRate) * 0.85, 0.1, 0.95),
    aggression: clamp(0.08 + claimRate * 0.9, 0.05, 0.95),
    honourLoyalty: clamp(0.95 - Math.max(0, honourShare - 0.2) * 3 - earlyHonourRate * 1.5, 0.1, 0.95),
    suits: suits as [number, number, number],
    limitHunter: clamp(fanAvg * 0.16 + (s.hands ? s.claims.kan / s.hands : 0) * 0.25, 0, 0.9),
    tilt: clamp(s.hands ? (s.draws / s.hands) * 0.5 : 0.2, 0, 0.6),
  };
}

/**
 * Blend the measured vector against neutral so an early, thin record cannot produce a caricature.
 * Full weight at ~8 completed hands.
 */
export function confidence(s: PlayStats): number {
  return clamp(s.hands / 8, 0, 1);
}

export function personalityFromStats(s: PlayStats): Personality {
  const read = readStyle(s);
  const w = confidence(s);
  const mix = (a: number, b: number) => a + (b - a) * w;
  return {
    name: 'you',
    setBias: mix(NEUTRAL.setBias, read.setBias),
    greed: mix(NEUTRAL.greed, read.greed),
    caution: mix(NEUTRAL.caution, read.caution),
    aggression: mix(NEUTRAL.aggression, read.aggression),
    honourLoyalty: mix(NEUTRAL.honourLoyalty, read.honourLoyalty),
    suits: [
      mix(NEUTRAL.suits[0], read.suits[0]),
      mix(NEUTRAL.suits[1], read.suits[1]),
      mix(NEUTRAL.suits[2], read.suits[2]),
    ],
    limitHunter: mix(NEUTRAL.limitHunter, read.limitHunter),
    tilt: mix(NEUTRAL.tilt, read.tilt),
  };
}

/** Human-facing bars for the "your style" card. 0..1 each. */

/** Anything read from storage or a backup is a claim, not a fact: normalise it. */
export function healStats(raw: unknown): PlayStats {
  const base = emptyStats();
  const p = (raw ?? {}) as Partial<PlayStats>;
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const quad = (v: unknown, d: PlayStats['throwsBySuit']) =>
    Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (v as PlayStats['throwsBySuit']) : d;
  return {
    hands: num(p.hands),
    wins: num(p.wins),
    draws: num(p.draws),
    throwsBySuit: quad(p.throwsBySuit, base.throwsBySuit),
    claimOffers: num(p.claimOffers),
    claims: { chi: num(p.claims?.chi), pon: num(p.claims?.pon), kan: num(p.claims?.kan) },
    earlyHonourDumps: num(p.earlyHonourDumps),
    winFan: Array.isArray(p.winFan) ? p.winFan.filter((n) => typeof n === 'number' && Number.isFinite(n)) : [],
  };
}

export function loadStats(): PlayStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return emptyStats();
    return healStats(JSON.parse(raw));
  } catch {
    return emptyStats();
  }
}

export function saveStats(s: PlayStats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* private mode: the record just does not persist */
  }
}
