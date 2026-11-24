import { describe, expect, it } from 'vitest';
import { applyAction, createHand } from '../src/engine/game';
import { driverKey } from '../src/client/driver';
import type { GameState } from '../src/engine/types';

/** Seat 0 throws a tile that seats 1 and 2 both hold twice — two live callers. */
function twoCallers(k = 20): GameState {
  const s = createHand({ seed: 3, dealer: 0 });
  s.turn = 0;
  s.phase = 'discard';
  s.seats[0].hand = [...s.seats[0].hand.slice(0, 13), k];
  s.seats[1].hand = [k, k, 0, 4, 8, 12, 16, 24, 27, 28, 29, 30, 31];
  s.seats[2].hand = [k, k, 1, 5, 9, 13, 17, 25, 26, 32, 33, 34, 35];
  return applyAction(s, { type: 'discard', seat: 0, k });
}

describe('bot driver key', () => {
  it('changes when a seat answers a call, which logs nothing', () => {
    const s = twoCallers();
    expect(s.phase).toBe('claim');
    expect(s.pendingSeats.length).toBeGreaterThan(1);
    const before = driverKey(s);
    const after = applyAction(s, { type: 'pass', seat: 1 });
    // the pass is silent: no log entry, so the sequence number is unchanged
    expect(after.seq).toBe(s.seq);
    expect(driverKey(after)).not.toBe(before);
  });

  it('is stable across re-renders of the same position', () => {
    const s = twoCallers();
    expect(driverKey(s)).toBe(driverKey({ ...s }));
    expect(driverKey(null)).toBe('');
  });

  it('keeps advancing until every caller has answered', () => {
    const start = twoCallers();
    const callers = start.pendingSeats.slice();
    let s = start;
    const keys = new Set([driverKey(s)]);
    for (const seat of callers) {
      s = applyAction(s, { type: 'pass', seat });
      keys.add(driverKey(s));
    }
    // one key for the open offer, then one per silent answer
    expect(keys.size).toBe(callers.length + 1);
  });
});
