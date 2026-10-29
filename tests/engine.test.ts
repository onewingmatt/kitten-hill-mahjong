import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KINDS, NUM_KINDS, isSeatBonus, kind, rankOf, suitOf } from '../src/engine/tiles';
import { applyAction, buildWall, createHand, currentWaits, mulberry32 } from '../src/engine/game';
import type { GameState, Personality } from '../src/engine/types';
import { countsOf, shanten, shantenByDiscard, shantenThirteenOrphans } from '../src/engine/shanten';
import { decompositions, isThirteenOrphans, isWinningCounts, winningKinds } from '../src/engine/win';
import { scoreHand, settle } from '../src/engine/score';
import { ARCHETYPES, decodePersonality, encodePersonality, playStyleLabel } from '../src/engine/bots/personality';
import { chooseClaim, chooseDiscard, chooseSelfKong, wantsSelfWin } from '../src/engine/bots/bot';

const K = (id: string) => KINDS.find((x) => x.id === id)!.k;
const parse = (str: string) => str.trim().split(/\s+/).map(K);

describe('tiles', () => {
  it('has 42 kinds with unique ids and real sprites', () => {
    expect(KINDS.length).toBe(42);
    expect(new Set(KINDS.map((k) => k.id)).size).toBe(42);
    for (const def of KINDS) {
      expect(existsSync(`public/tiles/${def.sprite}`), def.sprite).toBe(true);
    }
  });

  it('maps suits and ranks', () => {
    expect(suitOf(K('d5'))).toBe(0);
    expect(suitOf(K('b9'))).toBe(1);
    expect(suitOf(K('c1'))).toBe(2);
    expect(suitOf(K('g1'))).toBe(null);
    expect(rankOf(K('c7'))).toBe(7);
    expect(isSeatBonus(K('f1'), 0)).toBe(true);
    expect(isSeatBonus(K('f1'), 1)).toBe(false);
    expect(kind(K('g2')).label).toBe('Green Dragon');
  });
});

describe('wall and deal', () => {
  it('builds a 144 tile wall: four of each kind plus eight bonuses', () => {
    const wall = buildWall(mulberry32(1));
    expect(wall.length).toBe(144);
    for (let k = 0; k < NUM_KINDS; k++) expect(wall.filter((x) => x === k).length).toBe(4);
    for (let k = 34; k < 42; k++) expect(wall.filter((x) => x === k).length).toBe(1);
  });

  it('deals 14 to the dealer and 13 to everyone else, with no bonus tiles in hand', () => {
    const s = createHand({ seed: 42 });
    expect(s.seats[0].hand.length).toBe(14);
    expect(s.seats[1].hand.length).toBe(13);
    expect(s.seats[2].hand.length).toBe(13);
    expect(s.seats[3].hand.length).toBe(13);
    for (const p of s.seats) {
      expect(p.hand.every((k) => k < 34)).toBe(true);
      expect(p.flowers.every((k) => k >= 34)).toBe(true);
    }
  });

  it('conserves all 144 tiles after the deal', () => {
    const s = createHand({ seed: 7 });
    expect(tileTotal(s)).toBe(144);
  });

  it('is deterministic for a seed', () => {
    const a = createHand({ seed: 99 });
    const b = createHand({ seed: 99 });
    expect(a.seats.map((p) => p.hand)).toEqual(b.seats.map((p) => p.hand));
    expect(a.wall).toEqual(b.wall);
  });
});

function tileTotal(s: GameState): number {
  let n = s.wall.length + s.dead.length;
  for (const p of s.seats) {
    n += p.hand.length + p.discards.length + p.flowers.length;
    for (const m of p.melds) n += m.tiles.length;
  }
  return n;
}

