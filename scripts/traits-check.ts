/**
 * Every axis of the play-style vector has to change a decision.
 *
 *   npx tsx scripts/traits-check.ts
 *
 * The personality is only worth measuring if it reaches the bot: this sweep sets
 * each axis to an extreme, replays a fixed corpus of positions, and counts how
 * many decisions moved. A trait with zero flips is decorative — it is measured,
 * encoded in the share code, and ignored. That is the failure this gate exists
 * to catch.
 */
import { applyAction, createHand } from '../src/engine/game';
import { chooseClaim, chooseDiscard, choosePlan } from '../src/engine/bots/bot';
import { countsOf } from '../src/engine/shanten';
import { NEUTRAL, personalityFromStats, type PlayStats } from '../src/client/stats';
import type { GameState, Personality } from '../src/engine/types';
import { emptyStats, recordClaimOffer, recordHand, recordThrow } from '../src/client/stats';
import { encodePersonality, decodePersonality } from '../src/engine/bots/personality';

const P = (o: Partial<Personality>): Personality => ({ ...NEUTRAL, ...o });

/** A fresh deal with seat 0 on turn holding fourteen. */
const turnState = (seed: number): GameState => {
  const s = createHand({ seed, dealer: 0 });
  s.turn = 0;
  s.phase = 'discard';
  return s;
};

/** A hand already deep in one suit, so greed/flush commitment has something to chew on. */
const flushState = (seed: number, suit: number): GameState => {
  const s = turnState(seed);
  const base = suit * 9;
  const others = [0, 1, 2].filter((x) => x !== suit).map((x) => x * 9);
  // exactly nine of one suit and two honours: `pure` is a decision here
  // (greed > .85 and inSuit >= 9), not something the tile count forces
  s.seats[0].hand = [
    base, base + 1, base + 2, base + 3, base + 4, base + 5, base + 6, base + 7, base + 8,
    27, 31,
    others[0] + 3, others[1] + 4, others[0] + 6,
  ];
  return s;
};

/** Thirteen-orphans shaped: eleven unique terminals/honours. */
const kokushiState = (seed: number): GameState => {
  const s = turnState(seed);
  // eleven unique terminals/honours (the plan's gate) plus three middle tiles it
  // would want gone — without those, the plan cannot change a discard at all
  s.seats[0].hand = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 3, 12, 0];
  return s;
};

/** Seat 0 is offered the tile seat 3 throws. */
const claimState = (seed: number, k: number): GameState => {
  const s = createHand({ seed, dealer: 2 });
  s.turn = 3;
  s.phase = 'discard';
  s.seats[3].hand = [...s.seats[3].hand.slice(0, 13), k];
  s.seats[0].hand = [k, k, 0, 4, 8, 12, 16, 20, 24, 27, 28, 31, 32];
  return applyAction(s, { type: 'discard', seat: 3, k });
};

/** Seat 0 is offered a run through the tile seat 3 throws. */
const chiState = (seed: number, k: number): GameState => {
  const s = createHand({ seed, dealer: 2 });
  s.turn = 3;
  s.phase = 'discard';
  s.seats[3].hand = [...s.seats[3].hand.slice(0, 13), k];
  const rank = k % 9;
  const a = rank >= 2 ? k - 1 : k + 1;
  const b = rank <= 6 ? k + 2 : k - 1;
  s.seats[0].hand = [a, b, 0, 4, 8, 12, 16, 20, 24, 27, 28, 31].filter((x) => x !== k);
  return applyAction(s, { type: 'discard', seat: 3, k });
};

const normalHands = Array.from({ length: 60 }, (_, i) => turnState(500 + i * 3));
const flankHands = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => flushState(700 + i, i % 3));
const kokushiHands = [0, 1, 2, 3, 4, 5].map((i) => kokushiState(900 + i));
const ponOffers = [0, 4, 8, 12, 16, 20, 24, 27, 31, 32].flatMap((k) => [1, 2, 3].map((n) => claimState(1000 + n, k)));
const chiOffers = [16, 17, 18, 19, 20, 21, 22, 23].flatMap((k) => [1, 2].map((n) => chiState(1100 + n, k)));

const discards = (p: Personality) => normalHands.map((s) => chooseDiscard(s, 0, p).k);
const flankDiscards = (p: Personality) => flankHands.map((s) => chooseDiscard(s, 0, p).k);
const kokushiDiscards = (p: Personality) => kokushiHands.map((s) => chooseDiscard(s, 0, p).k);
/** Greed commits a hand to a plan before it changes a tile: the plan IS the decision. */
const plans = (p: Personality) =>
  flankHands.map((s) => {
    const plan = choosePlan(countsOf(s.seats[0].hand), [], p, 0, 0, s.wall.length);
    return `${plan.kind}:${plan.offPlan.length}`;
  });
