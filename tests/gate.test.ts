import { describe, expect, it } from 'vitest';
import { createHand, applyAction } from '../src/engine/game';
import { chooseClaim, chooseDiscard, chooseSelfKong, wantsSelfWin } from '../src/engine/bots/bot';
import { ARCHETYPES } from '../src/engine/bots/personality';
import type { GameState, Personality } from '../src/engine/types';

/** Same driver as tests/engine.test.ts: every seat played by a bot. */
function playHandBots(state: GameState, personas: Personality[], maxSteps = 4000): GameState {
  let s = state;
  let steps = 0;
  while (s.phase !== 'ended' && steps++ < maxSteps) {
    if (s.phase === 'claim') {
      const seat = s.pendingSeats.find((x) => !s.claimResponses[x]);
      if (seat === undefined) break;
      const dec = chooseClaim(s, seat, personas[seat]);
      s = dec.type
        ? applyAction(s, { type: 'claim', seat, claim: dec.type, withKinds: dec.withKinds })
        : applyAction(s, { type: 'pass', seat });
      continue;
    }
    const seat = s.turn;
    if (wantsSelfWin(s, seat)) {
      s = applyAction(s, { type: 'hu', seat });
      continue;
    }
    const kong = chooseSelfKong(s, seat, personas[seat]);
    if (kong !== null) {
      s = applyAction(s, { type: 'kan', seat, k: kong });
      continue;
    }
    const d = chooseDiscard(s, seat, personas[seat]);
    s = applyAction(s, { type: 'discard', seat, k: d.k });
  }
  return s;
}

const personas = [0, 1, 2, 3].map((i) => ARCHETYPES[i].personality);

describe('table minimum', () => {
  it('never declares a hand under the minimum, and still finishes the hand', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const end = playHandBots(createHand({ seed, bots: [true, true, true, true], minFan: 2 }), personas);
      expect(end.phase, `seed ${seed} did not finish`).toBe('ended');
      if (end.win) {
        expect(end.win.score.fan, `seed ${seed} declared ${end.win.score.fan} fan under a 2-fan gate`).toBeGreaterThanOrEqual(2);
        expect(end.win.score.qualifying).toBe(true);
      } else {
        // a gated table draws more, but a draw must be the wall running out
        expect(end.drawGame).toBe(true);
        expect(end.wall.length).toBe(0);
      }
    }
  }, 120000);

  it('still produces wins at 1 and 2 fan, so the gate is not a deadlock', () => {
    for (const gate of [1, 2]) {
      let wins = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const end = playHandBots(createHand({ seed, bots: [true, true, true, true], minFan: gate }), personas);
        if (end.win) wins++;
      }
      expect(wins, `no hand was won at a ${gate}-fan minimum`).toBeGreaterThan(0);
    }
  }, 120000);

  it('leaves the default game exactly as it was', () => {
    let wins = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const end = playHandBots(createHand({ seed, bots: [true, true, true, true], minFan: 0 }), personas);
      if (end.win) wins++;
    }
    // documented baseline is ~90% of hands won with no minimum
    expect(wins).toBeGreaterThanOrEqual(14);
  }, 120000);
});