describe('shanten', () => {
  it('reads a complete hand as -1', () => {
    const hand = parse('d1 d2 d3 d4 d5 d6 d7 d8 d9 c1 c2 c3 g1 g1');
    expect(isWinningCounts(countsOf(hand), 0)).toBe(true);
    expect(shanten(countsOf(hand), 0)).toBe(-1);
  });

  it('reads a tenpai hand as 0', () => {
    const hand = parse('d1 d2 d3 d4 d5 d6 d7 d8 d9 c1 c2 c3 g1');
    expect(shanten(countsOf(hand), 0)).toBe(0);
    expect(winningKinds(countsOf(hand), 0)).toContain(K('g1'));
  });

  it('counts partial sets correctly', () => {
    // three complete runs, two ryanmen, no pair: one away
    const hand = parse('d1 d2 d3 d4 d5 d6 d7 d8 d9 c2 c3 b5 b6');
    expect(shanten(countsOf(hand), 0)).toBe(1);
  });

  it('respects called melds', () => {
    const hand = parse('d1 d2 d3 c2 c3 b5 b6 g1 g1 d7 d8');
    // 11 concealed tiles + 1 called meld
    expect(shanten(countsOf(hand), 1)).toBeLessThanOrEqual(2);
  });

  it('measures thirteen orphans', () => {
    const near = parse('d1 d9 b1 b9 c1 c9 w1 w2 w3 w4 g1 g2 g3');
    expect(shantenThirteenOrphans(countsOf(near))).toBe(0);
    const win = parse('d1 d9 b1 b9 c1 c9 w1 w2 w3 w4 g1 g2 g3 g3');
    expect(isThirteenOrphans(countsOf(win), 0)).toBe(true);
    expect(isWinningCounts(countsOf(win), 0)).toBe(true);
  });

  it('never reports a better shanten for a worse hand', () => {
    const complete = countsOf(parse('d1 d2 d3 d4 d5 d6 d7 d8 d9 c1 c2 c3 g1 g1'));
    const broken = complete.slice();
    broken[K('d1')]--;
    broken[K('b5')]++;
    expect(shanten(broken, 0)).toBeGreaterThan(shanten(complete, 0));
  });
});

describe('win detection', () => {
  it('finds the pair wait on a finished-shape hand', () => {
    // three runs + a pung = 13 tiles, so the only wait is the pair
    const hand = parse('d1 d2 d3 c4 c5 c6 b7 b8 b9 g1 g1 g1 d7');
    const waits = winningKinds(countsOf(hand), 0);
    expect(waits).toEqual([K('d7')]);
  });

  it('finds the single wait on a pung-heavy shape', () => {
    // three runs + a pung + a lone honour: only the honour pairs up
    const hand = parse('d1 d2 d3 c4 c5 c6 b7 b8 b9 g1 g1 g1 g2');
    expect(winningKinds(countsOf(hand), 0)).toEqual([K('g2')]);
  });

  it('rejects fourteen tiles that do not decompose', () => {
    const hand = parse('d1 d1 d1 d2 d4 d6 d8 b1 b1 b1 c1 c3 c5 g1');
    expect(isWinningCounts(countsOf(hand), 0)).toBe(false);
  });

  it('enumerates the same decomposition twice at most once', () => {
    const hand = parse('d1 d2 d3 d1 d2 d3 d4 d5 d6 c1 c2 c3 g2 g2');
    const d = decompositions(countsOf(hand), 0);
    expect(d.length).toBeGreaterThan(0);
    expect(new Set(d.map((x) => JSON.stringify(x))).size).toBe(d.length);
  });
});

