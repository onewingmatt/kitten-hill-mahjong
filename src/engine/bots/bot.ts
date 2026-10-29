import type { ClaimOption } from '../game';
import { claimsFor, selfKongKinds, canSelfWin } from '../game';
import type { ClaimType, GameState, Meld, Personality } from '../types';
import { countsOf, shanten, shantenByDiscard } from '../shanten';
import { DRAGON_K, THIRTEEN_ORPHAN_SET, WIND_K, isHonour, isSuit, rankOf, suitOf } from '../tiles';
import { estimateFan } from './fan-estimate';

/**
 * Baseline bot policy: sound, cheap, deterministic. Personality bends it — it
 * never replaces it, so even the wildest cat does not make illegal or absurd
 * plays, only *opinionated* ones.
 */

/** Copies of each kind the whole table can see: discards, melds, own hand. */
export function visibleCounts(s: GameState, seat: number): number[] {
  const v = new Array(34).fill(0);
  for (const p of s.seats) {
    for (const k of p.discards) v[k]++;
    for (const m of p.melds) for (const t of m.tiles) v[t]++;
    if (p.seat === seat) for (const k of p.hand) v[k]++;
  }
  return v;
}

/** Crude deal-in estimate: honour tiles are only safe once the copies show. */
export function dangerOf(k: number, visible: number[]): number {
  if (isHonour(k)) {
    if (visible[k] >= 3) return 0.05;
    if (visible[k] === 2) return 0.3;
    if (visible[k] === 1) return 0.65;
    return 0.95;
  }
  const r = rankOf(k);
  const base = r === 1 || r === 9 ? 0.35 : r === 2 || r === 8 ? 0.6 : 1;
  const damping = Math.max(0.15, 1 - 0.18 * visible[k]);
  return base * damping;
}

/** How much a tile in hand is worth keeping, before personality. */
function baseUtility(counts: number[], k: number, meldCount: number): number {
  const c = counts[k];
  let u = 0;
  if (c >= 3) u += 26;
  else if (c === 2) u += 11;
  else u += 1;
  if (isSuit(k)) {
    const suit = suitOf(k)!;
    const rank = rankOf(k);
    const lo = suit * 9;
    const neighbour = (i: number) => (i >= 0 && i < 9 ? counts[lo + i] : 0);
    u += neighbour(rank - 2) * 4 + neighbour(rank) * 5 + neighbour(rank + 1) * 4;
    if (rank >= 2 && rank <= 8) u += 2;
    if (rank === 1 || rank === 9) u -= 1;
  }
  if (c === 2 && meldCount >= 3) u += 6;
  return u;
}

/* ------------------------------------------------------------------ */
/* Hand plans                                                          */
/* ------------------------------------------------------------------ */

/** Tunable weights, exported so the tuning harness can scan them. */
export const BOT_TUNING = {
  /** Cost of one step of global shanten. */
  shanten: 340,
  /** Cost of holding one off-plan tile. Must exceed `shanten` to matter. */
  offPlan: 320,
  /** Value of each point of estimated doubles. */
  fan: 22,
  /** Weight on deal-in risk. */
  danger: 26,
};

export type PlanKind = 'pure' | 'half' | 'vanilla' | 'kokushi';

export interface Plan {
  kind: PlanKind;
  /** Suit the hand is committing to, -1 for a mixed hand. */
  suit: number;
  /** Doubles this plan is aiming at. */
  fanTarget: number;
  /** Kinds the plan wants thrown away. */
  offPlan: number[];
}

/**
 * Commit to a shape. At a 3-double table a hand that only chases shanten can
 * never be declared, so the cats pick a suit and then rush it.
 */
