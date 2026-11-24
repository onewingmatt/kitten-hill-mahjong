import type { Personality } from '../engine/types';
import { NEUTRAL } from '../engine/bots/personality';

/**
 * What the table actually remembers about you.
 *
 * There is no "how do you play?" question at character creation: the play-style vector is
 * measured from real decisions and stored here. A brand new cat starts neutral and becomes
 * distinctive over its first several hands — the same vector that a shareable bot code encodes.
 *
 * v2 adds the three things a record could not measure before: how much danger each throw accepted,
 * whether the throw kept the best line, and how you play right after a loss.
 */
export interface PlayStats {
  /** Completed hands (won, lost or drawn). */
  hands: number;
  wins: number;
  draws: number;
  /** Every tile you threw away, counted by suit: dots, bamboo, chars, honours. */
  throwsBySuit: [number, number, number, number];
  /** Claim offers you answered, and the ones you took, by type. */
  claimOffers: number;
  claims: { chi: number; pon: number; kan: number };
  /** Honours you dumped before the hand had five discards in it. */
  earlyHonourDumps: number;
  /** Fan of each hand you won, useful for greed and limit-hunting. */
  winFan: number[];
  /** Danger of the tile you threw, summed (engine `dangerOf`; 0 is safest). */
  dangerAccepted: number;
  /** Danger of the safest tile you could have thrown instead, summed. */
  dangerAvailable: number;
  /** Throws that kept the best shanten available. */
  efficientThrows: number;
  /** Throws where a better line existed to compare against. */
  scoredThrows: number;
  /** Kongs declared — the cheapest tell for a cat that likes to commit. */
  kongs: number;
  /** Throws in the first three discards of a hand entered after losing one. */
  postLossThrows: number;
  postLossDanger: number;
}

export const STATS_KEY = 'khm.stats.v2';
/** The pre-v2 record: read once, carried forward, never written again. */
const LEGACY_STATS_KEY = 'khm.stats.v1';