const claims = (p: Personality) => [...ponOffers, ...chiOffers].map((s) => chooseClaim(s, 0, p).type ?? 'pass');

const count = (a: Array<string | number>, b: Array<string | number>): number =>
  a.reduce<number>((n, v, i) => n + (String(v) !== String(b[i]) ? 1 : 0), 0);

interface Axis {
  id: string;
  /** Two settings to compare: the neutral value and an extreme. */
  variants: Personality[];
  sample: (p: Personality) => string[] | number[];
  /** Minimum decisions that must move. */
  min: number;
  note?: string;
}

const axes: Axis[] = [
  { id: 'setBias', variants: [P({ setBias: 0.05 }), P({ setBias: 0.95 })], sample: discards, min: 6 },
  { id: 'claimAppetite', variants: [P({ aggression: 0.05 }), P({ aggression: 0.95 })], sample: claims, min: 10 },
  { id: 'caution', variants: [P({ caution: 0.05 }), P({ caution: 0.95 })], sample: discards, min: 3 },
  { id: 'efficiency', variants: [P({ efficiency: 1 }), P({ efficiency: 0.35 })], sample: discards, min: 8, note: 'the second-best line' },
  { id: 'honourLoyalty', variants: [P({ honourLoyalty: 0.05 }), P({ honourLoyalty: 0.95 })], sample: discards, min: 4 },
  { id: 'suits', variants: [P({ suits: [2.4, 0.5, 0.5] }), P({ suits: [0.5, 2.4, 0.5] })], sample: discards, min: 10 },
  { id: 'greed', variants: [P({ greed: 0.05 }), P({ greed: 0.95 })], sample: plans, min: 2, note: 'plan commitment on flush hands' },
  { id: 'limitHunter', variants: [P({ limitHunter: 0.1 }), P({ limitHunter: 0.9 })], sample: kokushiDiscards, min: 2, note: 'thirteen-orphans hands' },
  { id: 'tilt', variants: [P({ tilt: 0.1 }), P({ tilt: 0.6 })], sample: discards, min: 3 },
];

console.log('axis            moves / sample   required   note');
let failed = 0;
for (const axis of axes) {
  const [a, b] = axis.variants;
  const moved = count(axis.sample(a), axis.sample(b));
  const size = axis.sample(a).length;
  const ok = moved >= axis.min;
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${axis.id.padEnd(14)} ${String(moved).padStart(3)} / ${String(size).padEnd(10)} ${String(axis.min).padStart(6)}     ${axis.note ?? ''}`,
  );
}

// Two measured players must not play the same game.
const style = (o: Partial<PlayStats>): PlayStats => ({ ...emptyStats(), ...o });
const timid = personalityFromStats(style({ hands: 12, claimOffers: 40, claims: { chi: 0, pon: 0, kan: 0 }, throwsBySuit: [20, 20, 20, 20], dangerAccepted: 4, dangerAvailable: 4, scoredThrows: 40, efficientThrows: 40 }));
const bold = personalityFromStats(style({ hands: 12, claimOffers: 40, claims: { chi: 4, pon: 26, kan: 0 }, throwsBySuit: [15, 15, 15, 25], dangerAccepted: 30, dangerAvailable: 6, scoredThrows: 40, efficientThrows: 26 }));
const styleGap = count(claims(timid), claims(bold)) + count(discards(timid), discards(bold));
console.log(`\ntwo measured styles: ${styleGap} decisions apart (sets ${encodePersonality(timid)} vs ${encodePersonality(bold)})`);
if (styleGap < 10) failed += 1;

// The share code has to survive the trip.
for (const p of [timid, bold, NEUTRAL]) {
  const code = encodePersonality(p);
  const back = decodePersonality(code);
  const drift = back
    ? Math.abs(back.setBias - p.setBias) + Math.abs(back.efficiency - p.efficiency) + Math.abs(back.suits[0] - p.suits[0])
    : 99;
  if (!back || drift > 0.2 || code.length !== 13) {
    failed += 1;
    console.log(`FAIL code round-trip for ${code} (len ${code.length}, drift ${drift.toFixed(2)})`);
  }
}
console.log(failed ? `\n${failed} trait check(s) failed` : '\nall trait checks pass');
(globalThis as { process?: { exitCode?: number } }).process!.exitCode = failed ? 1 : 0;
