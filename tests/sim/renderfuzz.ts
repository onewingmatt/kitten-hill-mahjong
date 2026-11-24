import { readFileSync } from 'node:fs';
import type { GameState } from '../../src/engine/types';
import { countsOf } from '../../src/engine/shanten';
import { afterEachDiscard, blockByKind, decompose, describe as describeShape, distanceToReady } from '../../src/engine/shape';
import { estimateFan, fanBreakdown } from '../../src/engine/bots/fan-estimate';
import { claimsFor, currentWaits, selfKongKinds } from '../../src/engine/game';

const seatWind = (seat: number, dealer: number) => (seat - dealer + 4) % 4;
import { fortuneFor } from '../../src/client/fortunes';
import { sortHand } from '../../src/client/sort';
import { kind } from '../../src/engine/tiles';

const states = JSON.parse(readFileSync('/home/onewing/.hermes/cache/scratch/states.json', 'utf8')) as GameState[];
const bad = (label: string, v: unknown, s: GameState) => {
  console.log('BAD', label, JSON.stringify(v), JSON.stringify({ phase: s.phase, turn: s.turn, win: s.win }));
  process.exit(1);
};
const nums = (label: string, arr: unknown, s: GameState) => {
  if (!Array.isArray(arr)) bad(label, arr, s);
  for (const v of arr as unknown[]) if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 41) bad(label, v, s);
};

let n = 0;
for (const s of states) {
  n++;
  for (let seat = 0; seat < 4; seat++) {
    const p = s.seats[seat];
    const wind = seatWind(seat, s.dealer);
    // every rack mode
    for (const mode of ['manual', 'suit', 'rank', 'sets', 'smart'] as const) {
      const out = sortHand(p.hand, mode);
      nums(`sort:${mode}`, out, s);
    }
    const blocks = decompose(p.hand);
    for (const b of blocks) nums('decompose', b.tiles, s);
    const shaped = blockByKind(blocks);
    for (const k of new Set(p.hand)) {
      const line = describeShape(blocks, k);
      if (typeof line !== 'string') bad('describe', line, s);
      if (!shaped.has(k)) bad('blockByKind missing', k, s);
    }
    const away = distanceToReady(p.hand, p.melds.length);
    if (!Number.isFinite(away)) bad('distanceToReady', away, s);
    const fan = estimateFan(countsOf(p.hand), p.melds, wind, s.roundWind);
    if (!Number.isFinite(fan)) bad('estimateFan', fan, s);
    for (const line of fanBreakdown(countsOf(p.hand), p.melds, wind, s.roundWind)) {
      if (typeof line.label !== 'string') bad('fanBreakdown label', line, s);
    }
    if (p.hand.length === 14 - p.melds.length * 3) {
      const after = afterEachDiscard(p.hand, p.melds.length);
      if (!after) bad('afterEachDiscard null', null, s);
      for (const [k, d] of after!) if (!Number.isInteger(k) || !Number.isFinite(d)) bad('afterEachDiscard entry', [k, d], s);
    }
    if (s.phase === 'claim') {
      for (const c of claimsFor(s, seat)) {
        if (c.withKinds) nums('claim.withKinds', c.withKinds, s);
      }
    }
    nums('currentWaits', currentWaits(s, seat), s);
    nums('selfKongKinds', selfKongKinds(s, seat), s);
  }
  if (s.win) {
    fortuneFor(s.win.tile, s.seed + s.handNumber);
    kind(s.win.tile);
  }
}
console.log(`checked ${n} states: every render input is a valid tile kind`);
