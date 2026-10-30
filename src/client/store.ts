import { create } from 'zustand';
import { applyAction, createHand, claimsFor, canSelfWin, claimOptions, selfKongKinds } from '../engine/game';
import type { ClaimType, GameAction, GameState, Personality } from '../engine/types';
import { ARCHETYPES, decodePersonality } from '../engine/bots/personality';
import { chooseClaim, chooseDiscard, chooseSelfKong, wantsSelfWin } from '../engine/bots/bot';
import { CatAppearance, defaultCat } from './cat';
import { SortMode, moveInOrder, reconcileOrder, sortHand } from './sort';
import { sfx, setMuted as setAudioMuted, unlockAudio } from './audio';
import { track } from './telemetry';
import { SavedMatch, clearSavedMatch, loadSavedMatch, saveMatch } from './match';
import {
  PlayStats,
  loadStats,
  saveStats,
  emptyStats,
  personalityFromStats,
  recordClaimOffer,
  recordHand,
  recordThrow,
} from './stats';

/** Kept for solo play, where the player always sits East. Online, read `mySeat`. */
export const HUMAN = 0;

export interface SeatMeta {
  name: string;
  cat: CatAppearance;
  personality: Personality;
  tag: string;
}

export interface Profile {
  name: string;
  cat: CatAppearance;
  /** The play-style vector baked into the cat; shareable as a bot code. */
  personality: Personality;
}

export type Screen = 'menu' | 'creator' | 'table';
export type PawPose = 'rest' | 'raise' | 'tap' | 'slam';

interface Banner {
  text: string;
  id: number;
}

interface Store {
  screen: Screen | 'lobby';
  /** solo plays the bots in this tab; online defers everything to the server */
  mode: 'solo' | 'online';
  online: 'idle' | 'connected' | 'offline';
  roomCode: string | null;
  roomPhase: 'lobby' | 'playing' | null;
  roomError: string | null;
  deadlineAt: number | null;
  /** solo only: the player pressed pause. Looking at a cat never pauses anything. */
  userPaused: boolean;
  profile: Profile | null;
  /** Measured play record: the source of your play-style vector. */
  stats: PlayStats;
  target: 1 | 2 | 3;
  handNo: number;
  dealer: number;
  scores: number[];
  handWins: number[];
  game: GameState | null;
  seats: SeatMeta[];
  sortMode: SortMode;
  /** The player's own hand order (kinds), used when sortMode === 'manual'. */
  myOrder: number[];
  /** Which seat this client controls. Solo is always 0. */
  mySeat: number;
  selected: number | null;
  muted: boolean;
  banner: Banner | null;
  paw: PawPose;
  matchOver: boolean;
  resultOpen: boolean;
  /** The player dismissed the result card to look at the table; a snapshot must not reopen it. */
  resultDismissed: boolean;
  coachSeen: boolean;
  /** A solo match left mid-play; the menu offers it back instead of the player losing it. */
  savedMatch: SavedMatch | null;
  /** The tutorial, re-opened from the menu rather than only on the first hand. */
  coachOpen: boolean;
  rival: { name: string; personality: Personality; cat: CatAppearance; code: string } | null;
  lastWinSeat: number | null;
  tick: number;
  /** Kinds the player has marked safe: these cannot be discarded by accident. */
  keep: number[];
  /** Bumped whenever a discard is refused, so the UI can react. */
  keepNudge: number;

  boot: () => void;
  go: (s: Screen) => void;
  saveProfile: (p: Profile) => void;
  startMatch: (target: 1 | 2 | 3) => void;
  startHand: () => void;
  act: (a: GameAction, opts?: { silent?: boolean }) => void;
  setMode: (m: 'solo' | 'online') => void;
  togglePause: () => void;
  enterLobby: () => void;
  selectTile: (index: number) => void;
  discardSelected: () => void;
  humanClaim: (type: ClaimType, withKinds?: number[]) => void;
  humanPass: () => void;
  humanHu: () => void;
  humanKong: (k: number) => void;
  /** Mark a group of kinds safe, or unmark it if every one of them already is. */
  toggleKeep: (kinds: number[]) => void;
  setSort: (m: SortMode) => void;
  moveTile: (from: number, to: number) => void;
  toggleMute: () => void;
  nextHand: () => void;
  /** A finished match starts over: fresh scores, same table. */
  rematch: () => void;
  /** Bring the result card back after the table has been inspected. */
  openResult: () => void;
  closeResult: () => void;
  leave: () => void;
  stepBot: () => void;
  nextActor: () => number | null;
  setPaw: (p: PawPose) => void;
  dismissCoach: () => void;
  openCoach: () => void;
  closeCoach: () => void;
  /** Pick up the saved solo match exactly where it stopped. */
  resume: () => void;
  /** Throw the saved match away. */
  dropSaved: () => void;
  say: (text: string) => void;
  addRival: (code: string, name?: string) => boolean;
  clearRival: () => void;
}