export function choosePlan(
  counts: number[],
  melds: Meld[],
  p: Personality,
  wind: number,
  roundWind: number,
  wallLeft = 60,
): Plan {
  const suitCount = [0, 0, 0];
  let honourTiles = 0;
  for (let k = 0; k < 34; k++) {
    if (isSuit(k)) suitCount[suitOf(k)!] += counts[k];
    else honourTiles += counts[k];
  }

  if (melds.length === 0 && p.limitHunter > 0.6) {
    let uniq = 0;
    for (const k of THIRTEEN_ORPHAN_SET) if (counts[k] > 0) uniq++;
    if (uniq >= 11) {
      const offPlan: number[] = [];
      for (let k = 0; k < 34; k++) if (counts[k] && !THIRTEEN_ORPHAN_SET.has(k)) offPlan.push(k);
      return { kind: 'kokushi', suit: -1, fanTarget: 13, offPlan };
    }
  }

  let bestSuit = 0;
  let bestScore = -Infinity;
  for (let s = 0; s < 3; s++) {
    const score = suitCount[s] + p.suits[s] * 1.6 + (suitCount[s] >= 5 ? 1 : 0);
    if (score > bestScore) { bestScore = score; bestSuit = s; }
  }

  const inSuit = suitCount[bestSuit];
  // Greedy cats commit to one suit even from a thin holding.
  // A pure flush needs ~14 tiles of one suit out of ~19 draws. Only commit when
  // the holding is already most of the way there.
  const pure = inSuit >= 10 || (p.greed > 0.85 && inSuit >= 9 && honourTiles <= 2);

  const honourPotential = estimateFan(counts, melds, wind, roundWind);
  const fanTarget = pure ? 3 : Math.max(1, honourPotential);

  const offPlan: number[] = [];
  for (let k = 0; k < 34; k++) {
    if (!counts[k]) continue;
    if (isSuit(k)) {
      if (suitOf(k) !== bestSuit) offPlan.push(k);
      continue;
    }
    if (pure) { offPlan.push(k); continue; }
    const pairish = counts[k] >= 2;
    const valuable = DRAGON_K.includes(k) || k === WIND_K[wind] || k === WIND_K[roundWind];
    // Honour pairs are the cheapest doubles on the table: keep them. Single
    // honours are worth a punt while there is still wall to pair them from.
    const early = wallLeft > 34;
    if (pairish) continue;
    if (valuable && (early || p.honourLoyalty > 0.6)) continue;
    if (early && p.honourLoyalty > 0.45) continue;
    offPlan.push(k);
  }

  const kind: PlanKind = pure ? 'pure' : offPlan.length ? 'half' : 'vanilla';
  return { kind, suit: bestSuit, fanTarget, offPlan };
}

function offPlanTileCount(counts: number[], plan: Plan): number {
  let n = 0;
  for (const k of plan.offPlan) n += counts[k];
  return n;
}

export interface DiscardChoice {
  k: number;
  shanten: number;
  score: number;
  reason: string;
  plan: Plan;
  off: number;
}

/** Pick the tile to throw. */
export function chooseDiscard(s: GameState, seat: number, p: Personality): DiscardChoice {
  const player = s.seats[seat];
  const counts = countsOf(player.hand);
  const meldCount = player.melds.length;
  const visible = visibleCounts(s, seat);
  const before = shanten(counts, meldCount);
  const byDiscard = shantenByDiscard(counts, meldCount);
  const wind = (seat - s.dealer + 4) % 4;
  const plan = choosePlan(counts, player.melds, p, wind, s.roundWind, s.wall.length);
  const planNow = estimateFan(counts, player.melds, wind, s.roundWind);
  const fanWeight = BOT_TUNING.fan * (0.8 + 0.7 * p.greed);
  const offWeight = BOT_TUNING.offPlan;

  let best: DiscardChoice | null = null;
  for (const [k, after] of byDiscard) {
    const keeps = counts.slice();
    keeps[k]--;
    let flavour = -after * BOT_TUNING.shanten;

    // Plan adherence: dump off-suit junk early and hard.
    const off = offPlanTileCount(keeps, plan);
    flavour -= off * offWeight;
    flavour += plan.fanTarget * fanWeight * 0.35;

    // Personality weights on what stays in the hand.
    flavour += baseUtility(keeps, k, meldCount) * 0.35;
    flavour -= baseUtility(counts, k, meldCount) * (0.3 + 0.3 * p.setBias);
    if (counts[k] >= 2) flavour += p.setBias * 8 - (1 - p.setBias) * 4;
    if (isHonour(k) && counts[k] >= 2) {
      const honourLove = DRAGON_K.includes(k) ? p.honourLoyalty : WIND_K.includes(k) ? p.honourLoyalty * 0.7 : 0;
      flavour += honourLove * 12;
    }
    if (isSuit(k)) flavour += p.suits[suitOf(k)!] * (counts[k] > 1 ? 3 : 2);
    flavour += estimateFan(keeps, player.melds, wind, s.roundWind) * fanWeight;

    // Safety: a guarded cat eats a little speed to stop the bleeding.
    flavour -= dangerOf(k, visible) * p.caution * BOT_TUNING.danger;

    // Hold tenpai when it is worth holding.
    if (before === 0 && after > 0) flavour -= 320;
    if (before === 0 && after === 0) flavour += 30;

    const reason =
      after > before + 1 ? 'rebuild' :
      before === 0 && after === 0 ? 'stay ready' :
      counts[k] >= 2 ? 'break a pair' : plan.offPlan.includes(k) ? 'off plan' : 'loose tile';

    if (!best || flavour > best.score || (flavour === best.score && dangerOf(k, visible) < dangerOf(best.k, visible))) {
      best = { k, shanten: after, score: flavour, reason, plan, off };
    }
  }
  if (!best) throw new Error('no discard available');
  return best;
}

