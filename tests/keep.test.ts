import { describe, expect, it } from 'vitest';
import { pruneKeep } from '../src/client/store';

/**
 * Marks are keyed by tile KIND, not by slot, because the rack is a permutation
 * that reindexes on every draw. The only legitimate removal is a kind that has
 * left the hand; pruning anything else silently loses the player's intent.
 */
describe('pruneKeep', () => {
  it('keeps every mark whose kind is still in hand', () => {
    const keep = [5, 12, 30];
    expect(pruneKeep(keep, [5, 7, 12, 30, 33])).toEqual([5, 12, 30]);
  });

  it('drops a mark whose last copy has gone', () => {
    expect(pruneKeep([5, 12], [5, 7, 9])).toEqual([5]);
  });

  it('returns the same array when nothing changed, so React can skip the update', () => {
    const keep = [5, 12];
    expect(pruneKeep(keep, [5, 12, 20])).toBe(keep);
  });

  it('keeps a mark while one copy of a duplicated kind remains', () => {
    expect(pruneKeep([5], [5, 5, 9])).toEqual([5]);
  });

  it('empties out on a fresh hand only when the kinds are gone', () => {
    expect(pruneKeep([5, 12], [1, 2, 3])).toEqual([]);
    expect(pruneKeep([], [1, 2, 3])).toEqual([]);
  });
});
