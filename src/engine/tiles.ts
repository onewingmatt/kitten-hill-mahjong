import type { KindGroup } from './types';

/**
 * The 42 tile kinds, indexed 0..41.
 *
 *   0..8   dots 1-9      (pack art: `dots_N.png`   — the pack calls this suit "Flower")
 *   9..17  bamboo 1-9    (pack art: `bamboo_N.png`)
 *  18..26  chars 1-9     (pack art: `chars_N.png`)
 *  27..30  winds E S W N (pack art: `winds_N.png`, baked corner glyph)
 *  31..33  dragons 中 發 白 (`dragons_N.png`)
 *  34..37  flowers       (`flowers_N.png`, baked glyph)
 *  38..41  seasons       (`seasons_N.png`, baked glyph)
 */
export interface KindDef {
  k: number;
  /** Wire id, e.g. "d3". */
  id: string;
  group: KindGroup;
  /** 1-9 for suits, 1-4 for winds/flowers/seasons, 1-3 for dragons. */
  n: number;
  /** Sprite filename in public/tiles. */
  sprite: string;
  /** Short plain-English label used in logs and accessibility text. */
  label: string;
  /** True for terminals and honours (base-point class). */
  isTerminalOrHonour: boolean;
  isHonour: boolean;
  isBonus: boolean;
  /** Only meaningful for suits. */
  suitIndex: number | null;
}

const SUIT_SPRITE: Record<string, string> = { d: 'dots', b: 'bamboo', c: 'chars' };
const SUIT_WORD: Record<string, string> = { d: 'Dots', b: 'Bamboo', c: 'Characters' };

function buildKinds(): KindDef[] {
  const out: KindDef[] = [];
  (['d', 'b', 'c'] as const).forEach((s, si) => {
    for (let n = 1; n <= 9; n++) {
      out.push({
        k: out.length,
        id: `${s}${n}`,
        group: s,
        n,
        sprite: `${SUIT_SPRITE[s]}_${n}.png`,
        label: `${SUIT_WORD[s]} ${n}`,
        isTerminalOrHonour: n === 1 || n === 9,
        isHonour: false,
        isBonus: false,
        suitIndex: si,
      });
    }
  });
  const winds = ['East', 'South', 'West', 'North'];
  winds.forEach((w, i) => {
    out.push({
      k: out.length,
      id: `w${i + 1}`,
      group: 'w',
      n: i + 1,
      sprite: `winds_${i + 1}.png`,
      label: `${w} Wind`,
      isTerminalOrHonour: true,
      isHonour: true,
      isBonus: false,
      suitIndex: null,
    });
  });
  ['Red', 'Green', 'White'].forEach((d, i) => {
    out.push({
      k: out.length,
      id: `g${i + 1}`,
      group: 'g',
      n: i + 1,
      sprite: `dragons_${i + 1}.png`,
      label: `${d} Dragon`,
      isTerminalOrHonour: true,
      isHonour: true,
      isBonus: false,
      suitIndex: null,
    });
  });
  const flowers = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo'];
  flowers.forEach((f, i) => {
    out.push({
      k: out.length,
      id: `f${i + 1}`,
      group: 'f',
      n: i + 1,
      sprite: `flowers_${i + 1}.png`,
      label: `${f} Flower`,
      isTerminalOrHonour: false,
      isHonour: false,
      isBonus: true,
      suitIndex: null,
    });
  });
  const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
  seasons.forEach((s, i) => {
    out.push({
      k: out.length,
      id: `s${i + 1}`,
      group: 's',
      n: i + 1,
      sprite: `seasons_${i + 1}.png`,
      label: `${s} Season`,
      isTerminalOrHonour: false,
      isHonour: false,
      isBonus: true,
      suitIndex: null,
    });
  });
  return out;
}

export const KINDS: KindDef[] = buildKinds();
export const NUM_KINDS = 34; // 0..33 are the playable kinds
export const BONUS_START = 34;
export const BONUS_END = 41;

export const WIND_K = [27, 28, 29, 30];
export const DRAGON_K = [31, 32, 33];

/** First kind index of each suit (dots, bamboo, chars). */
export const SUIT_BASE = [0, 9, 18];

export const THIRTEEN_ORPHAN_SET = new Set([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);

export const DRAGON_LABELS = ['Red Dragon', 'Green Dragon', 'White Dragon'];

export function kindById(id: string): KindDef {
  const found = KINDS.find((x) => x.id === id);
  if (!found) throw new Error(`unknown tile kind ${id}`);
  return found;
}

export function kind(k: number): KindDef {
  const def = KINDS[k];
  if (!def) throw new Error(`tile kind index out of range: ${k}`);
  return def;
}

export function isSuit(k: number): boolean {
  return k >= 0 && k <= 26;
}

export function suitOf(k: number): number | null {
  return isSuit(k) ? Math.floor(k / 9) : null;
}

export function rankOf(k: number): number {
  return isSuit(k) ? (k % 9) + 1 : kind(k).n;
}

export function isHonour(k: number): boolean {
  return k >= 27 && k <= 33;
}

export function isBonus(k: number): boolean {
  return k >= BONUS_START && k <= BONUS_END;
}

export function isTerminal(k: number): boolean {
  return isSuit(k) && (rankOf(k) === 1 || rankOf(k) === 9);
}

export function isTerminalOrHonour(k: number): boolean {
  return isTerminal(k) || isHonour(k);
}

/**
 * Seat-relative bonus tile: flowers/seasons 1-4 map to seats E,S,W,N.
 * A player's "seat flower" is worth extra points and a double when both match.
 */
export function isSeatBonus(k: number, seat: number): boolean {
  return isBonus(k) && kind(k).n === seat + 1;
}

/** Sprite url for a kind, with a cache-busting version shared by all callers. */
export const TILE_SPRITE_VERSION = '4';   // art re-centred on the tile silhouette: /tiles are immutable for a year
export function spriteUrl(k: number, base = '/tiles/'): string {
  return `${base}${kind(k).sprite}?v=${TILE_SPRITE_VERSION}`;
}
