/**
 * Shanten (distance to tenpai) for the Chinese Classical 4-meld + pair hand.
 *
 * `shanten === 0` means tenpai (one tile from a win), `-1` means a complete hand.
 * Only concealed tiles are passed in; called melds come in through `meldCount`.
 */

const MEMO = new Map<string, number>();

export function countsOf(hand: number[]): number[] {
  const c = new Array(NUM_KINDS_CACHE).fill(0);
  for (const k of hand) if (k < 34) c[k]++;
  return c;
}
const NUM_KINDS_CACHE = 34;

function isSuitIdx(i: number) {
  return i <= 26;
}
function isHonourIdx(i: number) {
  return i >= 27 && i <= 33;
}
function rankIdx(i: number) {
  return i <= 26 ? (i % 9) + 1 : 0;
}

/**
 * Minimum shanten for a standard hand.
 *
 * Block counting: `shanten = 8 - 2*sets - partials - pair`, where partials are
 * capped at the number of blocks still needed (a fifth block never helps).
 */
export function shantenStandard(counts: number[], meldCount: number): number {
  const c = counts.slice();
  const memo = new Map<string, number>();
  const setsToGo = Math.max(0, 4 - meldCount);

  const finish = (sets: number, partials: number, pair: number) => {
    const totalSets = sets + meldCount;
    const cap = Math.max(0, 4 - totalSets);
    return 8 - 2 * Math.min(totalSets, 4) - Math.min(partials, cap) - pair;
  };

  const rec = (i: number, sets: number, partials: number, pair: number): number => {
    if (i >= 34) return finish(sets, partials, pair);
    if (c[i] === 0) return rec(i + 1, sets, partials, pair);

    const key = `${i}|${sets}|${partials}|${pair}|${c.slice(i).join('')}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;

    let best = 99;
    const suit = isSuitIdx(i);
    const rank = rankIdx(i);
    const canSet = sets + meldCount < 4;

    if (canSet && c[i] >= 3) {
      c[i] -= 3;
      best = Math.min(best, rec(i, sets + 1, partials, pair));
      c[i] += 3;
    }
    if (canSet && suit && rank <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      best = Math.min(best, rec(i, sets + 1, partials, pair));
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (!pair && c[i] >= 2) {
      c[i] -= 2;
      best = Math.min(best, rec(i, sets, partials, 1));
      c[i] += 2;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      best = Math.min(best, rec(i, sets, partials + 1, pair));
      c[i] += 2;
    }
    if (suit && rank <= 8 && c[i + 1] > 0) {
      c[i]--; c[i + 1]--;
      best = Math.min(best, rec(i, sets, partials + 1, pair));
      c[i]++; c[i + 1]++;
    }
    if (suit && rank <= 7 && c[i + 2] > 0) {
      c[i]--; c[i + 2]--;
      best = Math.min(best, rec(i, sets, partials + 1, pair));
      c[i]++; c[i + 2]++;
    }
    // Leave one tile of this kind unused (still dead weight) and move on.
    c[i]--;
    best = Math.min(best, rec(i, sets, partials, pair));
    c[i]++;

    memo.set(key, best);
    return best;
  };

  return rec(0, 0, 0, 0);
}

const KOKUSHI_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

export function shantenThirteenOrphans(counts: number[]): number {
  let uniques = 0;
  let hasPair = false;
  for (const k of KOKUSHI_KINDS) {
    if (counts[k] > 0) uniques++;
    if (counts[k] > 1) hasPair = true;
  }
  return 13 - uniques - (hasPair ? 1 : 0);
}

/** Best shanten over the hands this ruleset allows. */
export function shanten(counts: number[], meldCount: number): number {
  let best = shantenStandard(counts, meldCount);
  if (meldCount === 0) best = Math.min(best, shantenThirteenOrphans(counts));
  return best;
}

/** Best shanten after discarding each distinct kind. Returns kind -> shanten. */
export function shantenByDiscard(counts: number[], meldCount: number): Map<number, number> {
  const out = new Map<number, number>();
  for (let k = 0; k < 34; k++) {
    if (!counts[k]) continue;
    const c = counts.slice();
    c[k]--;
    // A 13-tile hand is measured on the deal; a 14-tile hand discards down to 13.
    out.set(k, shanten(c, meldCount));
  }
  return out;
}

export { MEMO };
