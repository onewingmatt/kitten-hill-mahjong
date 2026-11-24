import { describe, expect, it } from 'vitest';
import { PLAYER_NAMES, pickPlayerName } from '../src/client/names';
import { ARCHETYPES } from '../src/engine/bots/personality';

describe('player cat names', () => {
  it('never offers a name that belongs to a cat already at the table', () => {
    const bots = new Set(ARCHETYPES.map((a) => a.name.trim().toLowerCase()));
    for (const n of PLAYER_NAMES) {
      expect(bots.has(n.toLowerCase()), `${n} is also a bot`).toBe(false);
    }
  });

  it('replaces the three roster names that used to be in the pool', () => {
    // Sable, Mochi and Olive were the defaults' collisions
    for (const bad of ['Sable', 'Mochi', 'Olive']) {
      expect(PLAYER_NAMES).not.toContain(bad);
    }
  });

  it('stays a usable pool: enough names, no duplicates, no blanks', () => {
    expect(PLAYER_NAMES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(PLAYER_NAMES.map((n) => n.toLowerCase())).size).toBe(PLAYER_NAMES.length);
    for (const n of PLAYER_NAMES) expect(n.trim().length).toBeGreaterThan(0);
  });

  it('picks inside the pool for any random roll, including the edges', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      expect(PLAYER_NAMES).toContain(pickPlayerName(r));
    }
    // a roll of exactly 1 must not fall off the end
    expect(PLAYER_NAMES).toContain(pickPlayerName(1));
  });
});
