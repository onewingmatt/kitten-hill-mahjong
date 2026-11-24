import { describe, expect, it } from 'vitest';
import { NEUTRAL, decodePersonality, encodePersonality, healPersonality } from '../src/engine/bots/personality';

describe('an incoming personality is a claim, not a fact', () => {
  it('fills a v1 vector with every field the bot reads', () => {
    // a v1 cat code's shape: no field was ever added, but a hand-written or
    // future-versioned vector may arrive missing anything
    const v1 = { name: 'Toast', setBias: 0.9, greed: 0.4, caution: 0.3, aggression: 0.8, honourLoyalty: 0.2, suits: [1, 1, 1], limitHunter: 0.1 };
    const healed = healPersonality(v1);
    expect(healed.setBias).toBe(0.9);
    expect(healed.limitHunter).toBe(0.1);
    expect(healed.tilt).toBe(NEUTRAL.tilt);
    expect(Number.isFinite(healed.tilt)).toBe(true);
  });

  it('clamps junk instead of passing NaN into the chooser', () => {
    const healed = healPersonality({ setBias: Number.NaN, greed: 9, caution: -4, suits: [7, 'x', 0], tilt: Infinity });
    expect(healed.setBias).toBe(NEUTRAL.setBias);
    expect(healed.greed).toBe(1);
    expect(healed.caution).toBe(0);
    expect(healed.suits[0]).toBe(2.4);
    expect(healed.suits[1]).toBe(1);
    expect(healed.suits[2]).toBe(0.3);
    expect(healed.tilt).toBe(NEUTRAL.tilt);
  });

  it('survives nothing at all', () => {
    expect(healPersonality(undefined)).toEqual(NEUTRAL);
    expect(healPersonality(null, 'Guest').name).toBe('Guest');
  });

  it('decodes a v1 cat code into a complete vector', () => {
    const style = decodePersonality('JHQBNNNNCD-V');
    expect(style).not.toBeNull();
    expect(Number.isFinite(style!.tilt)).toBe(true);
    expect(style!.suits).toHaveLength(3);
  });

  it('round-trips a code', () => {
    const code = encodePersonality(NEUTRAL);
    const back = decodePersonality(code);
    expect(back).not.toBeNull();
    for (const k of ['setBias', 'greed', 'caution', 'aggression', 'honourLoyalty', 'limitHunter', 'tilt'] as const) {
      expect(Math.abs(back![k] - NEUTRAL[k])).toBeLessThanOrEqual(1 / 15 + 1e-9);
    }
  });
});
