import type { ClaimType, GameAction, GameState, LogEntry, Meld, PlayerState, WinInfo } from './types';
import { BONUS_END, BONUS_START, isBonus, kind, spriteUrl } from './tiles';
import { countsOf } from './shanten';
import { isWinningCounts, winningKinds } from './win';
import { DEFAULT_LIMIT, scoreHand } from './score';

/* ------------------------------------------------------------------ */
/* RNG                                                                 */
/* ------------------------------------------------------------------ */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], rand: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 136 tiles + the 8 bonus tiles = the 144-tile Chinese set. */
export function buildWall(rand: () => number): number[] {
  const wall: number[] = [];
  for (let k = 0; k < 34; k++) for (let i = 0; i < 4; i++) wall.push(k);
  for (let k = BONUS_START; k <= BONUS_END; k++) wall.push(k);
  return shuffled(wall, rand);
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export interface HandOptions {
  seed?: number;
  dealer?: number;
  roundWind?: number;
  handNumber?: number;
  bots?: boolean[];
  limit?: number;
  minFan?: number;
}

const DEAD_SIZE = 14;

function log(s: GameState, entry: Omit<LogEntry, 't'>): void {
  s.log.push({ ...entry, t: s.seq++ });
}

function emptyPlayer(seat: number, isBot: boolean): PlayerState {
  return { seat, hand: [], melds: [], flowers: [], discards: [], isBot };
}

export function createHand(opts: HandOptions = {}): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rand = mulberry32(seed);
  const dealer = opts.dealer ?? 0;
  const full = buildWall(rand);
  const dead = full.slice(full.length - DEAD_SIZE);
  const wall = full.slice(0, full.length - DEAD_SIZE);

  const state: GameState = {
    seats: [0, 1, 2, 3].map((i) => emptyPlayer(i, opts.bots?.[i] ?? false)),
    wall,
    dead,
    turn: dealer,
    dealer,
    roundWind: (opts.roundWind ?? 0) as GameState['roundWind'],
    phase: 'discard',
    pending: null,
    pendingSeats: [],
    lastDrawn: null,
    lastDrawSeat: null,
    win: null,
    log: [],
    handNumber: opts.handNumber ?? 1,
    seq: 0,
    drawGame: false,
    claimResponses: {},
    limit: opts.limit ?? DEFAULT_LIMIT,
    minFan: opts.minFan ?? 0,
    firstDiscardOfHand: true,
    seed,
  };

  for (let round = 0; round < 13; round++) {
    for (let i = 0; i < 4; i++) {
      const seat = (dealer + i) % 4;
      state.seats[seat].hand.push(state.wall.shift()!);
    }
  }
  state.seats[dealer].hand.push(state.wall.shift()!);

  log(state, { seat: null, type: 'deal', text: `${kind(27 + dealer).label} deals` });

  for (let i = 0; i < 4; i++) replaceBonuses(state, (dealer + i) % 4);

  state.seats.forEach((p) => p.hand.sort((a, b) => a - b));
  log(state, {
    seat: dealer,
    type: 'draw',
    text: `Dealer opens with 14 tiles`,
  });
  return state;
}

/** Move bonus tiles aside and draw replacements from the back of the wall. */
export function replaceBonuses(s: GameState, seat: number): void {
  const p = s.seats[seat];
  let guard = 0;
  while (guard++ < 20) {
    const idx = p.hand.findIndex((k) => isBonus(k));
    if (idx < 0) return;
    const k = p.hand[idx];
    p.hand.splice(idx, 1);
    p.flowers.push(k);
    log(s, { seat, type: 'flower', k, text: `${kind(k).label} — set aside` });
    const repl = drawReplacement(s);
    if (repl === null) return;
    p.hand.push(repl);
  }
}

