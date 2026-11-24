import type { HandScore, Meld, ScoreLine } from './types';
import { countsOf } from './shanten';
import { decompositions, isNineGates, isThirteenOrphans, type Decomposition } from './win';
import {
  DRAGON_K,
  WIND_K,
  isBonus,
  isHonour,
  isSeatBonus,
  isSuit,
  isTerminal,
  kind,
  suitOf,
} from './tiles';

/**
 * Chinese Classical (post-1910) scoring, as tabulated by the Mahjong Wiki and
 * cross-checked against Shanghai: Second Dynasty's rules chapter.
 *
 *   base points (mini points)  x  2^doubles   =  hand value, capped at the limit
 *
 * The old 3-double minimum is gone: `minFan` defaults to 0, so any complete hand
 * can be declared. Keep the knob for an optional traditional table only.
 */

export const DEFAULT_LIMIT = 500;
/** Traditional 3-double table rule; off by default (a chicken hand may win). */
export const MIN_DOUBLES = 3;
export const DEFAULT_MIN_FAN = 0;
/** Fixed values for limit hands, from the post-1910 table. */
export const LIMIT_HAND_POINTS = {
  blessingOfHeaven: 300,
  blessingOfEarth: 150,
  bigThreeDragons: 300,
  thirteenOrphans: 300,
  bigFourWinds: 300,
  nineGates: 300,
};

export interface ScoreContext {
  seat: number;
  /** The player's seat wind this hand (0=E .. 3=N), which follows the dealer. */
  wind?: number;
  roundWind: number;
  selfDraw: boolean;
  lastTile: boolean;
  replacement: boolean;
  robbingKong: boolean;
  flowers: number[];
  /** Dealer's very first discard of the hand, before any other tile was played. */
  firstDiscardOfHand?: boolean;
  /** True when the winner is the dealer and this is the initial 14 tiles. */
  heaven?: boolean;
  limit?: number;
  /** Table rule: doubles required to declare. Chinese Classical is 3. */
  minFan?: number;
}

function pungValue(k: number, isKong: boolean, concealed: boolean): number {
  const big = isTerminal(k) || isHonour(k);
  if (isKong) return concealed ? (big ? 32 : 16) : big ? 16 : 8;
  return concealed ? (big ? 8 : 4) : big ? 4 : 2;
}

function isValueHonour(k: number, wind: number, roundWind: number): boolean {
  if (DRAGON_K.includes(k)) return true;
  return k === WIND_K[wind] || k === WIND_K[roundWind];
}

/** Which wait the winning tile sat on, for the "Single Wait" bonus. */
function singleWait(d: Decomposition, winningKind: number): boolean {
  if (d.pair === winningKind) return true;
  for (const s of d.sets) {
    if (s.type !== 'chow') continue;
    const lo = s.k;
    if (winningKind === lo + 1) return true; // closed wait
    if (winningKind === lo && lo % 9 === 6) return true; // 789 caught on the 7
    if (winningKind === lo + 2 && lo % 9 === 0) return true; // 123 caught on the 3
  }
  return false;
}

interface Candidate {
  mini: number;
  doubles: ScoreLine[];
  bonus: ScoreLine[];
  labels: string[];
}

function evaluate(d: Decomposition, melds: Meld[], counts: number[], ctx: ScoreContext, winningKind: number): Candidate {
  const mini: ScoreLine[] = [];
  const bonus: ScoreLine[] = [];
  const labels: string[] = [];

  const sets = [...d.sets.map((s) => ({ ...s, concealed: true })), ...melds.map((m) => ({
    type: m.type === 'chow' ? ('chow' as const) : ('pung' as const),
    k: m.k,
    concealed: m.concealed,
  }))];

  for (const s of sets) {
    if (s.type === 'chow') continue;
    // A called pung is exposed; a kong is exposed unless it was concealed.
    const meld = melds.find((m) => m.k === s.k && m.type !== 'chow');
    const isKong = meld?.type === 'kong';
    const concealed = s.concealed && (meld ? meld.concealed : true);
    const v = pungValue(s.k, !!isKong, concealed);
    mini.push({
      label: `${isKong ? 'Kong' : 'Pung'} of ${kind(s.k).label} (${concealed ? 'concealed' : 'exposed'})`,
      value: v,
    });
  }

  const wind = ctx.wind ?? ctx.seat;
  const pairK = d.pair;
  if (DRAGON_K.includes(pairK)) {
    mini.push({ label: `Pair of ${kind(pairK).label}`, value: 2 });
  } else if (WIND_K.includes(pairK) && isValueHonour(pairK, wind, ctx.roundWind)) {
    mini.push({ label: `Pair of ${kind(pairK).label}`, value: 2 });
  }

  const seatFlowers = ctx.flowers.filter((f) => isSeatBonus(f, ctx.seat));
  for (const f of seatFlowers) mini.push({ label: `Seat bonus: ${kind(f).label}`, value: 2 });

  // ---- winner bonus points ----
  bonus.push({ label: 'Mahjong', value: 20 });
  const allChows = sets.every((s) => s.type === 'chow');
  const allPungs = sets.every((s) => s.type !== 'chow');
  const pairIsValue = DRAGON_K.includes(pairK) || (WIND_K.includes(pairK) && isValueHonour(pairK, wind, ctx.roundWind));
  if (allChows && !pairIsValue) bonus.push({ label: 'Pinghu (all chows)', value: 10 });
  if (allPungs) bonus.push({ label: 'All pungs', value: 10 });
  if (ctx.replacement) bonus.push({ label: 'Replacement tile win', value: 10 });
  if (ctx.lastTile) bonus.push({ label: 'Last tile win', value: 10 });
  if (ctx.selfDraw) bonus.push({ label: 'Self-drawn win', value: 2 });
  if (singleWait(d, winningKind)) bonus.push({ label: 'Single wait', value: 2 });

  // ---- doubles ----
  const doubles: ScoreLine[] = [];
  for (const s of sets) {
    if (s.type === 'chow') continue;
    if (DRAGON_K.includes(s.k)) doubles.push({ label: `Dragon ${s.type}: ${kind(s.k).label}`, value: 1 });
    if (s.k === WIND_K[wind]) doubles.push({ label: 'Seat wind pung', value: 1 });
    if (s.k === WIND_K[ctx.roundWind]) doubles.push({ label: 'Round wind pung', value: 1 });
  }

  const allKinds = [...counts.map((n, k) => ({ n, k })).flatMap(({ n, k }) => Array(n).fill(k)), ...melds.flatMap((m) => m.tiles)];
  const suitsUsed = new Set(allKinds.filter((k) => isSuit(k)).map((k) => suitOf(k)!));
  const hasHonours = allKinds.some((k) => isHonour(k));
  const onlyHonours = allKinds.every((k) => isHonour(k));

  if (onlyHonours) {
    doubles.push({ label: 'All honours', value: 3 });
  } else if (suitsUsed.size === 1 && hasHonours) {
    doubles.push({ label: 'Half flush', value: 1 });
  } else if (suitsUsed.size === 1 && !hasHonours) {
    doubles.push({ label: 'Pure flush', value: 3 });
  }

  if (seatFlowers.length >= 2) doubles.push({ label: 'Two seat flowers', value: 1 });
  if (ctx.flowers.filter((k) => kind(k).group === 'f').length >= 4) doubles.push({ label: 'All four flowers', value: 3 });
  if (ctx.flowers.filter((k) => kind(k).group === 's').length >= 4) doubles.push({ label: 'All four seasons', value: 3 });

  if (allChows && !pairIsValue) labels.push('Pinghu');
  if (allPungs) labels.push('All pungs');
  if (onlyHonours) labels.push('All honours');
  else if (suitsUsed.size === 1 && hasHonours) labels.push('Half flush');
  else if (suitsUsed.size === 1 && !hasHonours) labels.push('Pure flush');

  const totalMini = mini.reduce((a, b) => a + b.value, 0) + bonus.reduce((a, b) => a + b.value, 0);
  return { mini: totalMini, doubles, bonus, labels };
}

