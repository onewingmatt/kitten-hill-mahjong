import { CatAppearance, defaultCat } from './cat';

/**
 * Named cats are designed, not hashed.
 *
 * `botCat()` derives a look from a string hash *plus the seat index*, which is
 * only right for a shared cat code (there is no author to honour). For a cat the
 * player is meant to recognise it produced two failures: the coat changed with
 * the chair, and a six-colour palette across eleven cats left the table looking
 * like four variations of the same grey. Every archetype gets an entry here; the
 * hash fallback now only serves codes from other players.
 *
 * Legibility rules when adding one: the coat has to clear the dark felt at 32px,
 * so at most two cats may sit at the near-black end, and coat length, pattern,
 * eyes and collar should be spread so no two cats read as siblings.
 */
export const BOT_LOOKS: Record<string, Partial<CatAppearance>> = {
  /** Ginger tabby, round, waits for the big hand. */
  bramble: {
    fur: '#d98b3a',
    patternColor: '#8c4f1e',
    pattern: 'tabby',
    eyes: '#7bc96f',
    eyeStyle: 'almond',
    size: 1.05,
    weight: 1.22,
    earSize: 1,
    collar: '#2f4a5c',
    accessory: 'none',
    hair: 'short',
    seed: 11,
  },
  /** Cream and russet, spotted and quick. */
  pip: {
    fur: '#f0e2ca',
    patternColor: '#b8422f',
    pattern: 'spots',
    eyes: '#67c6e3',
    eyeStyle: 'wide',
    size: 0.9,
    weight: 0.76,
    earSize: 0.92,
    collar: '#c2403f',
    accessory: 'none',
    hair: 'none',
    seed: 19,
  },
  /** Lilac-point, fluffy and greedy. */
  mochi: {
    fur: '#cbc7da',
    patternColor: '#5a5266',
    pattern: 'pointed',
    eyes: '#67c6e3',
    eyeStyle: 'round',
    size: 0.94,
    weight: 1.28,
    earSize: 0.94,
    collar: '#8a4f7d',
    accessory: 'ribbon',
    hair: 'medium',
    seed: 29,
  },
  /** Pale blue shorthair, discards like nothing can hurt him. */
  sable: {
    fur: '#a9b2c0',
    patternColor: '#6c7789',
    pattern: 'solid',
    eyes: '#e0b64a',
    eyeStyle: 'sleepy',
    size: 1.02,
    weight: 0.88,
    earSize: 1,
    collar: null,
    accessory: 'none',
    hair: 'none',
    seed: 37,
  },
  /** Calico, all three colours, chasing the impossible hand. */
  nine: {
    fur: '#f7f2e8',
    patternColor: '#b8422f',
    pattern: 'calico',
    eyes: '#9b6bd6',
    eyeStyle: 'wide',
    size: 0.96,
    weight: 0.95,
    earSize: 1.02,
    collar: '#2f8f7f',
    accessory: 'none',
    hair: 'short',
    seed: 43,
  },
  /** Olive-brown tabby, one suit and no mercy. */
  olive: {
    fur: '#8a8a52',
    patternColor: '#4e5130',
    pattern: 'tabby',
    eyes: '#d98b3a',
    eyeStyle: 'almond',
    size: 1,
    weight: 0.92,
    earSize: 1.04,
    collar: '#e0b64a',
    accessory: 'none',
    hair: 'short',
    seed: 47,
  },
  /** Pale sage bicolour, bamboo is the only suit that exists. */
  juniper: {
    fur: '#9db08c',
    patternColor: '#5c6b52',
    pattern: 'bicolour',
    eyes: '#7bc96f',
    eyeStyle: 'round',
    size: 0.98,
    weight: 0.84,
    earSize: 1.06,
    collar: '#2f4a5c',
    accessory: 'flower',
    hair: 'none',
    seed: 53,
  },
  /** Walnut brown, long-haired, old and unhurried. */
  walnut: {
    fur: '#8a5f3c',
    patternColor: '#42281a',
    pattern: 'tabby',
    eyes: '#e0b64a',
    eyeStyle: 'sleepy',
    size: 1.03,
    weight: 1.12,
    earSize: 1,
    collar: null,
    accessory: 'none',
    hair: 'long',
    seed: 59,
  },
  /** Dark grey, slim, long-haired: a charcoal tabby that hangs off the jaw. */
  hank: {
    fur: '#6d7178',
    patternColor: '#43474d',
    pattern: 'tabby',
    eyes: '#e0b64a',
    eyeStyle: 'almond',
    size: 1.02,
    weight: 0.78,
    earSize: 1.06,
    collar: '#2f8f7f',
    accessory: 'none',
    hair: 'long',
    seed: 7,
  },
  /** Black and brown, longer-haired, slimmer: brown tabby markings on a near-black coat. */
  grizzly: {
    fur: '#382d26',
    patternColor: '#b1763f',
    pattern: 'tabby',
    eyes: '#d98b3a',
    eyeStyle: 'sleepy',
    size: 1.04,
    weight: 0.82,
    earSize: 1.08,
    collar: null,
    accessory: 'none',
    hair: 'long',
    seed: 23,
  },
  /** Medium build, black, sleek: no coat overlay at all, the plain one in the way. */
  freida: {
    fur: '#26221f',
    patternColor: '#181513',
    pattern: 'solid',
    eyes: '#7bc96f',
    eyeStyle: 'wide',
    size: 1,
    weight: 1,
    earSize: 1,
    collar: '#c2403f',
    accessory: 'none',
    hair: 'none',
    seed: 55,
  },
};

/** A designed look when the cat has one, otherwise null so the caller can hash. */
export function designedCat(id: string): CatAppearance | null {
  const look = BOT_LOOKS[id];
  if (!look) return null;
  return { ...defaultCat(look.seed ?? 1), ...look };
}
