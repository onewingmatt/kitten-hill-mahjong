import type { Meld } from '../types';
import { DRAGON_K, WIND_K, kind } from '../tiles';

/** One reason the current shape scores, and whether it is already banked. */
export interface FanLine {
  label: string;
  /** What this line contributes to the estimate (fractional while in progress). */
  value: number;
  /** True when the shape has actually achieved it, false while it is one tile off. */
  ready: boolean;
}

const SUIT_NAMES = ['dots', 'bamboo', 'characters'];

/**
 * The itemised version of the estimate below: the same arithmetic, with every
 * award named so the table can explain itself.
 *
 * `estimateFan` is exactly the sum of these values. Keep them one function, or
 * the cats start steering by a different number than the fanmeter shows.
 */
export function fanBreakdown(
  counts: number[],
  melds: Meld[],
  wind: number,
  roundWind: number,
): FanLine[] {
  const all: number[] = [];
  for (let k = 0; k < 34; k++) for (let i = 0; i < counts[k]; i++) all.push(k);
  for (const m of melds) all.push(m.k, m.k, m.k);
  const total = Math.max(1, all.length);
  const lines: FanLine[] = [];

  const suitCount = [0, 0, 0];
  let honours = 0;
  for (const k of all) {
    if (k <= 26) suitCount[Math.floor(k / 9)]++;
    else honours++;
  }
  const share = Math.max(...suitCount) / total;
  const mainSuit = SUIT_NAMES[suitCount.indexOf(Math.max(...suitCount))];

  if (honours === 0 && share >= 0.97) {
    lines.push({ label: `One suit: ${mainSuit}`, value: 3, ready: true });
  } else if (share >= 0.6) {
    lines.push({
      label: `Mostly ${mainSuit} — ${Math.round(share * 100)}%`,
      value: 1,
      ready: false,
    });
  }

  const setCounts = counts.slice();
  for (const m of melds) if (m.type !== 'chow') setCounts[m.k] = Math.max(setCounts[m.k], 3);
  for (const k of DRAGON_K) {
    if (setCounts[k] >= 3) lines.push({ label: `${kind(k).label} pung`, value: 1, ready: true });
    else if (setCounts[k] === 2) lines.push({ label: `${kind(k).label} pair`, value: 0.45, ready: false });
  }
  // your own wind and the round wind can be the same tile — then it doubles twice,
  // which is why this loop pushes two lines with the same kind
  for (const k of [WIND_K[wind], WIND_K[roundWind]]) {
    const who = k === WIND_K[wind] ? 'seat' : 'round';
    if (setCounts[k] >= 3) lines.push({ label: `${kind(k).label} pung (${who})`, value: 1, ready: true });
    else if (setCounts[k] === 2) lines.push({ label: `${kind(k).label} pair (${who})`, value: 0.35, ready: false });
  }

  let sets = 0;
  let pairs = 0;
  for (let k = 0; k < 34; k++) {
    if (counts[k] >= 3) sets++;
    else if (counts[k] === 2) pairs++;
  }
  for (const m of melds) if (m.type !== 'chow') sets++;
  if (sets >= 3 && pairs >= 1) lines.push({ label: 'Three pungs and a pair', value: 1, ready: false });

  return lines;
}

/**
 * Rough "how many doubles is this shape heading for" estimate.
 *
 * It is deliberately not a real score: it exists so a cat can tell the
 * difference between a hand that will clear the 3-double table minimum and one
 * that can never be declared, and steer toward the former.
 */
export function estimateFan(counts: number[], melds: Meld[], wind: number, roundWind: number): number {
  return fanBreakdown(counts, melds, wind, roundWind).reduce((sum, line) => sum + line.value, 0);
}
