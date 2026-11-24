import type { Personality } from '../types';

/** The vector a cat plays with before the table has measured anything. */
export const NEUTRAL: Personality = {
  name: 'you',
  setBias: 0.5,
  greed: 0.5,
  caution: 0.5,
  aggression: 0.42,
  honourLoyalty: 0.5,
  suits: [1, 1, 1],
  limitHunter: 0.25,
  tilt: 0.2,
  efficiency: 0.9,
};

/**
 * Anything arriving from storage, a backup or a share code is a claim, not a
 * vector: a v1 cat code has no field the v2 bot reads, and `undefined` inside
 * `chooseDiscard` turns every score into `NaN` and every discard into a coin
 * flip. Heal every incoming personality at the boundary.
 */
export function healPersonality(raw: unknown, name?: string): Personality {
  const p = (raw ?? {}) as Partial<Personality>;
  const num = (v: unknown, fallback: number, lo: number, hi: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  const suits = Array.isArray(p.suits) && p.suits.length === 3 ? p.suits : NEUTRAL.suits;
  return {
    name: typeof p.name === 'string' && p.name.trim() ? p.name.slice(0, 14) : (name ?? NEUTRAL.name),
    setBias: num(p.setBias, NEUTRAL.setBias, 0, 1),
    greed: num(p.greed, NEUTRAL.greed, 0, 1),
    caution: num(p.caution, NEUTRAL.caution, 0, 1),
    aggression: num(p.aggression, NEUTRAL.aggression, 0, 1),
    honourLoyalty: num(p.honourLoyalty, NEUTRAL.honourLoyalty, 0, 1),
    suits: [num(suits[0], 1, 0.3, 2.4), num(suits[1], 1, 0.3, 2.4), num(suits[2], 1, 0.3, 2.4)],
    limitHunter: num(p.limitHunter, NEUTRAL.limitHunter, 0, 1),
    tilt: num(p.tilt, NEUTRAL.tilt, 0, 1),
    efficiency: num(p.efficiency, NEUTRAL.efficiency, 0.2, 1),
  };
}

/**
 * A personality is a play-style vector, not a difficulty level. Difficulty is
 * separate: every bot plays the same sound baseline and the vector bends the
 * choices (what to keep, what to chuck, when to call, what to chase).
 */
export interface Archetype {
  id: string;
  /** Cat name shown at the table. */
  name: string;
  /** One-line play-style description shown on the profile card. */
  tagline: string;
  personality: Personality;
}

function p(o: Partial<Personality> & { name: string }): Personality {
  return {
    name: o.name,
    setBias: o.setBias ?? 0.5,
    greed: o.greed ?? 0.5,
    caution: o.caution ?? 0.5,
    aggression: o.aggression ?? 0.5,
    honourLoyalty: o.honourLoyalty ?? 0.5,
    suits: o.suits ?? [1, 1, 1],
    limitHunter: o.limitHunter ?? 0,
    tilt: o.tilt ?? 0.3,
    efficiency: o.efficiency ?? 0.9,
  };
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'bramble',
    name: 'Bramble',
    tagline: 'Waits for the big hand and never blinks.',
    personality: p({ name: 'Bramble', setBias: 0.55, greed: 0.85, caution: 0.7, aggression: 0.3, honourLoyalty: 0.6, efficiency: 0.92 }),
  },
  {
    id: 'pip',
    name: 'Pip',
    tagline: 'Fast little hands, all day long.',
    personality: p({ name: 'Pip', setBias: 0.25, greed: 0.1, caution: 0.45, aggression: 0.9, honourLoyalty: 0.2, efficiency: 0.86 }),
  },
  {
    id: 'mochi',
    name: 'Mochi',
    tagline: 'Hoards dragons and dares you to stop her.',
    personality: p({ name: 'Mochi', setBias: 0.95, greed: 0.6, caution: 0.3, aggression: 0.7, honourLoyalty: 0.95, efficiency: 0.9 }),
  },
  {
    id: 'sable',
    name: 'Sable',
    tagline: 'Discards like nothing can hurt him.',
    personality: p({ name: 'Sable', setBias: 0.6, greed: 0.5, caution: 0.1, aggression: 0.85, honourLoyalty: 0.4, tilt: 0.1, efficiency: 0.72 }),
  },
  {
    id: 'nine',
    name: 'Nine',
    tagline: 'Chasing the impossible hand, every time.',
    personality: p({ name: 'Nine', setBias: 0.4, greed: 0.9, caution: 0.4, aggression: 0.4, honourLoyalty: 0.8, limitHunter: 1, tilt: 0.5, efficiency: 0.68 }),
  },
  {
    id: 'olive',
    name: 'Olive',
    tagline: 'One suit, no mercy.',
    personality: p({ name: 'Olive', setBias: 0.45, greed: 0.75, caution: 0.55, aggression: 0.5, honourLoyalty: 0.5, suits: [2.4, 0.6, 0.6], efficiency: 0.84 }),
  },
  {
    id: 'juniper',
    name: 'Juniper',
    tagline: 'Bamboo is the only suit that exists.',
    personality: p({ name: 'Juniper', setBias: 0.4, greed: 0.7, caution: 0.6, aggression: 0.45, honourLoyalty: 0.45, suits: [0.5, 2.4, 0.6], efficiency: 0.84 }),
  },
  {
    id: 'walnut',
    name: 'Walnut',
    tagline: 'Old, careful, impossible to bluff.',
    personality: p({ name: 'Walnut', setBias: 0.5, greed: 0.55, caution: 0.95, aggression: 0.15, honourLoyalty: 0.55, tilt: 0.05, efficiency: 0.96 }),
  },
  {
    id: 'hank',
    name: 'Hank',
    tagline: 'Slow hands, long coat, nothing wasted.',
    personality: p({ name: 'Hank', setBias: 0.55, greed: 0.7, caution: 0.8, aggression: 0.35, honourLoyalty: 0.55, tilt: 0.1, efficiency: 0.94 }),
  },
  {
    id: 'grizzly',
    name: 'Grizzly',
    tagline: 'Settles into characters and growls at the rest.',
    personality: p({ name: 'Grizzly', setBias: 0.5, greed: 0.75, caution: 0.5, aggression: 0.55, honourLoyalty: 0.6, suits: [0.6, 0.6, 2.3], tilt: 0.35, efficiency: 0.8 }),
  },
  {
    id: 'freida',
    name: 'Freida',
    tagline: 'Never passes on a free pung.',
    personality: p({ name: 'Freida', setBias: 0.6, greed: 0.45, caution: 0.6, aggression: 0.75, honourLoyalty: 0.5, tilt: 0.2, efficiency: 0.88 }),
  },
];

