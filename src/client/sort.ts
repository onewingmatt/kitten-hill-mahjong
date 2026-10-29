import { isSuit, rankOf, suitOf } from '../engine/tiles';

/**
 * `manual` is the default: the hand is the player's to arrange, so nothing is
 * ever reordered behind their back. The other modes are opt-in tidying.
 */
export type SortMode = 'manual' | 'suit' | 'rank' | 'sets';

/**
 * Apply a remembered hand order to the current tiles. Entries that are no
 * longer held drop out; new tiles (a fresh draw) land at the end, which is
 * exactly where a human puts them.
 */
export function reconcileOrder(order: number[], hand: number[]): number[] {
  const pool = new Map<number, number>();
  for (const k of hand) pool.set(k, (pool.get(k) ?? 0) + 1);
  const out: number[] = [];
  for (const k of order) {
    const c = pool.get(k) ?? 0;
    if (c > 0) {
      out.push(k);
      pool.set(k, c - 1);
    }
  }
  for (const [k, c] of [...pool].sort((a, b) => a[0] - b[0])) {
    for (let i = 0; i < c; i++) out.push(k);
  }
  return out;
}

/** Move one tile to a new slot in a hand order. */
export function moveInOrder(order: number[], from: number, to: number): number[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return order;
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Three ways to read a hand. `suit` is the classic wash (suit runs), `rank`
 * lines up numbers across suits, and `sets` pulls the tiles that already
 * belong together to the front so a twelve-tile hand is easy to scan.
 */
export function sortHand(hand: number[], mode: SortMode): number[] {
  const a = hand.slice();
  if (mode === 'manual') return a.sort((x, y) => x - y);
  if (mode === 'rank') {
    return a.sort((x, y) => rankOf(x) - rankOf(y) || weight(x) - weight(y));
  }
  if (mode === 'suit') return a.sort((x, y) => weight(x) - weight(y));
  return sortBySets(a);
}

/** Sort key: dots, bamboo, chars, winds, dragons. */
function weight(k: number): number {
  return isSuit(k) ? k : 100 + k;
}

function sortBySets(hand: number[]): number[] {
  const counts = new Map<number, number>();
  for (const k of hand) counts.set(k, (counts.get(k) ?? 0) + 1);

  const used = new Map<number, number>();
  const take = (k: number, n: number) => {
    used.set(k, (used.get(k) ?? 0) + n);
  };
  const left = (k: number) => (counts.get(k) ?? 0) - (used.get(k) ?? 0);

  const blocks: number[][] = [];

  // Triplets, then pairs, then runs, then singles.
  for (const [k, c] of [...counts].sort((x, y) => weight(x[0]) - weight(y[0]))) {
    if (c >= 3) {
      blocks.push([k, k, k]);
      take(k, 3);
      if (c === 4) {
        blocks.push([k]);
        take(k, 1);
      }
    }
  }
  for (const [k, c] of [...counts].sort((x, y) => weight(x[0]) - weight(y[0]))) {
    if (left(k) >= 2) {
      blocks.push([k, k]);
      take(k, 2);
    }
  }
  for (const [k] of [...counts].sort((x, y) => weight(x[0]) - weight(y[0]))) {
    if (!isSuit(k)) continue;
    let run: number[] = [];
    for (let n = k; n < k + 3 && isSuit(n) && suitOf(n) === suitOf(k); n++) {
      if (left(n) > 0) run.push(n);
    }
    if (run.length === 3) {
      blocks.push(run);
      for (const t of run) take(t, 1);
    }
  }
  for (const [k] of [...counts].sort((x, y) => weight(x[0]) - weight(y[0]))) {
    while (left(k) > 0) {
      blocks.push([k]);
      take(k, 1);
    }
  }
  return blocks.flat();
}

/** Human-readable tile name for logs, buttons and screen readers. */
export function tileName(k: number, label: string): string {
  return label;
}