/** Short vibration on the actions that deserve one; silent when muted. */
function buzz(ms: number | number[]): void {
  if (!ms) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (getMuted()) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* not supported */
  }
}

const PROFILE_KEY = 'khm.profile.v1';
const PREFS_KEY = 'khm.prefs.v1';

let mutedState = false;
export function getMuted(): boolean {
  return mutedState;
}

function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    // a profile saved before a field existed is healed against today's defaults
    return { ...p, cat: { ...defaultCat(), ...(p.cat ?? {}) } };
  } catch {
    return null;
  }
}

function loadPrefs(): { muted: boolean; sortMode: SortMode } {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { muted: false, sortMode: 'manual' };
    const p = JSON.parse(raw) as { muted?: boolean; sortMode?: SortMode };
    return { muted: !!p.muted, sortMode: p.sortMode ?? 'manual' };
  } catch {
    return { muted: false, sortMode: 'manual' };
  }
}

function savePrefs(muted: boolean, sortMode: SortMode): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ muted, sortMode }));
  } catch {
    /* storage can be denied; preferences are not worth failing over */
  }
}

/** Three different cats at the table, chosen for contrast. */
function pickOpponents(): SeatMeta[] {
  const ids = ['bramble', 'pip', 'mochi', 'sable', 'nine', 'olive', 'juniper', 'walnut'];
  const shuffled = ids.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  return shuffled.map((id, i) => {
    const a = ARCHETYPES.find((x) => x.id === id)!;
    return {
      name: a.name,
      personality: a.personality,
      tag: a.tagline,
      cat: opponentCat(i, id),
    };
  });
}

function opponentCat(i: number, id: string): CatAppearance {
  const palette = ['#c99a6b', '#8c8f95', '#3e3a38', '#fbfaf7', '#e9a06a', '#5f7f6a'];
  const pattern: CatAppearance['pattern'][] = ['tabby', 'tuxedo', 'calico', 'bicolour', 'pointed', 'spots'];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return {
    ...defaultCat(h),
    fur: palette[(h + i) % palette.length],
    pattern: pattern[(h + i * 3) % pattern.length],
    patternColor: h % 3 === 0 ? '#f7f2e8' : '#4b3a2c',
    eyes: ['#7bc96f', '#e0b64a', '#67c6e3', '#9b6bd6'][(h + i) % 4],
    weight: 0.85 + ((h % 7) / 7) * 0.4,
    collar: ['#c2403f', '#2f8f7f', '#e0b64a', '#8a4f7d'][(h + i) % 4],
    accessory: (['none', 'ribbon', 'flower', 'scarf'] as CatAppearance['accessory'][])[(h + i) % 4],
    hair: (['none', 'short', 'long', 'medium', 'long'] as CatAppearance['hair'][])[(h + i) % 5],
  };
}

