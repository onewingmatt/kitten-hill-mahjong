import type { Personality } from '../types';

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
  };
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'bramble',
    name: 'Bramble',
    tagline: 'Waits for the big hand and never blinks.',
    personality: p({ name: 'Bramble', setBias: 0.55, greed: 0.85, caution: 0.7, aggression: 0.3, honourLoyalty: 0.6 }),
  },
  {
    id: 'pip',
    name: 'Pip',
    tagline: 'Fast little hands, all day long.',
    personality: p({ name: 'Pip', setBias: 0.25, greed: 0.1, caution: 0.45, aggression: 0.9, honourLoyalty: 0.2 }),
  },
  {
    id: 'mochi',
    name: 'Mochi',
    tagline: 'Hoards dragons and dares you to stop her.',
    personality: p({ name: 'Mochi', setBias: 0.95, greed: 0.6, caution: 0.3, aggression: 0.7, honourLoyalty: 0.95 }),
  },
  {
    id: 'sable',
    name: 'Sable',
    tagline: 'Discards like nothing can hurt him.',
    personality: p({ name: 'Sable', setBias: 0.6, greed: 0.5, caution: 0.1, aggression: 0.85, honourLoyalty: 0.4, tilt: 0.1 }),
  },
  {
    id: 'nine',
    name: 'Nine',
    tagline: 'Chasing the impossible hand, every time.',
    personality: p({ name: 'Nine', setBias: 0.4, greed: 0.9, caution: 0.4, aggression: 0.4, honourLoyalty: 0.8, limitHunter: 1, tilt: 0.5 }),
  },
  {
    id: 'olive',
    name: 'Olive',
    tagline: 'One suit, no mercy.',
    personality: p({ name: 'Olive', setBias: 0.45, greed: 0.75, caution: 0.55, aggression: 0.5, honourLoyalty: 0.5, suits: [2.4, 0.6, 0.6] }),
  },
  {
    id: 'juniper',
    name: 'Juniper',
    tagline: 'Bamboo is the only suit that exists.',
    personality: p({ name: 'Juniper', setBias: 0.4, greed: 0.7, caution: 0.6, aggression: 0.45, honourLoyalty: 0.45, suits: [0.5, 2.4, 0.6] }),
  },
  {
    id: 'walnut',
    name: 'Walnut',
    tagline: 'Old, careful, impossible to bluff.',
    personality: p({ name: 'Walnut', setBias: 0.5, greed: 0.55, caution: 0.95, aggression: 0.15, honourLoyalty: 0.55, tilt: 0.05 }),
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

export function encodePersonality(p: Personality): string {
  const bytes = [
    Math.round(p.setBias * 15),
    Math.round(p.greed * 15),
    Math.round(p.caution * 15),
    Math.round(p.aggression * 15),
    Math.round(p.honourLoyalty * 15),
    Math.round((p.suits[0] / 2.4) * 15),
    Math.round((p.suits[1] / 2.4) * 15),
    Math.round((p.suits[2] / 2.4) * 15),
    Math.round(p.limitHunter * 15),
    Math.round(p.tilt * 15),
  ];
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    out += CODE_ALPHABET[bytes[i]] + CODE_ALPHABET[bytes[i + 1] ?? 0];
  }
  const sum = bytes.reduce((a, b) => a + b, 0) % 32;
  return `${out}-${CODE_ALPHABET[sum]}`;
}

export function decodePersonality(code: string, name = 'Guest'): Personality | null {
  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== 11) return null;
  const idx = (c: string) => CODE_ALPHABET.indexOf(c);
  const nums: number[] = [];
  for (let i = 0; i < 10; i++) {
    const v = idx(cleaned[i]);
    if (v < 0) return null;
    nums.push(v);
  }
  const sum = nums.reduce((a, b) => a + b, 0) % 32;
  if (idx(cleaned[10]) !== sum) return null;
  return {
    name,
    setBias: nums[0] / 15,
    greed: nums[1] / 15,
    caution: nums[2] / 15,
    aggression: nums[3] / 15,
    honourLoyalty: nums[4] / 15,
    suits: [(nums[5] / 15) * 2.4, (nums[6] / 15) * 2.4, (nums[7] / 15) * 2.4],
    limitHunter: nums[8] / 15,
    tilt: nums[9] / 15,
  };
}
