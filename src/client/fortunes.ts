import { kind, rankOf, suitOf } from '../engine/tiles';

export interface Fortune {
  title: string;
  body: string;
  omen: 'good' | 'mixed' | 'wild';
}

const NUMBER_THEMES: Record<number, { title: string; body: string }> = {
  1: { title: 'The First Paw', body: 'Nothing has been decided yet. Begin the thing you keep circling.' },
  2: { title: 'Two Warm Ears', body: 'A pair is a promise. Someone is already on your side of the table.' },
  3: { title: 'Three Bright Whiskers', body: 'Company arrives from an unexpected direction. Feed it.' },
  4: { title: 'Four Soft Steps', body: 'Walk the long way home. The short way has a dog on it.' },
  5: { title: 'The Middle Cushion', body: 'You are exactly where you should be. Stop checking the exit.' },
  6: { title: 'Six Sleepy Hours', body: 'Rest is a strategy. Take the nap you have been postponing.' },
  7: { title: 'Seven Lucky Naps', body: 'Fortune favours the cat who is already comfortable.' },
  8: { title: 'Eight Full Bowls', body: 'What you have is enough. What you want is also coming.' },
  9: { title: 'Nine Lives Left', body: 'Nothing you lose this week can actually finish you.' },
};

const SUIT_FLAVOUR: Record<number, string> = {
  0: 'Coins rattle in a quiet room: small, steady gains.',
  1: 'Bamboo grows in the dark before anyone notices: patient growth.',
  2: 'Words carry farther than paws can reach: say the kind thing.',
};

const HONOUR_THEMES: Record<number, { title: string; body: string; omen: Fortune['omen'] }> = {
  27: { title: 'The East Window', body: 'The sun lands on your cushion first. Lead, and the table follows.', omen: 'good' },
  28: { title: 'The South Garden', body: 'Warmth from an old friend. Accept the invitation you were going to skip.', omen: 'good' },
  29: { title: 'The West Gate', body: 'Something you lent is coming back — not always in the shape you lent it.', omen: 'mixed' },
  30: { title: 'The North Shelf', body: 'Cold air, clear head. The answer is in the book you already own.', omen: 'mixed' },
  31: { title: 'Red Dragon', body: 'The loudest luck in the deck. Spend it on something you will still want in a year.', omen: 'good' },
  32: { title: 'Green Dragon', body: 'Wealth that grows quietly. Water the thing nobody is watching.', omen: 'good' },
  33: { title: 'White Dragon', body: 'A blank tile is not an empty one. You are allowed to start over.', omen: 'wild' },
};

const BONUS_THEMES: { title: string; body: string; omen: Fortune['omen'] }[] = [
  { title: 'Plum Blossom', body: 'The first flower of a hard season. Your patience is about to look like luck.', omen: 'good' },
  { title: 'Orchid', body: 'Rare things arrive quietly, usually while you are doing the dishes.', omen: 'good' },
  { title: 'Chrysanthemum', body: 'A long autumn, generously spent. Call the person you keep meaning to call.', omen: 'good' },
  { title: 'Bamboo Flower', body: 'The plant that only blooms once. Do the strange thing now.', omen: 'wild' },
  { title: 'Spring', body: 'Everything is early this year, including you.', omen: 'good' },
  { title: 'Summer', body: 'Heat and appetite. Say yes to the second bowl.', omen: 'good' },
  { title: 'Autumn', body: 'Harvest what you planted, even the messy rows.', omen: 'mixed' },
  { title: 'Winter', body: 'The quiet month where the good decisions get made.', omen: 'mixed' },
];

/**
 * The fortune on the end screen is drawn from the tile that won the hand: the
 * number sets the theme, the suit colours it, honours and flowers get their own.
 */
export function fortuneFor(k: number, seed = 0): Fortune {
  const def = kind(k);
  if (k >= 34) {
    const f = BONUS_THEMES[def.n - 1] ?? BONUS_THEMES[0];
    return { ...f, title: `Fortune of the ${def.label}` };
  }
  if (k >= 27) {
    const f = HONOUR_THEMES[k] ?? HONOUR_THEMES[27];
    return f;
  }
  const theme = NUMBER_THEMES[rankOf(k)];
  const suit = SUIT_FLAVOUR[suitOf(k) ?? 0];
  const flip = (seed + k) % 4 === 0;
  return {
    title: `${theme.title} · ${def.label}`,
    body: flip ? suit : `${theme.body} ${suit}`,
    omen: flip ? 'mixed' : 'good',
  };
}