export const useStore = create<Store>((set, get) => ({
  screen: 'menu',
  mode: 'solo',
  online: 'idle',
  roomCode: null,
  roomPhase: null,
  roomError: null,
  deadlineAt: null,
  userPaused: false,
  profile: null,
  stats: emptyStats(),
  target: 2,
  handNo: 1,
  dealer: 0,
  scores: [0, 0, 0, 0],
  handWins: [0, 0, 0, 0],
  game: null,
  // four placeholder seats so nothing reads an undefined chair before the first deal
  seats: [0, 1, 2, 3].map((i) => ({
    name: 'Empty seat',
    cat: defaultCat(i * 13 + 5),
    personality: ARCHETYPES[0].personality,
    tag: 'open',
  })),
  sortMode: 'manual',
  myOrder: [],
  mySeat: 0,
  selected: null,
  keep: [],
  keepNudge: 0,
  muted: false,
  banner: null,
  paw: 'rest',
  matchOver: false,
  resultOpen: false,
  resultDismissed: false,
  coachSeen: true,
  savedMatch: null,
  coachOpen: false,
  rival: null,
  lastWinSeat: null,
  tick: 0,

  boot: () => {
    const prefs = loadPrefs();
    mutedState = prefs.muted;
    setAudioMuted(prefs.muted);
    let coachSeen = false;
    try {
      coachSeen = localStorage.getItem('khm.coach.v1') === 'done';
    } catch {
      coachSeen = true;
    }
    set({
      profile: loadProfile(),
      stats: loadStats(),
      muted: prefs.muted,
      sortMode: prefs.sortMode,
      coachSeen,
      savedMatch: loadSavedMatch(),
    });
  },

  addRival: (code, name) => {
    const p = decodePersonality(code, (name || 'Guest').trim().slice(0, 14) || 'Guest');
    if (!p) return false;
    const cat = opponentCat(1, code.slice(0, 6) || 'guest');
    set({ rival: { name: p.name || 'Guest', personality: p, cat, code: code.toUpperCase() } });
    return true;
  },

  clearRival: () => set({ rival: null }),

  dismissCoach: () => {
    try {
      localStorage.setItem('khm.coach.v1', 'done');
    } catch {
      /* ignore */
    }
    set({ coachSeen: true });
  },

  openCoach: () => set({ coachOpen: true }),

  closeCoach: () => {
    // the first-run coach also spends the one-shot flag; a replay does not
    if (!get().coachSeen) get().dismissCoach();
    set({ coachOpen: false });
  },

  resume: () => {
    const m = get().savedMatch;
    if (!m) return;
    unlockAudio();
    track('match:resume', { handNo: m.handNo, phase: m.game.phase });
    set({
      mode: 'solo',
      screen: 'table',
      target: m.target,
      handNo: m.handNo,
      dealer: m.dealer,
      scores: m.scores,
      handWins: m.handWins,
      seats: m.seats,
      game: m.game,
      mySeat: m.mySeat,
      myOrder: m.myOrder,
      keep: m.keep,
      matchOver: m.matchOver,
      lastWinSeat: m.lastWinSeat,
      resultOpen: m.resultOpen,
      resultDismissed: false,
      selected: null,
      userPaused: false,
      // resuming into a half-played hand is not the moment for the walkthrough
      coachSeen: true,
      tick: get().tick + 1,
    });
  },

  dropSaved: () => {
    clearSavedMatch();
    set({ savedMatch: null });
  },

  go: (screen) => set({ screen }),

  saveProfile: (p) => {
    // the vector is never chosen: it is whatever the table has measured so far
    const measured = { ...p, personality: personalityFromStats(get().stats) };
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(measured));
    } catch {
      /* ignore */
    }
    set({ profile: measured, screen: 'menu' });
    track('cat:saved', { seed: measured.cat.seed });
  },

  startMatch: (target) => {
    unlockAudio();
    clearSavedMatch();
    set({ savedMatch: null });
    track('sit', { target });
    const live = personalityFromStats(get().stats);
    const profile = get().profile
      ? { ...get().profile!, personality: live }
      : { name: 'You', cat: defaultCat(), personality: live };
    const rival = get().rival;
    let others = pickOpponents();
    if (rival) {
      // the shared cat takes the far seat so its play is easy to watch
      others = [
        others[0],
        { name: rival.name, cat: rival.cat, personality: rival.personality, tag: 'cat code' },
        others[2] ?? others[1],
      ];
    }
    const seats: SeatMeta[] = [
      { name: profile.name, cat: profile.cat, personality: profile.personality, tag: 'You' },
      ...others,
    ];
    set({
      target,
      seats,
      handNo: 1,
      dealer: 0,
      scores: [0, 0, 0, 0],
      handWins: [0, 0, 0, 0],
      matchOver: false,
      resultOpen: false,
      resultDismissed: false,
      lastWinSeat: null,
      screen: 'table',
    });
    get().startHand();
  },

  startHand: () => {
    const { handNo, dealer, scores } = get();
    const game = createHand({
      seed: Math.floor(Math.random() * 2 ** 31),
      dealer,
      handNumber: handNo,
      scores,
      bots: [false, true, true, true],
      minFan: 0,
    });
    set({
      game,
      myOrder: game.seats[get().mySeat].hand.slice(),
      selected: null,
      keep: [],
      resultOpen: false,
      resultDismissed: false,
      paw: 'rest',
      tick: get().tick + 1,
      banner: { text: `${seatWindLabel(dealer, dealer)} deals`, id: Date.now() },
    });
    get().say(`${['East', 'South', 'West', 'North'][dealer]} deals hand ${handNo}`);
  },

  act: (action, opts) => {
    if (get().mode === 'online') {
      // online the server is the only writer: send the intent, let the snapshot come back
      void import('./net').then((m) => m.net.action(action));
      if (!opts?.silent) {
        if (action.type === 'discard') sfx.discard();
        else if (action.type === 'claim') sfx.claim();
        else if (action.type === 'kan') sfx.kong();
      }
      return;
    }
    const game = get().game;
    if (!game || game.phase === 'ended') return;
    let next: GameState;
    try {
      next = applyAction(game, action);
    } catch (err) {
      console.warn('illegal action', action, err);
      return;
    }
    if (!opts?.silent) {
      if (action.type === 'discard') sfx.discard();
      else if (action.type === 'claim') sfx.claim();
      else if (action.type === 'kan') sfx.kong();
      else if (action.type === 'pass') sfx.pass();
    }
    buzz(action.type === 'claim' ? 14 : action.type === 'kan' ? 18 : action.type === 'pass' ? 0 : 6);
    set({ game: next, tick: get().tick + 1, selected: null });
    // a mark on a tile that has left the hand is not worth carrying around
    const mine = next.seats[get().mySeat]?.hand ?? [];
    const kept = get().keep.filter((k) => mine.includes(k));
    if (kept.length !== get().keep.length) set({ keep: kept });

    // what the table learns about you: only your own decisions, never a bot's
    if (action.seat === get().mySeat) {
      const before = game.seats[get().mySeat]?.discards.length ?? 0;
      let learned: PlayStats | null = null;
      if (action.type === 'discard') learned = recordThrow(get().stats, action.k, before);
      else if (action.type === 'pass') learned = recordClaimOffer(get().stats, null);
      else if (action.type === 'kan') learned = recordClaimOffer(get().stats, 'kan');
      else if (action.type === 'claim' && action.claim !== 'hu') learned = recordClaimOffer(get().stats, action.claim);
      if (learned) {
        saveStats(learned);
        set({ stats: learned });
      }
    }

    if (next.win) {
      sfx.win();
      buzz([16, 40, 22]);
      const winSeat = next.win.seat;
      const handWins = get().handWins.slice();
      handWins[winSeat] += 1;
      set({
        handWins,
        scores: next.scores,
        lastWinSeat: winSeat,
        resultOpen: true,
        matchOver: handWins[winSeat] >= get().target,
        paw: winSeat === get().mySeat ? 'slam' : 'rest',
      });
      {
        const measured = recordHand(get().stats, {
          won: winSeat === get().mySeat,
          draw: false,
          fan: next.win?.score?.fan ?? 0,
        });
        saveStats(measured);
        set({ stats: measured });
        track('hand:end', { won: winSeat === get().mySeat, fan: next.win?.score?.fan ?? 0, hands: measured.hands });
        void import('./sync').then((m) => m.autoBackup());
      }
    } else if (next.drawGame) {
      sfx.lose();
      set({ resultOpen: true, lastWinSeat: null, scores: next.scores });
      {
        const measured = recordHand(get().stats, { won: false, draw: true, fan: 0 });
        saveStats(measured);
        set({ stats: measured });
        track('hand:end', { won: false, drawn: true, hands: measured.hands });
        void import('./sync').then((m) => m.autoBackup());
      }
    }
  },

  selectTile: (index) => {
    const { game, selected } = get();
    if (!game || game.phase !== 'discard' || game.turn !== get().mySeat) return;
    if (selected === index) {
      get().discardSelected();
      return;
    }
    sfx.select();
    set({ selected: index });
  },

  discardSelected: () => {
    const { game, selected } = get();
    if (!game || selected === null) return;
    const hand = handView(get());
    const k = hand[selected];
    if (k === undefined) return;
    if (get().keep.includes(k)) {
      // a marked tile never leaves the hand by accident: the tap that would have
      // discarded it releases the mark instead, and the next tap discards
      sfx.pass();
      set({ keep: get().keep.filter((x) => x !== k), keepNudge: get().keepNudge + 1 });
      return;
    }
    set({ paw: 'tap' });
    get().act({ type: 'discard', seat: get().mySeat, k });
    window.setTimeout(() => set({ paw: 'rest' }), 340);
  },

  humanClaim: (type, withKinds) => {
    set({ paw: 'tap' });
    get().act({ type: 'claim', seat: get().mySeat, claim: type, withKinds });
    window.setTimeout(() => set({ paw: 'rest' }), 340);
  },

  humanPass: () => get().act({ type: 'pass', seat: get().mySeat }),

  humanHu: () => {
    set({ paw: 'slam' });
    get().act({ type: 'hu', seat: get().mySeat });
  },

  humanKong: (k) => {
    set({ paw: 'slam' });
    get().act({ type: 'kan', seat: get().mySeat, k });
    window.setTimeout(() => set({ paw: 'rest' }), 500);
  },

  toggleKeep: (kinds) => {
    const cur = get().keep;
    const all = kinds.every((k) => cur.includes(k));
    const next = all ? cur.filter((k) => !kinds.includes(k)) : [...new Set([...cur, ...kinds])];
    sfx.select();
    set({ keep: next, keepNudge: get().keepNudge + 1 });
  },

  setSort: (m) => {
    savePrefs(get().muted, m);
    // Switching back to manual picks up whatever order is currently on screen.
    // Switching back to manual returns the player's own arrangement, not the
    // sorted one they were just looking at: sorting is a lens, not an edit.
    const myOrder = reconcileOrder(get().myOrder, get().game?.seats[get().mySeat].hand ?? []);
    set({ sortMode: m, myOrder, selected: null });
  },

  moveTile: (from, to) => {
    // a drag always arranges what is on screen, whichever lens was active
    const order = handView(get());
    set({ myOrder: moveInOrder(order, from, to), sortMode: 'manual', selected: null });
  },

  toggleMute: () => {
    const muted = !get().muted;
    mutedState = muted;
    setAudioMuted(muted);
    savePrefs(muted, get().sortMode);
    set({ muted });
  },

  setMode: (m) => set({ mode: m }),

  togglePause: () => {
    if (get().mode === 'online') return;
    set({ userPaused: !get().userPaused });
  },

  enterLobby: () => {
    if (get().mode !== 'online') set({ mode: 'online' });
    set({ screen: 'lobby' });
  },

  nextHand: () => {
    const { lastWinSeat, dealer, handNo, matchOver } = get();
    if (matchOver) {
      // a finished match has no next hand: the CTA promises a new match, so give one
      get().rematch();
      return;
    }
    if (get().mode === 'online') {
      void import('./net').then((m) => m.net.nextHand());
      set({ resultOpen: false });
      return;
    }
    const nextDealer = lastWinSeat === dealer ? dealer : (dealer + 1) % 4;
    set({ dealer: nextDealer, handNo: handNo + 1, resultOpen: false });
    get().startHand();
  },

  rematch: () => {
    if (get().mode === 'online') {
      // the server resets the match when it is told to deal again
      void import('./net').then((m) => m.net.nextHand());
      set({ resultOpen: false });
      return;
    }
    unlockAudio();
    set({
      scores: [0, 0, 0, 0],
      handWins: [0, 0, 0, 0],
      handNo: 1,
      dealer: 0,
      matchOver: false,
      lastWinSeat: null,
      resultOpen: false,
      resultDismissed: false,
      userPaused: false,
    });
    get().startHand();
  },

  openResult: () => set({ resultOpen: true, resultDismissed: false }),
  closeResult: () => set({ resultOpen: false, resultDismissed: true }),

  leave: () => {
    if (get().mode === 'online') {
      void import('./net').then((m) => m.net.leave());
      set({ screen: 'menu', game: null, resultOpen: false, mode: 'solo', roomCode: null, deadlineAt: null, mySeat: 0 });
      return;
    }
    clearSavedMatch();
    set({
      screen: 'menu',
      game: null,
      resultOpen: false,
      resultDismissed: false,
      matchOver: false,
      savedMatch: null,
    });
  },

  nextActor: () => {
    const game = get().game;
    if (!game || game.phase === 'ended') return null;
    if (game.phase === 'claim') {
      const seat = game.pendingSeats.find((s) => !game.claimResponses[s]);
      return seat === undefined ? null : seat;
    }
    if (game.phase === 'discard') return game.turn;
    return null;
  },

  stepBot: () => {
    const game = get().game;
    if (!game) return;
    const seat = get().nextActor();
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__khmStep = {
        seat, phase: game.phase, seq: game.seq, turn: game.turn,
        pending: game.pendingSeats.slice(), at: Date.now(),
      };
    }
    if (seat === null || seat === get().mySeat) return;
    const persona = get().seats[seat]?.personality ?? ARCHETYPES[0].personality;

    if (game.phase === 'claim') {
      const dec = chooseClaim(game, seat, persona);
      if (dec.type) get().act({ type: 'claim', seat, claim: dec.type, withKinds: dec.withKinds });
      else get().act({ type: 'pass', seat }, { silent: true });
      return;
    }
    if (wantsSelfWin(game, seat)) {
      get().act({ type: 'hu', seat });
      return;
    }
    const kong = chooseSelfKong(game, seat, persona);
    if (kong !== null) {
      get().act({ type: 'kan', seat, k: kong });
      return;
    }
    const d = chooseDiscard(game, seat, persona);
    get().act({ type: 'discard', seat, k: d.k });
  },

  setPaw: (p) => set({ paw: p }),

  say: (text) => set({ banner: { text, id: Date.now() } }),
}));

