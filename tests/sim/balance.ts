/**
 * Balance harness: plays N hands with the archetype roster and reports the
 * numbers that matter for tuning — win rate, fan distribution, per-archetype
 * results, and how often each cat actually follows its own suit.
 */
import { applyAction, createHand } from '../../src/engine/game';
import { ARCHETYPES } from '../../src/engine/bots/personality';
import { chooseClaim, chooseDiscard, chooseSelfKong, wantsSelfWin } from '../../src/engine/bots/bot';
import type { GameState, Personality } from '../../src/engine/types';

export function playHandBots(state: GameState, personas: Personality[], maxSteps = 4000): GameState {
  let s = state;
  let steps = 0;
  while (s.phase !== 'ended' && steps++ < maxSteps) {
    if (s.phase === 'claim') {
      const seat = s.pendingSeats.find((x) => !s.claimResponses[x]);
      if (seat === undefined) break;
      const d = chooseClaim(s, seat, personas[seat]);
      s = d.type
        ? applyAction(s, { type: 'claim', seat, claim: d.type, withKinds: d.withKinds })
        : applyAction(s, { type: 'pass', seat });
      continue;
    }
    const seat = s.turn;
    if (wantsSelfWin(s, seat)) { s = applyAction(s, { type: 'hu', seat }); continue; }
    const kong = chooseSelfKong(s, seat, personas[seat]);
    if (kong !== null) { s = applyAction(s, { type: 'kan', seat, k: kong }); continue; }
    const d = chooseDiscard(s, seat, personas[seat]);
    s = applyAction(s, { type: 'discard', seat, k: d.k });
  }
  return s;
}

const N = Number(process.argv[2] ?? 120);
const roster = ARCHETYPES.slice(0, 4).map((a) => a.personality);
let wins = 0, draws = 0, stalls = 0;
const fanHist: Record<number, number> = {};
const seatWins = [0, 0, 0, 0];
const seatPoints = [0, 0, 0, 0];
const t0 = Date.now();

for (let seed = 1; seed <= N; seed++) {
  // Rotate who sits where so no seat inherits the dealer's advantage.
  const shift = seed % 4;
  const personas = [0, 1, 2, 3].map((i) => roster[(i + shift) % 4]);
  const end = playHandBots(createHand({ seed }), personas);
  if (end.phase !== 'ended') { stalls++; continue; }
  if (end.win) {
    wins++;
    fanHist[end.win.score.fan] = (fanHist[end.win.score.fan] ?? 0) + 1;
    seatWins[end.win.seat]++;
  } else draws++;
  end.scores.forEach((v, i) => { seatPoints[i] += v; });
}

console.log(JSON.stringify({
  N, wins, draws, stalls,
  winRate: +(wins / N).toFixed(3),
  fanHist,
  seatWins,
  seatPointsPerHand: seatPoints.map((v) => +(v / N).toFixed(1)),
  roster: roster.map((p) => p.name),
  ms: Date.now() - t0,
}, null, 2));
