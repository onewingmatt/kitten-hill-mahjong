/** Kitten Hill Mahjong — shared types for engine, server and client. */

/** Suits. `d` = dots/circles, `b` = bamboo, `c` = characters (craks). */
export type Suit = 'd' | 'b' | 'c';
/** Honour groups. `w` = winds, `g` = dragons. */
export type Honour = 'w' | 'g';
/** Bonus tiles. `f` = flowers, `s` = seasons. */
export type Bonus = 'f' | 's';

export type KindGroup = Suit | Honour | Bonus;

/** A tile is identified across the wire by its kind id, e.g. "d3", "w1", "g2". */
export interface Tile {
  /** Unique instance id inside a game (for stable animation keys). */
  id: string;
  /** Kind index 0..41. See KINDS in tiles.ts. */
  k: number;
}

export type MeldType = 'chow' | 'pung' | 'kong';

export interface Meld {
  type: MeldType;
  /** Lowest kind index of the meld (chow base, pung/kong kind). */
  k: number;
  /** True when the meld was formed from the player's own hand (never called). */
  concealed: boolean;
  /** Seat the tile was called from, null for concealed. */
  from: number | null;
  /** Kind indices, length 3 (chow/pung) or 4 (kong). */
  tiles: number[];
  /** For kongs: true once the 4th tile was added from a later draw. */
  added?: boolean;
}

export type ClaimType = 'chi' | 'pon' | 'kan' | 'hu';

export interface Claim {
  seat: number;
  type: ClaimType;
  /** For chi: the two hand kinds used, ascending. */
  withKinds?: number[];
  /** For kan: kind. */
  k?: number;
}

export type Wind = 0 | 1 | 2 | 3; // E S W N

export type Phase = 'draw' | 'discard' | 'claim' | 'ended';

export interface ScoreLine {
  label: string;
  value: number;
}

export interface HandScore {
  fan: number;
  miniPoints: number;
  doubles: ScoreLine[];
  bonusPoints: ScoreLine[];
  points: number;
  limit: boolean;
  qualifying: boolean;
  patternLabels: string[];
}

export interface WinInfo {
  seat: number;
  from: number | null; // null = self draw
  tile: number;
  selfDraw: boolean;
  lastTile: boolean;
  replacement: boolean;
  robbingKong: boolean;
  score: HandScore;
}

export interface PlayerState {
  seat: number;
  hand: number[]; // concealed kinds, sorted
  melds: Meld[];
  flowers: number[]; // bonus tiles drawn (kinds 34..41)
  discards: number[]; // kinds in discard order
  riichiLike?: never;
  isBot: boolean;
}

export interface LogEntry {
  t: number;
  seat: number | null;
  type:
    | 'deal'
    | 'draw'
    | 'discard'
    | 'chi'
    | 'pon'
    | 'kan'
    | 'flower'
    | 'win'
    | 'drawGame'
    | 'pass';
  k?: number;
  text: string;
}

export interface GameState {
  seats: PlayerState[];
  /** Live wall (draw from the front). */
  wall: number[];
  /** Dead wall used for kong/flower replacements (drawn from the back). */
  dead: number[];
  turn: number;
  dealer: number;
  roundWind: Wind;
  phase: Phase;
  /** The tile available for claim, if any. */
  pending: { k: number; from: number } | null;
  /** Seats that may still act on `pending`. */
  pendingSeats: number[];
  /** Claim responses gathered so far, keyed by seat. */
  claimResponses: Record<number, { type: ClaimType | 'pass'; withKinds?: number[]; k?: number } | undefined>;
  lastDrawn: number | null;
  /** Seat that drew the last tile (for last-tile detection). */
  lastDrawSeat: number | null;
  /** True when the last draw came from a kong/flower replacement. */
  replacementDraw?: boolean;
  /** True until the dealer's opening discard has been made. */
  firstDiscardOfHand: boolean;
  /** Point cap for a single hand. */
  limit: number;
  /** Doubles required to declare a win (Chinese Classical: 3). */
  minFan: number;
  seed: number;
  win: WinInfo | null;
  log: LogEntry[];
  handNumber: number;
  /** Monotonic counter used for animation sequencing on the client. */
  seq: number;
  drawGame: boolean;
}

export type GameAction =
  | { type: 'draw'; seat: number }
  | { type: 'discard'; seat: number; k: number }
  | { type: 'claim'; seat: number; claim: ClaimType; withKinds?: number[]; k?: number }
  | { type: 'kan'; seat: number; k: number }
  | { type: 'pass'; seat: number }
  | { type: 'hu'; seat: number };

export interface Personality {
  /** Display identity. */
  name: string;
  /** 0..1 — prefers pungs/kongs over chows. */
  setBias: number;
  /** 0..1 — prefers cheap fast hands over expensive long shots. */
  greed: number;
  /** 0..1 — folds and discards safely instead of pushing. */
  caution: number;
  /** 0..1 — how eagerly they call from discards. */
  aggression: number;
  /** 0..1 — how much they hoard honour tiles / dragons. */
  honourLoyalty: number;
  /** Relative suit affinity, dots/bamboo/chars. */
  suits: [number, number, number];
  /** 0..1 — chases 13 orphans / nine gates style limit hands. */
  limitHunter: number;
  /** 0..1 — tilts after big losses (worse decisions for a hand). */
  tilt: number;
  /**
   * 0..1 — how often the cat takes the best discard available. 1 is flawless,
   * 0.5 is roughly a quarter of turns taking the second-best line. This is the
   * only axis that changes the *quality* of a bot's play, not just its taste.
   */
  efficiency: number;
}