describe('scoring', () => {
  const baseCtx = {
    seat: 1,
    roundWind: 0,
    selfDraw: true,
    lastTile: false,
    replacement: false,
    robbingKong: false,
    flowers: [],
    limit: 500,
  };

  it('values a pure flush all-chow hand at 3 doubles and 272 points', () => {
    const hand = parse('d1 d2 d3 d4 d5 d6 d2 d3 d4 d7 d8 d9 d5 d5');
    const sc = scoreHand(hand, [], baseCtx, K('d5'));
    expect(sc.doubles.map((d) => d.label)).toContain('Pure flush');
    expect(sc.fan).toBe(3);
    expect(sc.qualifying).toBe(true);
    // 20 (mahjong) + 10 (pinghu) + 2 (self draw) + 2 (single wait) = 34, x 2^3
    expect(sc.miniPoints).toBe(34);
    expect(sc.points).toBe(272);
  });

  it('lets a chicken hand win at the default table (no minimum)', () => {
    const hand = parse('d1 d2 d3 c4 c5 c6 b7 b8 b9 g1 g1 d4 d5 d6');
    const sc = scoreHand(hand, [], baseCtx, K('g1'));
    expect(sc.fan).toBeLessThan(3);
    expect(sc.qualifying).toBe(true);
    expect(sc.points).toBeGreaterThan(0);
  });

  it('can still be played as a traditional three-double table', () => {
    const hand = parse('d1 d2 d3 c4 c5 c6 b7 b8 b9 g1 g1 d4 d5 d6');
    const sc = scoreHand(hand, [], { ...baseCtx, minFan: 3 }, K('g1'));
    expect(sc.qualifying).toBe(false);
    const strong = scoreHand(parse('d1 d2 d3 d4 d5 d6 d2 d3 d4 d7 d8 d9 d5 d5'), [], { ...baseCtx, minFan: 3 }, K('d5'));
    expect(strong.qualifying).toBe(true);
  });

  it('scores a dragon pung as a double', () => {
    const hand = parse('g2 g2 g2 d1 d2 d3 d4 d5 d6 c7 c8 c9 g1 g1');
    const sc = scoreHand(hand, [], baseCtx, K('g2'));
    expect(sc.doubles.some((d) => d.label.includes('Dragon'))).toBe(true);
  });

  it('caps at the table limit', () => {
    const hand = parse('d1 d2 d3 d4 d5 d6 d2 d3 d4 d7 d8 d9 d5 d5');
    const sc = scoreHand(hand, [], { ...baseCtx, limit: 200 }, K('d5'));
    expect(sc.points).toBe(200);
    expect(sc.limit).toBe(true);
  });

  it('pays East double, both ways, exactly as the classical tables describe', () => {
    // South wins 30: West 30, North 30, East 60 -> +120
    const g1 = settle(1, 30);
    expect(g1[1]).toBe(120);
    expect(g1[0]).toBe(-60);
    expect(g1[2]).toBe(-30);
    expect(g1[3]).toBe(-30);
    expect(g1.reduce((a, b) => a + b, 0)).toBe(0);

    // East wins 40: everyone pays 80 -> +240
    const g2 = settle(0, 40);
    expect(g2[0]).toBe(240);
    expect(g2.slice(1)).toEqual([-80, -80, -80]);
  });

  it('scores limit hands flat and qualifying', () => {
    const orphans = parse('d1 d9 b1 b9 c1 c9 w1 w2 w3 w4 g1 g2 g3 g3');
    const sc = scoreHand(orphans, [], baseCtx, K('g3'));
    expect(sc.limit).toBe(true);
    expect(sc.points).toBe(300);
    expect(sc.patternLabels).toContain('Thirteen Orphans');
  });
});

describe('game flow', () => {
  it('starts on the dealer with a discardable 14 tiles', () => {
    const s = createHand({ seed: 5 });
    expect(s.phase).toBe('discard');
    expect(s.turn).toBe(0);
    const s2 = applyAction(s, { type: 'discard', seat: 0, k: s.seats[0].hand[0] });
    expect(s2.seats[0].hand.length).toBe(13);
    expect(s2.seats[0].discards.length).toBe(1);
    expect(tileTotal(s2)).toBe(144);
  });

  it('rejects an illegal discard', () => {
    const s = createHand({ seed: 5 });
    expect(() => applyAction(s, { type: 'discard', seat: 1, k: s.seats[1].hand[0] })).toThrow();
  });

  it('never offers a winning claim that scores below the minimum', () => {
    const s = createHand({ seed: 11 });
    expect(s.phase).toBe('discard');
  });
});

describe('ready state (hint data)', () => {
  it('reports the wait for a tenpai hand at rest', () => {
    const s = createHand({ seed: 3 });
    // three runs + a pung + a lone honour: only the honour finishes it
    s.seats[0].hand = parse('d1 d2 d3 b4 b5 b6 c7 c8 c9 g1 g1 g1 w1').slice();
    s.seats[0].melds = [];
    s.phase = 'discard';
    s.turn = 1;
    expect(currentWaits(s, 0)).toEqual([K('w1')]);
  });

  it('reports nothing once the hand has a meld and the wrong tile count', () => {
    const s = createHand({ seed: 3 });
    s.seats[0].hand = parse('d1 d2 d3 b4 b5 b6 c7 c8 c9 g1 g1 g1').slice();
    s.seats[0].melds = [{ type: 'chow', k: K('b1'), concealed: false, from: 1, tiles: [K('b1'), K('b2'), K('b3')] }];
    expect(currentWaits(s, 0)).toEqual([]);
  });
});

