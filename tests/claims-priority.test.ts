import { describe, expect, it } from 'vitest';
import { applyAction, claimsFor, createHand } from '../src/engine/game';

/** Seat 3 discards a tile that BOTH seat 0 and seat 1 hold a pair of. */
function contestedDiscard() {
  const s = createHand({ seed: 21, dealer: 3 });
  s.turn = 3;
  s.phase = 'discard';
  s.seats[3].hand = [...s.seats[3].hand.slice(0, 13), 5];
  s.seats[0].hand = [5, 5, 0, 4, 8, 12, 16, 20, 24, 27, 28, 29, 30];
  s.seats[1].hand = [5, 5, 1, 6, 9, 13, 17, 21, 25, 28, 29, 30, 31];
  return applyAction(s, { type: 'discard', seat: 3, k: 5 });
}

describe('claim priority', () => {
  it('puts both claimants in the pending list', () => {
    const s = contestedDiscard();
    expect(s.phase).toBe('claim');
    expect(s.pendingSeats).toContain(0);
    expect(s.pendingSeats).toContain(1);
  });

  it('a seat further away cannot take the tile while the nearer seat still has a say', () => {
    const s = contestedDiscard();
    // seat 1 answers first: it is allowed to claim, but it must not close seat 0
    const next = applyAction(s, { type: 'claim', seat: 1, claim: 'pon' });
    const humanStillWaits = next.phase === 'claim' && next.pendingSeats.includes(0) && !next.claimResponses[0];
    const humanTookIt = next.seats[0].melds.some((m) => m.type === 'pung' && m.k === 5);
    const botTookIt = next.seats[1].melds.some((m) => m.type === 'pung' && m.k === 5);
    expect({ humanStillWaits, humanTookIt, botTookIt }).toEqual({
      humanStillWaits: true, // seat 0 is nearer to seat 3, so it must be asked first
      humanTookIt: false,
      botTookIt: false,
    });
  });
});

describe('claims are remembered while the window is open', () => {
  it("a bot's pung still lands after the human passes", () => {
    const s = contestedDiscard();
    const claimed = applyAction(s, { type: 'claim', seat: 1, claim: 'pon' });
    const afterPass = applyAction(claimed, { type: 'pass', seat: 0 });
    expect(afterPass.seats[1].melds.some((m) => m.type === 'pung' && m.k === 5)).toBe(true);
    expect(afterPass.phase).not.toBe('claim');
  });

  it("the human's pung still lands after a bot passes", () => {
    const s = contestedDiscard();
    const mine = applyAction(s, { type: 'claim', seat: 0, claim: 'pon' });
    const afterBotPass = applyAction(mine, { type: 'pass', seat: 1 });
    expect(afterBotPass.seats[0].melds.some((m) => m.type === 'pung' && m.k === 5)).toBe(true);
    expect(afterBotPass.turn).toBe(0);
  });
});
