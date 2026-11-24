import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../src/engine/bots/personality';
import { BOT_LOOKS, designedCat } from '../src/client/looks';
import { defaultCat } from '../src/client/cat';

describe('designed cat looks', () => {
  it('gives every requested cat a full appearance with no holes', () => {
    for (const id of ['hank', 'grizzly', 'freida']) {
      const cat = designedCat(id);
      expect(cat, `${id} has no designed look`).not.toBeNull();
      expect(Object.keys(cat!)).toEqual(Object.keys(defaultCat()));
      for (const [k, v] of Object.entries(cat!)) {
        expect(v, `${id}.${k} is undefined`).not.toBeUndefined();
      }
    }
  });

  it('designs a face for every cat in the roster, not just the new three', () => {
    // the hashed fallback mixes in the seat index and draws from a six-colour
    // palette, which is what made a whole table read as the same grey cat
    for (const a of ARCHETYPES) {
      expect(BOT_LOOKS[a.id], `${a.name} still falls back to the hash`).toBeDefined();
      expect(designedCat(a.id), `${a.name} has no design`).not.toBeNull();
    }
  });

  it('keeps no two roster cats in the same colour family', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.replace('#', ''), 16);
      return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    };
    const hueKey = (hex: string) => {
      const n = parseInt(hex.replace('#', ''), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 18) return `mono:${Math.round(lum(hex) * 8)}`;
      const hue = r === max ? (60 * ((g - b) / (max - min))) : g === max ? 60 * (2 + (b - r) / (max - min)) : 60 * (4 + (r - g) / (max - min));
      return `${Math.round(((hue + 360) % 360) / 45)}:${Math.round(lum(hex) * 8)}`;
    };
    const seen = new Map<string, string>();
    for (const a of ARCHETYPES) {
      const fur = designedCat(a.id)!.fur;
      // the two near-black cats are allowed to share a family: they are told
      // apart by markings (brown tabby vs none), which the tests above pin
      if (Math.max(...[1, 3, 5].map((i) => parseInt(fur.slice(i, i + 2), 16))) < 0x40) continue;
      const key = hueKey(fur);
      expect(seen.get(key), `${a.name} shares its coat family with ${seen.get(key)}`).toBeUndefined();
      seen.set(key, a.name);
    }
  });

  it('keeps at most two cats at the near-black end, so both stay legible on the felt', () => {
    const dark = ARCHETYPES.map((a) => designedCat(a.id)!).filter(
      (c) => Math.max(...[1, 3, 5].map((i) => parseInt(c.fur.slice(i, i + 2), 16))) < 0x40,
    );
    expect(dark.length).toBeLessThanOrEqual(2);
  });

  it('keeps Hank grey and long-haired, and slim', () => {
    const hank = designedCat('hank')!;
    expect(hank.hair).toBe('long');
    expect(hank.weight).toBeLessThan(0.9);
    // a grey cat: all three channels close together and mid-dark
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hank.fur.slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(12);
    expect(hank.fur).not.toBe(defaultCat().fur);
  });

  it('keeps Grizzly black-and-brown, long-haired and slimmer than medium build', () => {
    const grizzly = designedCat('grizzly')!;
    expect(grizzly.hair).toBe('long');
    expect(grizzly.weight).toBeLessThan(1);
    // dark base coat, warmer brown second colour: red climbs, blue stays low
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const blue = (hex: string) => parseInt(hex.slice(5, 7), 16);
    expect(blue(grizzly.fur)).toBeLessThan(0x40);
    expect(red(grizzly.patternColor)).toBeGreaterThan(red(grizzly.fur) + 0x40);
    expect(blue(grizzly.patternColor)).toBeLessThan(0x50);
  });

  it('keeps Freida a medium-build black cat, neutral rather than brown', () => {
    const freida = designedCat('freida')!;
    expect(freida.weight).toBeCloseTo(1, 5);
    expect(freida.hair).not.toBe('long');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(freida.fur.slice(i, i + 2), 16));
    expect(Math.max(r, g, b)).toBeLessThan(0x50);
    // Grizzly already owns "black and brown", so her black must not read warm
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(0x0c);
  });

  it('separates Grizzly from Freida: his black carries brown markings, hers carries none', () => {
    const grizzly = designedCat('grizzly')!;
    const freida = designedCat('freida')!;
    // both coats are black first
    for (const cat of [grizzly, freida]) {
      expect(Math.max(...[1, 3, 5].map((i) => parseInt(cat.fur.slice(i, i + 2), 16)))).toBeLessThan(0x40);
    }
    // the difference is the marking colour and the markings themselves
    expect(grizzly.pattern).not.toBe('solid');
    expect(freida.pattern).toBe('solid');
    const warm = (hex: string) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16);
    expect(warm(grizzly.patternColor)).toBeGreaterThanOrEqual(0x30);
    expect(warm(freida.patternColor)).toBeLessThanOrEqual(0x0c);
  });

  it('only designs looks for cats that exist, and never two the same', () => {
    const ids = ARCHETYPES.map((a) => a.id);
    for (const id of Object.keys(BOT_LOOKS)) expect(ids).toContain(id);
    const seen = new Set<string>();
    for (const id of ids) {
      const cat = designedCat(id);
      if (!cat) continue;
      const key = `${cat.fur}|${cat.pattern}|${cat.hair}|${cat.weight}`;
      expect(seen.has(key), `${id} duplicates another cat's coat`).toBe(false);
      seen.add(key);
      // the same cat must resolve identically on every table and every seat
      expect(designedCat(id)).toEqual(cat);
    }
  });
});