describe('bots', () => {
  const personas: Personality[] = ARCHETYPES.slice(0, 4).map((a) => a.personality);

  it('always produces a legal discard', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = createHand({ seed, bots: [false, true, true, true] });
      const d = chooseDiscard(s, 0, personas[0]);
      expect(s.seats[0].hand).toContain(d.k);
      const s2 = applyAction(s, { type: 'discard', seat: 0, k: d.k });
      expect(tileTotal(s2)).toBe(144);
    }
  });

  it('hoards dragons more than a chow-runner does', () => {
    const dragon = K('g1');
    let mochiHeld = 0;
    let pipHeld = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = createHand({ seed });
      const hand = s.seats[0].hand;
      if (!hand.includes(dragon) || hand.filter((k) => k === dragon).length < 2) continue;
      const mochi = chooseDiscard(s, 0, ARCHETYPES.find((a) => a.id === 'mochi')!.personality);
      const pip = chooseDiscard(s, 0, ARCHETYPES.find((a) => a.id === 'pip')!.personality);
      if (mochi.k !== dragon) mochiHeld++;
      if (pip.k !== dragon) pipHeld++;
    }
    expect(mochiHeld).toBeGreaterThanOrEqual(pipHeld);
  });

  it('encodes and decodes a shareable personality code', () => {
    for (const a of ARCHETYPES) {
      const code = encodePersonality(a.personality);
      const back = decodePersonality(code, a.name)!;
      expect(back).not.toBeNull();
      expect(Math.abs(back.caution - a.personality.caution)).toBeLessThan(0.08);
      expect(Math.abs(back.setBias - a.personality.setBias)).toBeLessThan(0.08);
    }
    expect(decodePersonality('AAAAAAAAAAAA')).toBeNull();
  });

  it('labels play styles', () => {
    expect(playStyleLabel(ARCHETYPES.find((a) => a.id === 'mochi')!.personality)).toMatch(/Pung-hunter|Dragon-keeper/);
    expect(playStyleLabel(ARCHETYPES.find((a) => a.id === 'pip')!.personality)).toMatch(/Caller|Sprinter|Chow-runner/);
  });
});

export function playHandBots(state: GameState, personas: Personality[], maxSteps = 4000): GameState {
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
    if (wantsSelfWin(s, seat)) { s = applyAction(s, { type: 'hu', seat }); continue; }
    const kong = chooseSelfKong(s, seat, personas[seat]);
    if (kong !== null) { s = applyAction(s, { type: 'kan', seat, k: kong }); continue; }
    const d = chooseDiscard(s, seat, personas[seat]);
    s = applyAction(s, { type: 'discard', seat, k: d.k });
  }
  return s;
}

describe('full hand simulation', () => {
  it('finishes 60 hands with every seat played by a different personality', () => {
    const personas = [
      ARCHETYPES[0].personality,
      ARCHETYPES[1].personality,
      ARCHETYPES[2].personality,
      ARCHETYPES[3].personality,
    ];
    let wins = 0;
    let draws = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = createHand({ seed, bots: [true, true, true, true] });
      const end = playHandBots(s, personas);
      expect(end.phase, `seed ${seed} did not finish`).toBe('ended');
      expect(tileTotal(end), `seed ${seed} lost tiles`).toBe(144);
      expect(end.scores.reduce((a, b) => a + b, 0), `seed ${seed} score leak`).toBe(0);
      if (end.win) {
        wins++;
        expect(end.win.score.qualifying).toBe(true);
        expect(end.win.score.points).toBeGreaterThan(0);
      } else {
        draws++;
        expect(end.drawGame).toBe(true);
        expect(end.wall.length).toBe(0);
      }
    }
    expect(wins).toBeGreaterThan(0);
    expect(wins + draws).toBe(60);
  }, 120000);
});