export const emptyStats = (): PlayStats => ({
  hands: 0,
  wins: 0,
  draws: 0,
  throwsBySuit: [0, 0, 0, 0],
  claimOffers: 0,
  claims: { chi: 0, pon: 0, kan: 0 },
  earlyHonourDumps: 0,
  winFan: [],
  dangerAccepted: 0,
  dangerAvailable: 0,
  efficientThrows: 0,
  scoredThrows: 0,
  kongs: 0,
  postLossThrows: 0,
  postLossDanger: 0,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Tile kind -> suit bucket. 0-8 dots, 9-17 bamboo, 18-26 chars, 27+ honours/flowers. */
export function suitBucket(kind: number): 0 | 1 | 2 | 3 {
  if (kind < 9) return 0;
  if (kind < 18) return 1;
  if (kind < 27) return 2;
  return 3;
}

/** What the caller knows about one throw at the moment it is made. */
export interface ThrowContext {
  /** Discards this seat had already made this hand. */
  discardsSoFar: number;
  /** `dangerOf` of the tile that was thrown. */
  danger: number;
  /** `dangerOf` of the safest tile that could have been thrown instead. */
  bestDanger: number;
  /** Did the throw keep the best shanten available? */
  wasBest: boolean;
  /** Is this one of the first three discards of a hand entered after a loss? */
  afterLoss: boolean;
}

export function recordThrow(s: PlayStats, kind: number, ctx: ThrowContext): PlayStats {
  const throwsBySuit = s.throwsBySuit.slice() as [number, number, number, number];
  const bucket = suitBucket(kind);
  throwsBySuit[bucket] += 1;
  const earlyHonourDumps = s.earlyHonourDumps + (bucket === 3 && ctx.discardsSoFar < 5 ? 1 : 0);
  return {
    ...s,
    throwsBySuit,
    earlyHonourDumps,
    dangerAccepted: s.dangerAccepted + Math.max(0, ctx.danger),
    dangerAvailable: s.dangerAvailable + Math.max(0, ctx.bestDanger),
    scoredThrows: s.scoredThrows + 1,
    efficientThrows: s.efficientThrows + (ctx.wasBest ? 1 : 0),
    postLossThrows: s.postLossThrows + (ctx.afterLoss ? 1 : 0),
    postLossDanger: s.postLossDanger + (ctx.afterLoss ? Math.max(0, ctx.danger) : 0),
  };
}

export function recordClaimOffer(s: PlayStats, claimed: 'chi' | 'pon' | 'kan' | null): PlayStats {
  const claims = { ...s.claims };
  if (claimed) claims[claimed] += 1;
  return {
    ...s,
    claimOffers: s.claimOffers + 1,
    claims,
    kongs: s.kongs + (claimed === 'kan' ? 1 : 0),
  };
}

/** A kong declared from your own hand (concealed, or added to a pung). */
export function recordSelfKong(s: PlayStats): PlayStats {
  return { ...s, kongs: s.kongs + 1 };
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
export { NEUTRAL };

/**
 * Read the vector off the record. Every trait is a ratio of things you did to things you were
 * offered, so playing badly does not make the profile weird — it makes it yours.
 */
export function readStyle(s: PlayStats): Personality {
  const totalThrows = s.throwsBySuit.reduce((a, b) => a + b, 0);
  const share = s.throwsBySuit.map((n) => (totalThrows ? n / totalThrows : 0.25));

  // A suit you keep throwing is a suit you do not want. Centred on 1.0 at an even
  // split and continuous: 45% dots reads 0.63, 20% dots reads 1.43.
  const suits = share.slice(0, 3).map((v) => clamp(1 + (1 / 3 - v) * 3.2, 0.35, 2.4)) as [number, number, number];

  const claimRate = s.claimOffers ? (s.claims.chi + s.claims.pon + s.claims.kan) / s.claimOffers : 0.45;
  const ponShare = s.claims.pon + s.claims.chi ? s.claims.pon / (s.claims.pon + s.claims.chi) : 0.5;
  const fanAvg = s.winFan.length ? s.winFan.reduce((a, b) => a + b, 0) / s.winFan.length : 1;

  // How much more risk each throw took than the safest tile on offer. 1.0 is
  // "always took the safest"; 2.5 reads as reckless.
  const riskRatio = s.dangerAvailable > 0 ? s.dangerAccepted / s.dangerAvailable : 1;
  const riskTaken = clamp((riskRatio - 1) / 1.5, 0, 1);

  const efficiency = s.scoredThrows ? clamp(s.efficientThrows / s.scoredThrows, 0.2, 1) : NEUTRAL.efficiency;
  const earlyRate = s.hands ? s.earlyHonourDumps / s.hands : 0.35;
  const bigWins = s.winFan.filter((f) => f >= 3).length;
  const limitHunter = s.wins
    ? clamp((bigWins / s.wins) * 0.7 + (s.hands ? (s.kongs / s.hands) * 0.3 : 0), 0, 0.9)
    : NEUTRAL.limitHunter;

  const avgDanger = totalThrows ? s.dangerAccepted / totalThrows : 0;
  const postAvg = s.postLossThrows ? s.postLossDanger / s.postLossThrows : avgDanger;
  const spike = avgDanger > 0 ? clamp(postAvg / avgDanger - 1, 0, 1) : 0;
  // a record that never measured these reads neutral, not extreme: a v1 cat
  // carrying 6 hands must not arrive as maximally cautious
  const caution = s.dangerAvailable > 0 ? clamp(0.95 - riskTaken * 0.8, 0.15, 0.95) : NEUTRAL.caution;
  const tilt = s.postLossThrows > 0 ? clamp(0.15 + spike * 0.45, 0, 0.6) : NEUTRAL.tilt;

  return {
    name: 'you',
    setBias: clamp(0.1 + ponShare * 0.85, 0.1, 0.95),
    greed: clamp(0.25 + fanAvg * 0.2, 0.15, 0.95),
    caution,
    aggression: clamp(0.08 + claimRate * 0.9, 0.05, 0.95),
    honourLoyalty: clamp(0.92 - earlyRate * 0.45, 0.1, 0.95),
    suits,
    limitHunter,
    tilt,
    efficiency,
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
    efficiency: mix(NEUTRAL.efficiency, read.efficiency),
  };
}

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
    dangerAccepted: num(p.dangerAccepted),
    dangerAvailable: num(p.dangerAvailable),
    efficientThrows: num(p.efficientThrows),
    scoredThrows: num(p.scoredThrows),
    kongs: num(p.kongs),
    postLossThrows: num(p.postLossThrows),
    postLossDanger: num(p.postLossDanger),
  };
}

export function loadStats(): PlayStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return healStats(JSON.parse(raw));
    // a v1 record still holds the throws, claims and wins that matter: carry it
    // forward. The new ratios stay neutral because they were never measured.
    const legacy = localStorage.getItem(LEGACY_STATS_KEY);
    if (!legacy) return emptyStats();
    const healed = healStats(JSON.parse(legacy));
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(healed));
    } catch {
      /* private mode: the carried record lives for this session */
    }
    return healed;
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
