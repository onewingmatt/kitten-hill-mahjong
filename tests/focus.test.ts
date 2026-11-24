import { describe, expect, it } from 'vitest';
import { kindAt } from '../src/client/focus';

describe('the raised tile', () => {
  const rack = [0, 4, 8, 12, 16, 20, 24, 27, 28, 31, 32, 33, 34];

  it('finds the tile at a live index', () => {
    expect(kindAt(rack, 0)).toBe(0);
    expect(kindAt(rack, 12)).toBe(34);
  });

  it('is nothing when nothing is raised', () => {
    expect(kindAt(rack, null)).toBeNull();
  });

  // the crash: a server snapshot replaced the hand while a tile was raised, and
  // `display[selected]` returned undefined — truthy against `!== null`, so the
  // raise chip called spriteUrl(undefined) and threw
  it('survives a selection that outlived the hand', () => {
    const shrunk = rack.slice(0, 10);
    expect(kindAt(shrunk, 13)).toBeNull();
    expect(kindAt(shrunk, 10)).toBeNull();
    expect(kindAt([], 0)).toBeNull();
  });

  it('ignores junk indices rather than reading them', () => {
    expect(kindAt(rack, -1)).toBeNull();
    expect(kindAt(rack, 2.5)).toBeNull();
    expect(kindAt(rack, Number.NaN)).toBeNull();
    expect(kindAt([0, undefined as unknown as number], 1)).toBeNull();
  });
});
