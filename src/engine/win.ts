import type { Meld } from './types';

export interface Decomposition {
  sets: { type: 'chow' | 'pung'; k: number }[];
  pair: number;
}

/**
 * Enumerate valid 4-sets-plus-a-pair decompositions of a *concealed* hand.
 * Called melds are supplied through `meldCount`, so `need = 4 - meldCount`.
 * Capped at `limit` results: the scorer only needs the best few.
 */
export function decompositions(counts: number[], meldCount: number, limit = 32): Decomposition[] {
  const need = 4 - meldCount;
  const out: Decomposition[] = [];
  const c = counts.slice();

  const walk = (from: number, sets: { type: 'chow' | 'pung'; k: number }[], pairKind: number) => {
    if (out.length >= limit) return;
    let idx = from;
    while (idx < 34 && c[idx] === 0) idx++;
    if (idx >= 34) {
      if (sets.length === need && c.every((x) => x === 0)) {
        out.push({ sets: sets.slice(), pair: pairKind });
      }
      return;
    }
    if (sets.length >= need) return;

    if (c[idx] >= 3) {
      c[idx] -= 3;
      sets.push({ type: 'pung', k: idx });
      walk(idx, sets, pairKind);
      sets.pop();
      c[idx] += 3;
    }
    if (idx <= 26 && idx % 9 <= 6 && c[idx + 1] > 0 && c[idx + 2] > 0) {
      c[idx]--; c[idx + 1]--; c[idx + 2]--;
      sets.push({ type: 'chow', k: idx });
      walk(idx, sets, pairKind);
      sets.pop();
      c[idx]++; c[idx + 1]++; c[idx + 2]++;
    }
  };

  for (let p = 0; p < 34 && out.length < limit; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    walk(0, [], p);
    c[p] += 2;
  }
  return out;
}

export const THIRTEEN_ORPHAN_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

export function isThirteenOrphans(counts: number[], meldCount: number): boolean {
  if (meldCount !== 0) return false;
  let pair = false;
  for (const k of THIRTEEN_ORPHAN_KINDS) {
    if (counts[k] === 0) return false;
    if (counts[k] >= 2) pair = true;
    if (counts[k] > 2) return false;
  }
  return pair && counts.reduce((a, b) => a + b, 0) === 14;
}

/** Nine Gates: concealed 1112345678999 of one suit plus one duplicate in that suit. */
export function isNineGates(counts: number[], meldCount: number): boolean {
  if (meldCount !== 0) return false;
  for (let s = 0; s < 3; s++) {
    const base = s * 9;
    let total = 0;
    for (let i = 0; i < 9; i++) total += counts[base + i];
    if (total !== 14) continue;
    let ok = true;
    for (let k = 0; k < 34; k++) {
      if ((k < base || k >= base + 9) && counts[k] > 0) { ok = false; break; }
    }
    if (!ok) continue;
    const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    for (let i = 0; i < 9; i++) if (counts[base + i] < need[i]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

export function isWinningCounts(counts: number[], meldCount: number): boolean {
  const expected = 14 - meldCount * 3;
  if (counts.reduce((a, b) => a + b, 0) !== expected) return false;
  if (isThirteenOrphans(counts, meldCount)) return true;
  if (isNineGates(counts, meldCount)) return true;
  return decompositions(counts, meldCount, 1).length > 0;
}

/** Every kind that would complete the hand (does not check tile availability). */
export function winningKinds(counts: number[], meldCount: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < 34; k++) {
    if (counts[k] >= 4) continue;
    counts[k]++;
    if (isWinningCounts(counts, meldCount)) out.push(k);
    counts[k]--;
  }
  return out;
}

export function meldCountOf(melds: Meld[]): number {
  return melds.length;
}