function drawReplacement(s: GameState): number | null {
  const t = s.dead.length ? s.dead.pop()! : s.wall.shift() ?? null;
  return t;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function concealedSize(p: PlayerState): number {
  return p.hand.length;
}

export function isTurn(s: GameState, seat: number): boolean {
  return s.phase === 'discard' && s.turn === seat;
}

export function canDiscard(s: GameState, seat: number): boolean {
  return isTurn(s, seat) && s.seats[seat].hand.length === 14 - s.seats[seat].melds.length * 3;
}

function counterClockwise(from: number, steps: number): number {
  return (from + steps) % 4;
}

export interface ClaimOption {
  seat: number;
  type: ClaimType;
  /** For chi: two hand kinds, ascending. */
  withKinds?: number[];
  /** Points the hand would score, for hu options. */
  points?: number;
  fan?: number;
  qualifying?: boolean;
}

/** Every claim any seat may make on the pending discard. */
export function claimOptions(s: GameState): ClaimOption[] {
  if (s.phase !== 'claim' || !s.pending) return [];
  const out: ClaimOption[] = [];
  const { k, from } = s.pending;

  for (let i = 1; i <= 3; i++) {
    const seat = counterClockwise(from, i);
    const p = s.seats[seat];
    const counts = countsOf(p.hand);
    if (counts[k] + 1 >= 2) {
      const test = counts.slice();
      test[k]++;
      if (isWinningCounts(test, p.melds.length)) {
        const sc = scoreHand(test.flatMap((n, kk) => Array(n).fill(kk)), p.melds, {
          seat,
          wind: (seat - s.dealer + 4) % 4,
          roundWind: s.roundWind,
          selfDraw: false,
          lastTile: s.wall.length === 0,
          replacement: false,
          robbingKong: false,
          flowers: p.flowers,
          firstDiscardOfHand: s.firstDiscardOfHand && from === s.dealer,
          limit: s.limit,
          minFan: s.minFan,
        }, k);
        if (sc.qualifying) out.push({ seat, type: 'hu', points: sc.points, fan: sc.fan, qualifying: true });
      }
    }
    if (counts[k] >= 2) out.push({ seat, type: 'pon' });
    if (counts[k] >= 3) out.push({ seat, type: 'kan' });
    if (i === 1 && k <= 26) {
      const rank = (k % 9) + 1;
      const base = k - (rank - 1);
      for (const start of [rank - 2, rank - 1, rank]) {
        if (start < 1 || start > 7) continue;
        const kinds = [base + start - 1, base + start, base + start + 1];
        const others = kinds.filter((x) => x !== k);
        if (others.every((x) => counts[x] > 0)) out.push({ seat, type: 'chi', withKinds: others });
      }
    }
  }
  return out;
}

export function claimsFor(s: GameState, seat: number): ClaimOption[] {
  return claimOptions(s).filter((c) => c.seat === seat);
}

/** Kinds the seat may kong from its own hand on its turn (concealed or added). */
export function selfKongKinds(s: GameState, seat: number): number[] {
  if (!canDiscard(s, seat)) return [];
  const p = s.seats[seat];
  const counts = countsOf(p.hand);
  const out: number[] = [];
  for (let k = 0; k < 34; k++) {
    if (counts[k] === 4) out.push(k);
    const pung = p.melds.find((m) => m.type === 'pung' && m.k === k);
    if (pung && counts[k] >= 1) out.push(k);
  }
  return out;
}

export function canSelfWin(s: GameState, seat: number): { ok: boolean; points?: number; fan?: number } {
  if (!canDiscard(s, seat)) return { ok: false };
  const p = s.seats[seat];
  const counts = countsOf(p.hand);
  if (!isWinningCounts(counts, p.melds.length)) return { ok: false };
  const sc = scoreHand(p.hand, p.melds, {
    seat,
    wind: (seat - s.dealer + 4) % 4,
    roundWind: s.roundWind,
    selfDraw: true,
    lastTile: s.wall.length === 0,
    replacement: s.lastDrawn !== null && s.replacementDraw === true,
    robbingKong: false,
    flowers: p.flowers,
    limit: s.limit,
    minFan: s.minFan,
  }, p.hand[p.hand.length - 1]);
  return { ok: sc.qualifying, points: sc.points, fan: sc.fan };
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export class IllegalAction extends Error {}

export function applyAction(state: GameState, action: GameAction): GameState {
  const s: GameState = structuredClone(state);
  switch (action.type) {
    case 'discard': doDiscard(s, action.seat, action.k); break;
    case 'claim': doClaim(s, action.seat, action.claim, action.withKinds, action.k); break;
    case 'pass': doPass(s, action.seat); break;
    case 'hu': doSelfWin(s, action.seat); break;
    case 'draw': doDraw(s, action.seat); break;
    case 'kan': doSelfKong(s, action.seat, action.k); break;
    default: throw new IllegalAction(`unknown action`);
  }
  return s;
}

function doDraw(s: GameState, seat: number): void {
  if (s.phase !== 'draw' && !(s.phase === 'discard' && s.turn === seat && !canDiscard(s, seat))) {
    throw new IllegalAction('not a draw state');
  }
  drawFor(s, seat);
}

function drawFor(s: GameState, seat: number): void {
  const p = s.seats[seat];
  s.turn = seat;
  s.phase = 'discard';
  if (s.wall.length === 0) {
    endDraw(s);
    return;
  }
  const k = s.wall.shift()!;
  if (isBonus(k)) {
    p.flowers.push(k);
    log(s, { seat, type: 'flower', k, text: `${kind(k).label} — set aside` });
    const repl = drawReplacement(s);
    if (repl === null) { endDraw(s); return; }
    p.hand.push(repl);
    s.lastDrawn = repl;
    s.lastDrawSeat = seat;
    s.replacementDraw = true;
    replaceBonuses(s, seat);
    log(s, { seat, type: 'draw', text: `${seatName(seat)} draws a replacement` });
    return;
  }
  p.hand.push(k);
  s.lastDrawn = k;
  s.lastDrawSeat = seat;
  s.replacementDraw = false;
  log(s, { seat, type: 'draw', text: `${seatName(seat)} draws` });
}

function doDiscard(s: GameState, seat: number, k: number): void {
  if (!canDiscard(s, seat)) throw new IllegalAction('cannot discard now');
  const p = s.seats[seat];
  const idx = p.hand.indexOf(k);
  if (idx < 0) throw new IllegalAction(`tile ${k} not in hand`);
  p.hand.splice(idx, 1);
  p.hand.sort((a, b) => a - b);
  p.discards.push(k);
  s.lastDrawn = null;
  s.pending = { k, from: seat };
  log(s, { seat, type: 'discard', k, text: `${seatName(seat)} discards ${kind(k).label}` });

  // Phase must already read `claim` or claimOptions refuses to look.
  s.phase = 'claim';
  const opts = claimOptions(s);
  if (opts.length === 0) {
    s.pending = null;
    s.phase = 'discard';
    s.firstDiscardOfHand = false;
    advance(s, seat);
    return;
  }
  s.pendingSeats = [...new Set(opts.map((o) => o.seat))];
  s.claimResponses = {};
  s.firstDiscardOfHand = false;
}

function advance(s: GameState, from: number): void {
  const next = counterClockwise(from, 1);
  drawFor(s, next);
}

function doPass(s: GameState, seat: number): void {
  if (s.phase !== 'claim') return;
  if (!s.pendingSeats.includes(seat)) return;
  s.claimResponses[seat] = { type: 'pass' };
  maybeResolve(s);
}

function doClaim(s: GameState, seat: number, claim: ClaimType, withKinds?: number[], k?: number): void {
  if (s.phase !== 'claim' || !s.pending) throw new IllegalAction('no discard to claim');
  if (!s.pendingSeats.includes(seat)) throw new IllegalAction('seat cannot claim');
  s.claimResponses[seat] = { type: claim, withKinds, k };
  maybeResolve(s);
}

const PRIORITY: Record<ClaimType | 'pass', number> = { hu: 3, kan: 2, pon: 2, chi: 1, pass: 0 };

function maybeResolve(s: GameState): void {
  if (!s.pending) return;
  const answered = s.pendingSeats.every((seat) => s.claimResponses[seat]);
  const anyHu = Object.values(s.claimResponses).some((r) => r && r.type === 'hu');
  if (!answered && !anyHu) return;

  const { k, from } = s.pending;
  let best: { seat: number; type: ClaimType; withKinds?: number[] } | null = null;
  for (const seat of s.pendingSeats) {
    const r = s.claimResponses[seat];
    if (!r || r.type === 'pass') continue;
    const cand = { seat, type: r.type as ClaimType, withKinds: r.withKinds };
    if (!best) { best = cand; continue; }
    const po = PRIORITY[cand.type];
    const pb = PRIORITY[best.type];
    if (po > pb || (po === pb && counterDistance(from, seat) < counterDistance(from, best.seat))) {
      best = cand;
    }
  }

  if (!best) {
    s.pending = null;
    s.pendingSeats = [];
    s.claimResponses = {};
    advance(s, from);
    return;
  }

  const claimer = s.seats[best.seat];
  const discarder = s.seats[from];
  if (best.type === 'hu') {
    const counts = countsOf(claimer.hand);
    counts[k]++;
    const hand = counts.flatMap((n, kk) => Array(n).fill(kk));
    finishHand(s, best.seat, k, from, hand, false);
    return;
  }

  // Remove the tile from the discarder's river: it now belongs to the meld.
  discarder.discards.pop();

  if (best.type === 'pon') {
    const idx = claimer.hand.indexOf(k);
    if (idx < 0) throw new IllegalAction('pung tile missing from hand');
    claimer.hand.splice(idx, 1);
    const idx2 = claimer.hand.indexOf(k);
    claimer.hand.splice(idx2, 1);
    claimer.melds.push({ type: 'pung', k, concealed: false, from, tiles: [k, k, k] });
    log(s, { seat: best.seat, type: 'pon', k, text: `${seatName(best.seat)} pons ${kind(k).label}` });
    s.pending = null; s.pendingSeats = []; s.claimResponses = {};
    s.turn = best.seat;
    s.phase = 'discard';
    s.lastDrawn = null;
    return;
  }

  if (best.type === 'kan') {
    for (let i = 0; i < 3; i++) {
      const j = claimer.hand.indexOf(k);
      if (j < 0) break;
      claimer.hand.splice(j, 1);
    }
    claimer.melds.push({ type: 'kong', k, concealed: false, from, tiles: [k, k, k, k] });
    log(s, { seat: best.seat, type: 'kan', k, text: `${seatName(best.seat)} kongs ${kind(k).label}` });
    s.pending = null; s.pendingSeats = []; s.claimResponses = {};
    s.turn = best.seat;
    s.phase = 'discard';
    const repl = drawReplacement(s);
    if (repl === null) { endDraw(s); return; }
    claimer.hand.push(repl);
    s.lastDrawn = repl;
    s.replacementDraw = true;
    if (isBonus(repl)) replaceBonuses(s, best.seat);
    claimer.hand.sort((a, b) => a - b);
    return;
  }

  // chi
  const withKinds = best.withKinds ?? [];
  for (const wk of withKinds) {
    const j = claimer.hand.indexOf(wk);
    if (j < 0) throw new IllegalAction('chi tiles missing');
    claimer.hand.splice(j, 1);
  }
  const tiles = [k, ...withKinds].sort((a, b) => a - b);
  claimer.melds.push({ type: 'chow', k: tiles[0], concealed: false, from, tiles });
  log(s, { seat: best.seat, type: 'chi', k, text: `${seatName(best.seat)} chis ${kind(k).label}` });
  s.pending = null; s.pendingSeats = []; s.claimResponses = {};
  s.turn = best.seat;
  s.phase = 'discard';
  s.lastDrawn = null;
}

function doSelfKong(s: GameState, seat: number, k: number): void {
  const options = selfKongKinds(s, seat);
  if (!options.includes(k)) throw new IllegalAction('cannot kong that tile');
  const p = s.seats[seat];
  const pung = p.melds.find((m) => m.type === 'pung' && m.k === k);
  if (pung) {
    pung.type = 'kong';
    pung.tiles = [k, k, k, k];
    pung.added = true;
    const j = p.hand.indexOf(k);
    // `splice(-1, 1)` removes the LAST tile, so a missing copy must fail loudly
    if (j < 0) throw new IllegalAction('kong tile missing from hand');
    p.hand.splice(j, 1);
    log(s, { seat, type: 'kan', k, text: `${seatName(seat)} adds to the kong of ${kind(k).label}` });
  } else {
    for (let i = 0; i < 4; i++) {
      const j = p.hand.indexOf(k);
      // never splice(-1): that silently throws away the wrong tile
      if (j < 0) throw new IllegalAction('kong tile missing from hand');
      p.hand.splice(j, 1);
    }
    p.melds.push({ type: 'kong', k, concealed: true, from: null, tiles: [k, k, k, k] });
    log(s, { seat, type: 'kan', k, text: `${seatName(seat)} declares a concealed kong of ${kind(k).label}` });
  }
  const repl = drawReplacement(s);
  if (repl === null) { endDraw(s); return; }
  p.hand.push(repl);
  s.lastDrawn = repl;
  s.replacementDraw = true;
  if (isBonus(repl)) replaceBonuses(s, seat);
  p.hand.sort((a, b) => a - b);
  s.turn = seat;
  s.phase = 'discard';
}

function doSelfWin(s: GameState, seat: number): void {
  const info = canSelfWin(s, seat);
  if (!info.ok) throw new IllegalAction('hand is not a qualifying win');
  const p = s.seats[seat];
  finishHand(s, seat, s.lastDrawn ?? p.hand[p.hand.length - 1], null, p.hand.slice(), true);
}

function finishHand(s: GameState, seat: number, winKind: number, from: number | null, concealed: number[], selfDraw: boolean): void {
  const p = s.seats[seat];
  const score = scoreHand(concealed, p.melds, {
    seat,
    wind: (seat - s.dealer + 4) % 4,
    roundWind: s.roundWind,
    selfDraw,
    lastTile: s.wall.length === 0,
    replacement: selfDraw && s.replacementDraw === true,
    robbingKong: false,
    flowers: p.flowers,
    limit: s.limit,
    minFan: s.minFan,
  }, winKind);

  s.win = {
    seat,
    from,
    tile: winKind,
    selfDraw,
    lastTile: s.wall.length === 0,
    replacement: selfDraw && s.replacementDraw === true,
    robbingKong: false,
    score,
  };
  s.phase = 'ended';
  s.pending = null;
  s.pendingSeats = [];
  log(s, {
    seat,
    type: 'win',
    k: winKind,
    text: `${seatName(seat)} wins ${selfDraw ? 'on the draw' : `on ${seatName(from!)}'s discard`} — ${score.fan} fan`,
  });
}

function endDraw(s: GameState): void {
  s.phase = 'ended';
  s.drawGame = true;
  s.pending = null;
  s.pendingSeats = [];
  log(s, { seat: null, type: 'drawGame', text: 'The wall runs dry — drawn hand' });
}

function counterDistance(from: number, seat: number): number {
  return (seat - from + 4) % 4;
}

export function seatName(seat: number): string {
  return ['East', 'South', 'West', 'North'][seat];
}

/** Waits for the seat on turn, for hint UI. */
export function currentWaits(s: GameState, seat: number): number[] {
  const p = s.seats[seat];
  if (p.hand.length !== 13 - p.melds.length * 3) return [];
  return winningKinds(countsOf(p.hand), p.melds.length);
}

export { spriteUrl };
