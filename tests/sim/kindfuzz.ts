import { applyAction, createHand, claimOptions, selfKongKinds, canSelfWin, canDiscard, IllegalAction } from '../../src/engine/game';
import type { GameState, GameAction } from '../../src/engine/types';

/** every array that is supposed to hold tile kinds */
function badKinds(s: GameState): string | null {
  const check = (label: string, arr: unknown) => {
    if (!Array.isArray(arr)) return `${label} is not an array`;
    for (const v of arr) if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 41) return `${label} holds ${JSON.stringify(v)}`;
    return null;
  };
  const w = check('wall', s.wall); if (w) return w;
  const d = check('dead', s.dead); if (d) return d;
  for (let i = 0; i < 4; i++) {
    const p = s.seats[i];
    const h = check(`seat${i}.hand`, p.hand); if (h) return h;
    const di = check(`seat${i}.discards`, p.discards); if (di) return di;
    const f = check(`seat${i}.flowers`, p.flowers); if (f) return f;
    for (const [j, m] of p.melds.entries()) {
      const t = check(`seat${i}.meld${j}.tiles`, m.tiles); if (t) return t;
      if (!Number.isInteger(m.k)) return `seat${i}.meld${j}.k holds ${JSON.stringify(m.k)}`;
    }
  }
  if (s.lastDrawn !== null && s.lastDrawn !== undefined && !Number.isInteger(s.lastDrawn)) return `lastDrawn ${JSON.stringify(s.lastDrawn)}`;
  if (s.pending && !Number.isInteger(s.pending.k)) return `pending.k ${JSON.stringify(s.pending.k)}`;
  if (s.win && !Number.isInteger(s.win.tile)) return `win.tile ${JSON.stringify(s.win.tile)}`;
  return null;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
let hands = 0;
let actions = 0;

for (let h = 0; h < 4000; h++) {
  let s = createHand({ seed: (Math.random() * 1e9) | 0, dealer: (Math.random() * 4) | 0, minFan: 0 });
  hands++;
  for (let step = 0; step < 400; step++) {
    const bad = badKinds(s);
    if (bad) { console.log('CORRUPT', bad, 'hand', h, 'step', step, JSON.stringify({ phase: s.phase, turn: s.turn, seq: s.seq })); process.exit(1); }
    if (s.phase === 'ended') break;
    const acts: GameAction[] = [];
    if (s.phase === 'claim') {
      const pending = s.pendingSeats.filter((x) => !s.claimResponses[x]);
      if (!pending.length) { console.log('STUCK claim with nobody pending'); process.exit(1); }
      const seat = pick(pending);
      for (const o of claimOptions(s).filter((c) => c.seat === seat)) {
        acts.push({ type: 'claim', seat, claim: o.type, withKinds: o.withKinds } as GameAction);
      }
      acts.push({ type: 'pass', seat });
    } else {
      const seat = s.turn;
      if (canSelfWin(s, seat).ok) acts.push({ type: 'hu', seat });
      for (const k of selfKongKinds(s, seat)) acts.push({ type: 'kan', seat, k });
      if (canDiscard(s, seat)) {
        const hand = s.seats[seat].hand;
        for (const k of new Set(hand)) acts.push({ type: 'discard', seat, k });
      }
      if (!acts.length) { console.log('NO ACTIONS', JSON.stringify({ phase: s.phase, turn: s.turn, hand: s.seats[s.turn].hand.length, melds: s.seats[s.turn].melds.length })); process.exit(1); }
    }
    const a = pick(acts);
    try {
      s = applyAction(s, a);
      actions++;
    } catch (e) {
      if (e instanceof IllegalAction) { console.log('ILLEGAL', e.message, JSON.stringify(a), 'phase', s.phase); process.exit(1); }
      throw e;
    }
  }
}
console.log(`ok: ${hands} hands, ${actions} actions, no corrupt tile kinds`);
