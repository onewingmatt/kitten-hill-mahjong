import type { Meld } from '../types';
import { DRAGON_K, WIND_K } from '../tiles';

/**
 * Rough "how many doubles is this shape heading for" estimate.
 *
 * It is deliberately not a real score: it exists so a cat can tell the
 * difference between a hand that will clear the 3-double table minimum and one
 * that can never be declared, and steer toward the former.
 */
export function estimateFan(counts: number[], melds: Meld[], wind: number, roundWind: number): number {
  const all: number[] = [];
  for (let k = 0; k < 34; k++) for (let i = 0; i < counts[k]; i++) all.push(k);
  for (const m of melds) all.push(m.k, m.k, m.k);
  const total = Math.max(1, all.length);

  const suitCount = [0, 0, 0];
  let honours = 0;
  for (const k of all) {
    if (k <= 26) suitCount[Math.floor(k / 9)]++;
    else honours++;
  }
  const share = Math.max(...suitCount) / total;

  let fan = 0;
  if (honours === 0 && share >= 0.97) fan += 3;
  else if (share >= 0.6) fan += 1;

  const setCounts = counts.slice();
  for (const m of melds) if (m.type !== 'chow') setCounts[m.k] = Math.max(setCounts[m.k], 3);
  for (const k of DRAGON_K) {
    if (setCounts[k] >= 3) fan += 1;
    else if (setCounts[k] === 2) fan += 0.45;
  }
  for (const k of [WIND_K[wind], WIND_K[roundWind]]) {
    if (setCounts[k] >= 3) fan += 1;
    else if (setCounts[k] === 2) fan += 0.35;
  }

  let sets = 0;
  let pairs = 0;
  for (let k = 0; k < 34; k++) {
    if (counts[k] >= 3) sets++;
    else if (counts[k] === 2) pairs++;
  }
  for (const m of melds) if (m.type !== 'chow') sets++;
  if (sets >= 3 && pairs >= 1) fan += 1;

  return fan;
}