export interface ClaimDecision {
  type: ClaimType | null;
  withKinds?: number[];
  why: string;
}

/** What this cat does about the tile on offer. */
export function chooseClaim(s: GameState, seat: number, p: Personality): ClaimDecision {
  const opts: ClaimOption[] = claimsFor(s, seat);
  if (!opts.length) return { type: null, why: 'nothing to call' };

  const hu = opts.find((o) => o.type === 'hu');
  if (hu) return { type: 'hu', why: 'win it' };

  const player = s.seats[seat];
  const counts = countsOf(player.hand);
  const meldCount = player.melds.length;
  const before = shanten(counts, meldCount);
  const wind = (seat - s.dealer + 4) % 4;
  const plan = choosePlan(counts, player.melds, p, wind, s.roundWind, s.wall.length);
  const offered = s.pending!.k;

  // A pung of a dragon or of a value wind is a double on the spot.
  const honourPung =
    opts.find((o) => (o.type === 'pon' || o.type === 'kan') &&
      (DRAGON_K.includes(offered) || offered === WIND_K[wind] || offered === WIND_K[s.roundWind]));
  if (honourPung) {
    return { type: honourPung.type, why: 'take the double' };
  }

  if (plan.kind === 'kokushi') return { type: null, why: 'concealed only' };
  if (plan.kind !== 'vanilla' && plan.offPlan.includes(offered)) {
    return { type: null, why: 'off plan' };
  }
  if (plan.kind === 'pure' && isSuit(offered) && suitOf(offered) !== plan.suit) {
    return { type: null, why: 'wrong suit' };
  }

  const gainOf = (o: ClaimOption): number => {
    const c = counts.slice();
    const used = o.type === 'chi' ? o.withKinds! : [offered];
    for (const u of used) c[u] -= o.type === 'pon' ? 2 : o.type === 'kan' ? 3 : 1;
    return before - shanten(c, meldCount + 1);
  };

  const kan = opts.find((o) => o.type === 'kan');
  if (kan && (p.setBias > 0.6 || p.aggression > 0.65) && gainOf(kan) >= 0) {
    return { type: 'kan', why: 'kong the offer' };
  }
  const pon = opts.find((o) => o.type === 'pon');
  if (pon) {
    const gain = gainOf(pon);
    const appetite = p.aggression * 0.55 + p.setBias * 0.6 - p.caution * 0.3 + p.greed * 0.15;
    if (gain >= 2 || (gain >= 1 && appetite > 0.5)) return { type: 'pon', why: 'pung it up' };
  }
  const chi = opts.find((o) => o.type === 'chi');
  if (chi) {
    const gain = gainOf(chi);
    const appetite = p.aggression * 0.55 + (1 - p.setBias) * 0.5 - p.greed * 0.25;
    if (gain >= 2 || (gain >= 1 && appetite > 0.6)) return { type: 'chi', withKinds: chi.withKinds, why: 'run it out' };
  }
  return { type: null, why: 'hold' };
}

/** Should the cat kong from its own hand right now? */
export function chooseSelfKong(s: GameState, seat: number, p: Personality): number | null {
  if (canSelfWin(s, seat).ok) return null;
  const kinds = selfKongKinds(s, seat);
  if (!kinds.length) return null;
  const counts = countsOf(s.seats[seat].hand);
  const plan = choosePlan(counts, s.seats[seat].melds, p, (seat - s.dealer + 4) % 4, s.roundWind, s.wall.length);
  if (plan.kind === 'kokushi') return null;
  const k = kinds[0];
  if (plan.kind === 'pure' && (!isSuit(k) || suitOf(k) !== plan.suit)) return null;
  if (p.setBias > 0.7 || p.honourLoyalty > 0.8) return k;
  if (p.aggression > 0.75 && p.caution < 0.4) return k;
  return null;
}

/** Declare a self-drawn win whenever it is legal and worth points. */
export function wantsSelfWin(s: GameState, seat: number): boolean {
  return canSelfWin(s, seat).ok;
}