export function archetypeById(id: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.id === id);
}

/** Human-readable label derived from the vector, for profile cards. */
export function playStyleLabel(p: Personality): string {
  const parts: string[] = [];
  if (p.aggression > 0.7) parts.push('Caller');
  else if (p.aggression < 0.25) parts.push('Silent');
  if (p.caution > 0.75) parts.push('Guarded');
  else if (p.caution < 0.2) parts.push('Reckless');
  if (p.greed > 0.75) parts.push('Dreamer');
  else if (p.greed < 0.25) parts.push('Sprinter');
  if (p.setBias > 0.8) parts.push('Pung-hunter');
  else if (p.setBias < 0.2) parts.push('Chow-runner');
  if (p.honourLoyalty > 0.85) parts.push('Dragon-keeper');
  if (p.limitHunter > 0.8) parts.push('Limit-chaser');
  const suitMax = Math.max(...p.suits);
  if (suitMax > 2) {
    const idx = p.suits.indexOf(suitMax);
    parts.push(['Dots-devoted', 'Bamboo-devoted', 'Character-devoted'][idx]);
  }
  return parts.slice(0, 3).join(' · ') || 'Balanced';
}

/**
 * Shareable code for a cat-bot: 6 bytes of play-style vector plus a checksum.
 * Deliberately lossy — a code carries the style, never the seat or the score.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Share code.
 *
 * v2 is thirteen characters: a `2` version marker, eleven nibbles (one per axis,
 * 0-15 each), and a checksum. v1 codes are ten nibbles plus a checksum with no
 * marker; they still decode, and the axis they never carried (`efficiency`) is
 * healed from neutral.
 */
const TRAITS = 11;

export function encodePersonality(p: Personality): string {
  const values = [
    p.setBias,
    p.greed,
    p.caution,
    p.aggression,
    p.honourLoyalty,
    p.suits[0] / 2.4,
    p.suits[1] / 2.4,
    p.suits[2] / 2.4,
    p.limitHunter,
    p.tilt,
    p.efficiency,
  ].map((v) => Math.max(0, Math.min(15, Math.round(v * 15))));
  let out = '2';
  for (const n of values) out += CODE_ALPHABET[n];
  const sum = values.reduce((a, b) => a + b, 0) % 32;
  return out + CODE_ALPHABET[sum];
}

export function decodePersonality(code: string, name = 'Guest'): Personality | null {
  const cleaned = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const idx = (c: string) => CODE_ALPHABET.indexOf(c);

  // v2: '2' + eleven axis nibbles + checksum
  if (cleaned.length === TRAITS + 2 && cleaned[0] === '2') {
    const nums: number[] = [];
    for (let i = 1; i <= TRAITS; i++) {
      const v = idx(cleaned[i]);
      if (v < 0) return null;
      nums.push(v);
    }
    if (idx(cleaned[TRAITS + 1]) !== nums.reduce((a, b) => a + b, 0) % 32) return null;
    return healPersonality({
      name,
      setBias: nums[0] / 15,
      greed: nums[1] / 15,
      caution: nums[2] / 15,
      aggression: nums[3] / 15,
      honourLoyalty: nums[4] / 15,
      suits: [(nums[5] / 15) * 2.4, (nums[6] / 15) * 2.4, (nums[7] / 15) * 2.4],
      limitHunter: nums[8] / 15,
      tilt: nums[9] / 15,
      efficiency: nums[10] / 15,
    }, name);
  }

  // v1: ten axis nibbles + checksum, no marker
  if (cleaned.length !== 11) return null;
  const nums: number[] = [];
  for (let i = 0; i < 10; i++) {
    const v = idx(cleaned[i]);
    if (v < 0) return null;
    nums.push(v);
  }
  if (idx(cleaned[10]) !== nums.reduce((a, b) => a + b, 0) % 32) return null;
  return healPersonality({
    name,
    setBias: nums[0] / 15,
    greed: nums[1] / 15,
    caution: nums[2] / 15,
    aggression: nums[3] / 15,
    honourLoyalty: nums[4] / 15,
    suits: [(nums[5] / 15) * 2.4, (nums[6] / 15) * 2.4, (nums[7] / 15) * 2.4],
    limitHunter: nums[8] / 15,
    tilt: nums[9] / 15,
  }, name);
}
