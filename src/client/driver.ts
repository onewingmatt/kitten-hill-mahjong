import type { GameState } from '../engine/types';

/**
 * The bot driver's "has this position already been stepped?" key.
 *
 * `seq` counts log entries, and a claim answer is silent: `doPass`/`doClaim`
 * only write `claimResponses` and log nothing until the claim resolves. Two
 * seats offered the same discard therefore share one `seq`, so keying the
 * guard on `seq` alone let the first bot's pass look like "already stepped"
 * and the driver stopped stepping — the table sat on "Waiting on calls…"
 * forever with nobody to answer. Counting the answers part of the key makes
 * every silent pass a new position, and still dedupes plain re-renders.
 */
export function driverKey(game: GameState | null): string {
  if (!game) return '';
  const answered = game.phase === 'claim' ? Object.keys(game.claimResponses).length : 0;
  return `${game.seq}:${game.phase}:${answered}`;
}
