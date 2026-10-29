import { describe, expect, it } from 'vitest';
import { applyAction, claimsFor, createHand } from '../src/engine/game';
import type { GameState } from '../src/engine/types';

/** Force a discard from `seat` with the human holding `k` twice. */
function discardIntoPair(k: number, seat = 1): GameState {
  const s = createHand({ seed: 7, dealer: seat });
  s.turn = seat;
  s.phase = 'discard';
  // a seat may only discard from fourteen tiles
  s.seats[seat].hand = [...s.seats[seat].hand.slice(0, 13), k];
  s.seats[0].hand = [k, k, 0, 4, 8, 12, 16, 20, 24, 27, 28, 29, 30];
  return applyAction(s, { type: 'discard', seat, k });
}

describe('claim offers', () => {
  it('offers the human a pung on a tile they hold twice', () => {
    const s = discardIntoPair(5);
    expect(s.phase).toBe('claim');
    expect(s.pendingSeats).toContain(0);
    const mine = claimsFor(s, 0);
    expect(mine.some((c) => c.type === 'pon')).toBe(true);
  });

  it('offers a kong on a tile they hold three times', () => {
    const s = createHand({ seed: 9, dealer: 1 });
    s.turn = 1;
    s.phase = 'discard';
    s.seats[1].hand = [...s.seats[1].hand.slice(0, 13), 12];
    s.seats[0].hand = [12, 12, 12, 0, 4, 8, 16, 20, 24, 27, 28, 29, 30];
    const next = applyAction(s, { type: 'discard', seat: 1, k: 12 });
    const mine = claimsFor(next, 0);
    expect(mine.some((c) => c.type === 'kan')).toBe(true);
    expect(mine.some((c) => c.type === 'pon')).toBe(true);
  });

  it('does not offer a pung on the player own discard', () => {
    const s = createHand({ seed: 11, dealer: 0 });
    s.turn = 0;
    s.phase = 'discard';
    s.seats[0].hand = [5, 5, 0, 4, 8, 12, 16, 20, 24, 27, 28, 29, 30, 31];
    const next = applyAction(s, { type: 'discard', seat: 0, k: 5 });
    expect(claimsFor(next, 0)).toHaveLength(0);
  });

  it('keeps the pung after a pass by another seat', () => {
    const s = discardIntoPair(5);
    const other = s.pendingSeats.find((x) => x !== 0);
    const next = other === undefined ? s : applyAction(s, { type: 'pass', seat: other });
    expect(next.pendingSeats).toContain(0);
    expect(claimsFor(next, 0).some((c) => c.type === 'pon')).toBe(true);
  });
});
