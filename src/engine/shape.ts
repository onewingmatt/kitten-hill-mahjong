import { rankOf, suitOf } from './tiles';
import { countsOf, shanten, shantenByDiscard } from './shanten';

export type BlockShape = 'set' | 'pair' | 'run' | 'partial' | 'single';

export interface Block {
  shape: BlockShape;
  /** Kinds in the block, 1..3 entries. A quad reads as a set plus a spare. */
  tiles: number[];
}

/**
 * Read a hand the way a player reads it: which tiles already belong together,
 * which are one tile short, and which are sitting on their own.
 *
 * Greedy on purpose. The goal is a legible reading, not the optimal
 * decomposition — a hand should look the same to the player every time they
 * raise it, and an exact solver can flip between equally good answers.
 *
 * Order of claims: sets, runs, pairs, half-runs, then everything lonely.
 */
export function decompose(hand: number[]): Block[] {
  const counts = new Map<number, number>();
  for (const k of hand) counts.set(k, (counts.get(k) ?? 0) + 1);
  const left = new Map(counts);
  const blocks: Block[] = [];
  const kinds = [...counts.keys()].sort((a, b) => a - b);
  const have = (k: number) => left.get(k) ?? 0;
  const take = (k: number, n: number) => left.set(k, have(k) - n);

  // three or four of a kind
  for (const k of kinds) {
    if (have(k) >= 3) {
      blocks.push({ shape: 'set', tiles: [k, k, k] });
      take(k, 3);
    }
    if (have(k) === 1 && (counts.get(k) ?? 0) === 4) {
      blocks.push({ shape: 'single', tiles: [k] });
      take(k, 1);
    }
  }

  // runs of three, lowest rank first
  for (const k of kinds) {
    const s = suitOf(k);
    if (s === null) continue;
    while (have(k) > 0 && rankOf(k) <= 7 && suitOf(k + 1) === s && suitOf(k + 2) === s && have(k + 1) > 0 && have(k + 2) > 0) {
      blocks.push({ shape: 'run', tiles: [k, k + 1, k + 2] });
      take(k, 1); take(k + 1, 1); take(k + 2, 1);
    }
  }

  // pairs
  for (const k of kinds) {
    if (have(k) === 2) {
      blocks.push({ shape: 'pair', tiles: [k, k] });
      take(k, 2);
    }
  }

  // half-runs: side by side first, then one apart
  for (const k of kinds) {
    if (have(k) !== 1) continue;
    const s = suitOf(k);
    if (s === null) continue;
    for (const gap of [1, 2]) {
      const p = k + gap;
      if (have(p) === 1 && suitOf(p) === s) {
        blocks.push({ shape: 'partial', tiles: [k, p] });
        take(k, 1); take(p, 1);
        break;
      }
    }
  }

  // whatever is left
  for (const k of kinds) {
    for (let i = 0; i < have(k); i++) blocks.push({ shape: 'single', tiles: [k] });
  }

  return blocks;
}

/** Kind -> the block it was read into. First block wins for duplicated kinds. */
export function blockByKind(blocks: Block[]): Map<number, Block> {
  const map = new Map<number, Block>();
  for (const b of blocks) for (const k of b.tiles) if (!map.has(k)) map.set(k, b);
  return map;
}

const SHAPE_WORD: Record<BlockShape, string> = {
  set: 'a set',
  pair: 'a pair',
  run: 'a run',
  partial: 'half a run',
  single: 'on its own',
};

/**
 * One short label for the raised tile. The tiles themselves are shown beside
 * it, so this only has to name the shape — naming every tile twice costs the
 * room that the discard hint needs.
 */
export function describe(blocks: Block[], k: number): string {
  const block = blockByKind(blocks).get(k);
  return SHAPE_WORD[block?.shape ?? 'single'];
}

/** How far the hand is from ready, judged on the best discard when holding 14. */
export function distanceToReady(hand: number[], melds: number): number {
  const counts = countsOf(hand);
  if (hand.length === 13 - melds * 3) return shanten(counts, melds);
  let best = Infinity;
  for (const v of shantenByDiscard(counts, melds).values()) best = Math.min(best, v);
  return Number.isFinite(best) ? shanten(counts, melds) : best;
}

/** Shanten after each possible discard, for the raised-tile hint. */
export function afterEachDiscard(hand: number[], melds: number): Map<number, number> | undefined {
  if (hand.length !== 14 - melds * 3) return undefined;
  return shantenByDiscard(countsOf(hand), melds);
}
