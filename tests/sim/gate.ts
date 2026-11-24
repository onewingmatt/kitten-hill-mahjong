import { createHand, applyAction } from '../../src/engine/game';
import { chooseClaim, chooseDiscard, chooseSelfKong, wantsSelfWin } from '../../src/engine/bots/bot';
import { ARCHETYPES } from '../../src/engine/bots/personality';
import type { GameState } from '../../src/engine/types';

/** Drive a whole hand with bots, exactly as tests/engine.test.ts does. */
function play(state: GameState, personas: ReturnType<typeof ARCHETYPES.map> | any[]): GameState {
  let s = state;
  for (let guard = 0; guard < 4000 && s.phase !== 'ended'; guard++) {
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

function measure(minFan: number, hands = 60) {
  let wins = 0;
  let draws = 0;
  let minFanSeen = Infinity;
  for (let seed = 1; seed <= hands; seed++) {
    const end = play(createHand({ seed, bots: [true, true, true, true], minFan }), personas);
    if (end.phase !== 'ended') throw new Error(`seed ${seed} did not finish`);
    if (end.win) {
      wins++;
      if (minFan > 0) {
        if (!end.win.score.qualifying) throw new Error(`seed ${seed} won under the gate`);
        if (end.win.score.fan < minFan) throw new Error(`seed ${seed} won with ${end.win.score.fan} fan, gate ${minFan}`);
      }
      minFanSeen = Math.min(minFanSeen, end.win.score.fan);
    } else {
      draws++;
    }
  }
  return { minFan, wins, draws, winRate: wins / hands, lowestWinningFan: minFanSeen };
}

for (const gate of [0, 1, 2, 3]) console.log(JSON.stringify(measure(gate)));
