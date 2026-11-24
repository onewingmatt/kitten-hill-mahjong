import { ARCHETYPES } from '../engine/bots/personality';

/**
 * Names a player's own cat can be given.
 *
 * The name is a placeholder — it fills the field until the player types over it,
 * and "Surprise me" rolls a new one — so it has to read as "yours, not one of
 * the cats you sit down with". Sable, Mochi and Olive were all on this list and
 * all three are bots, which put two cats called Sable at one table.
 *
 * The filter is the actual rule: the roster grows, so the list is checked against
 * it rather than trusted to stay clear.
 */
const CANDIDATES = [
  'Biscuit', 'Marmalade', 'Toast', 'Pebble', 'Nori', 'Clementine', 'Miso', 'Hazel',
  'Pumpkin', 'Pickle', 'Waffle', 'Clove', 'Fig', 'Taro', 'Poppy', 'Pepper',
  'Saffron', 'Mango', 'Tofu', 'Dumpling',
];

const taken = new Set(ARCHETYPES.map((a) => a.name.trim().toLowerCase()));

/** Never empty: if the roster ever swallowed the whole list, fall back to one name. */
export const PLAYER_NAMES: string[] = CANDIDATES.filter((n) => !taken.has(n.toLowerCase()));

export function pickPlayerName(rand: number = Math.random()): string {
  const pool = PLAYER_NAMES.length ? PLAYER_NAMES : ['Cat'];
  return pool[Math.floor(rand * pool.length) % pool.length];
}