function pungKindSet(counts: number[], melds: Meld[], kinds: number[]): Set<number> {
  const seen = new Set<number>();
  for (const m of melds) if (m.type !== 'chow' && kinds.includes(m.k)) seen.add(m.k);
  for (const d of decompositions(counts, melds.length)) {
    for (const s of d.sets) if (s.type === 'pung' && kinds.includes(s.k)) seen.add(s.k);
  }
  return seen;
}

function limitHandName(counts: number[], melds: Meld[], ctx: ScoreContext): string | null {
  if (isThirteenOrphans(counts, melds.length)) return 'Thirteen Orphans';
  if (isNineGates(counts, melds.length)) return 'Nine Gates';
  if (pungKindSet(counts, melds, DRAGON_K).size === 3) return 'Big Three Dragons';
  if (pungKindSet(counts, melds, WIND_K).size === 4) return 'Big Four Winds';
  if (ctx.heaven) return 'Blessing of Heaven';
  if (ctx.firstDiscardOfHand) return 'Blessing of Earth';
  return null;
}

export function scoreHand(concealed: number[], melds: Meld[], ctx: ScoreContext, winningKind: number): HandScore {
  const limit = ctx.limit ?? DEFAULT_LIMIT;
  const counts = countsOf(concealed);

  const limitName = limitHandName(counts, melds, ctx);
  if (limitName) {
    const points =
      limitName === 'Thirteen Orphans' ? LIMIT_HAND_POINTS.thirteenOrphans
      : limitName === 'Nine Gates' ? LIMIT_HAND_POINTS.nineGates
      : limitName === 'Big Three Dragons' ? LIMIT_HAND_POINTS.bigThreeDragons
      : limitName === 'Big Four Winds' ? LIMIT_HAND_POINTS.bigFourWinds
      : limitName === 'Blessing of Heaven' ? LIMIT_HAND_POINTS.blessingOfHeaven
      : LIMIT_HAND_POINTS.blessingOfEarth;
    return {
      fan: 13,
      miniPoints: points,
      doubles: [{ label: limitName, value: 13 }],
      bonusPoints: [],
      points,
      limit: true,
      qualifying: true,
      patternLabels: [limitName],
    };
  }

  const candidates = decompositions(counts, melds.length);
  if (!candidates.length) {
    return { fan: 0, miniPoints: 0, doubles: [], bonusPoints: [], points: 0, limit: false, qualifying: false, patternLabels: [] };
  }

  let best: { points: number; cand: Candidate; fan: number } | null = null;
  for (const d of candidates) {
    const cand = evaluate(d, melds, counts, ctx, winningKind);
    const fan = cand.doubles.reduce((a, b) => a + b.value, 0);
    const raw = cand.mini * Math.pow(2, Math.min(fan, 13));
    const points = Math.min(limit, Math.round(raw));
    if (!best || points > best.points) best = { points, cand, fan };
  }

  const fan = best!.fan;
  return {
    fan,
    miniPoints: best!.cand.mini,
    doubles: best!.cand.doubles,
    bonusPoints: best!.cand.bonus,
    points: best!.points,
    limit: best!.points >= limit,
    qualifying: fan >= (ctx.minFan ?? DEFAULT_MIN_FAN),
    patternLabels: best!.cand.labels,
  };
}

/** Bonus tiles are never part of a hand: they sit aside and score. */
export function isBonusKind(k: number): boolean {
  return isBonus(k);
}