/** The hand exactly as it is displayed, in one place, for both render and discard. */
export function handView(state: {
  game: GameState | null;
  sortMode: SortMode;
  myOrder: number[];
  mySeat?: number;
}): number[] {
  const hand = state.game?.seats[state.mySeat ?? 0].hand ?? [];
  if (state.sortMode === 'manual') return reconcileOrder(state.myOrder, hand);
  return sortHand(hand, state.sortMode);
}

/* ---- selectors used by the components ---- */

export function seatWind(seat: number, dealer: number): number {
  return (seat - dealer + 4) % 4;
}

export function seatWindLabel(wind: number, _dealer: number): string {
  return ['East', 'South', 'West', 'North'][wind];
}

export function humanClaims(game: GameState | null) {
  if (!game || game.phase !== 'claim') return [];
  return claimsFor(game, (useStore.getState().mySeat ?? 0));
}

export function humanKongs(game: GameState | null): number[] {
  if (!game) return [];
  return selfKongKinds(game, (useStore.getState().mySeat ?? 0));
}

export function humanCanWin(game: GameState | null): boolean {
  if (!game) return false;
  return canSelfWin(game, (useStore.getState().mySeat ?? 0)).ok;
}

export { claimOptions };

/**
 * Write the solo match to localStorage as it changes, on a trailing debounce:
 * four cats acting in a row fire many `set`s a second and the state is a few
 * kilobytes. The browser is what actually reloads the tab, so the only thing
 * this has to survive is "the tab was killed", not "the app closed cleanly".
 */
if (typeof window !== 'undefined') {
  let saveTimer: number | null = null;
  useStore.subscribe((s, prev) => {
    if (s.screen !== 'table' || s.mode !== 'solo' || !s.game) return;
    const moved =
      s.game !== prev.game ||
      s.keep !== prev.keep ||
      s.myOrder !== prev.myOrder ||
      s.resultOpen !== prev.resultOpen ||
      s.screen !== prev.screen;
    if (!moved) return;
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      const now = useStore.getState();
      if (now.screen !== 'table' || now.mode !== 'solo' || !now.game) return;
      saveMatch({
        target: now.target,
        handNo: now.handNo,
        dealer: now.dealer,
        scores: now.scores,
        handWins: now.handWins,
        seats: now.seats,
        game: now.game,
        mySeat: now.mySeat,
        myOrder: now.myOrder,
        keep: now.keep,
        matchOver: now.matchOver,
        lastWinSeat: now.lastWinSeat,
        resultOpen: now.resultOpen,
      });
    }, 250);
  });
}
