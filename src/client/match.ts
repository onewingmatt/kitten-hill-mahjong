import type { GameState } from '../engine/types';
import type { SeatMeta } from './store';

/**
 * A solo match that survives the tab.
 *
 * iOS Safari evicts backgrounded tabs under memory pressure and silently
 * reloads them; Android does the same when it needs the RAM. Without this the
 * player loses a half-played match to a text message, with no warning and
 * nothing to come back to. Only solo is saved: online the server owns the game
 * and a stale local copy would be a second, wrong, source of truth.
 */
const KEY = 'khm.match.v1';
const VERSION = 1;

export interface SavedMatch {
  v: number;
  savedAt: number;
  target: 1 | 2 | 3;
  handNo: number;
  dealer: number;

  handWins: number[];
  seats: SeatMeta[];
  game: GameState;
  mySeat: number;
  myOrder: number[];
  keep: number[];
  matchOver: boolean;
  lastWinSeat: number | null;
  resultOpen: boolean;
}

export type MatchSnapshot = Omit<SavedMatch, 'v' | 'savedAt'>;

export function saveMatch(m: MatchSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...m, v: VERSION, savedAt: Date.now() }));
  } catch {
    /* quota or private mode: a lost save must never break the table */
  }
}

export function isTileKind(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 41;
}

const allKinds = (arr: unknown[]): boolean => arr.every(isTileKind);

/**
 * One seat, by content. `Array.isArray(hand)` is not enough: a save holding a
 * hole, a string, or a 16-tile hand resumes into a table that throws on the
 * first render — `kind(undefined)` takes the whole screen to the crash page.
 * A hand is 13 tiles per meld-adjusted rack, plus the one tile on turn.
 */
function seatLooksWhole(p: unknown): boolean {
  if (!p || typeof p !== 'object') return false;
  const seat = p as Partial<GameState['seats'][number]>;
  if (!Array.isArray(seat.hand) || !Array.isArray(seat.discards) || !Array.isArray(seat.melds) || !Array.isArray(seat.flowers)) {
    return false;
  }
  if (!allKinds(seat.hand) || !allKinds(seat.discards) || !allKinds(seat.flowers)) return false;
  const rack = 13 - 3 * seat.melds.length;
  if (rack < 0 || seat.hand.length < rack || seat.hand.length > rack + 1) return false;
  for (const m of seat.melds) {
    if (!m || typeof m !== 'object') return false;
    const meld = m as { type?: unknown; k?: unknown; tiles?: unknown };
    if (!Array.isArray(meld.tiles) || !allKinds(meld.tiles)) return false;
    if (meld.tiles.length !== (meld.type === 'kong' ? 4 : 3)) return false;
    if (!isTileKind(meld.k)) return false;
  }
  return true;
}

export function looksWhole(m: unknown): m is SavedMatch {
  if (!m || typeof m !== 'object') return false;
  const s = m as Partial<SavedMatch>;
  if (s.v !== VERSION) return false;
  if (!s.game || typeof s.game !== 'object') return false;
  const g = s.game as Partial<GameState>;
  if (!Array.isArray(g.seats) || g.seats.length !== 4) return false;
  if (!Array.isArray(g.wall) || !Array.isArray(g.dead)) return false;
  if (!allKinds(g.wall) || !allKinds(g.dead)) return false;
  if (typeof g.turn !== 'number' || typeof g.phase !== 'string') return false;
  if (g.lastDrawn != null && !isTileKind(g.lastDrawn)) return false;
  if (g.pending && !isTileKind((g.pending as { k?: unknown }).k)) return false;
  if (g.win && !isTileKind((g.win as { tile?: unknown }).tile)) return false;
  if (!g.seats.every(seatLooksWhole)) return false;
  if (!Array.isArray(s.seats) || s.seats.length !== 4) return false;
  if (!s.seats.every((x) => x && typeof x.name === 'string' && x.cat && x.personality)) return false;
  if (!Array.isArray(s.handWins) || s.handWins.length !== 4) return false;
  if (typeof s.handNo !== 'number' || typeof s.mySeat !== 'number') return false;
  return true;
}

export function loadSavedMatch(): SavedMatch | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!looksWhole(parsed)) {
      // a save from another build or a half-written one: drop it rather than
      // resuming into a table with a broken hand
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedMatch(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
