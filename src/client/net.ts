/**
 * Room transport. The server owns the game; this file only sends intents and pours
 * snapshots into the store. Nothing here advances a turn locally — that is what makes
 * one shared clock possible across four phones.
 */
import { io, type Socket } from 'socket.io-client';
import { commitOnlineStat, commitStats, dropOnlineStat, noteHandLost, pruneKeep, useStore, type SeatMeta } from './store';
import { recordHand } from './stats';
import { reconcileOrder } from './sort';
import type { GameAction, GameState, Personality } from '../engine/types';
import { defaultCat, type CatAppearance } from './cat';
import { ARCHETYPES } from '../engine/bots/personality';
import { track } from './telemetry';

let socket: Socket | null = null;

export type Profile = { name: string; cat: CatAppearance; personality: Personality };

/**
 * The chair you were sitting in. A phone that sleeps, a subway, a reload — the
 * server keeps your cat playing, and this token is how you get the seat back.
 */
const SEAT_KEY = 'khm.seat.v1';

type SavedSeat = { code: string; seat: number; token: string };

function readSeat(): SavedSeat | null {
  try {
    const raw = localStorage.getItem(SEAT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSeat;
    return parsed && parsed.code && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

function writeSeat(seat: SavedSeat | null): void {
  try {
    if (seat) localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    else localStorage.removeItem(SEAT_KEY);
  } catch {
    /* private mode: the table still works, you just cannot come back to it */
  }
}

function conn(): Socket {
  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      useStore.setState({ online: 'connected' });
      // every (re)connect asks for the chair back; the server refuses if it is gone
      const seat = readSeat();
      if (seat) socket!.emit('room:reclaim', { code: seat.code, token: seat.token });
    });
    socket.on('disconnect', () => useStore.setState({ online: 'offline' }));
    socket.on('room:error', (message: string) => {
      useStore.setState({ roomError: String(message) });
      useStore.getState().say(String(message));
    });
    socket.on('room:joined', (p: { code: string; seat: number; token?: string }) => {
      if (p.token) writeSeat({ code: p.code, seat: p.seat, token: p.token });
      useStore.setState({ roomCode: p.code, mySeat: p.seat, screen: 'lobby', roomError: null });
    });
    socket.on('room:reclaimFailed', () => {
      // the table closed while we were away: drop the dead token and stay on the menu
      writeSeat(null);
      const st = useStore.getState();
      if (st.mode === 'online' && st.roomCode) {
        useStore.setState({ mode: 'solo', roomCode: null, roomPhase: null, game: null, screen: 'menu', online: 'connected' });
        useStore.getState().say('That table has closed.');
      }
    });
    socket.on('room:state', applySnapshot);
    // the server is the only writer online: a decision is learned when it is accepted
    socket.on('room:applied', (p: { id?: string }) => {
      if (p?.id) commitOnlineStat(p.id);
    });
    socket.on('room:rejected', (p: { id?: string }) => {
      if (p?.id) dropOnlineStat(p.id);
    });
  }
  return socket;
}

function applySnapshot(st: {
  code: string;
  phase: 'lobby' | 'playing';
  target: 1 | 2 | 3;
  handNo: number;
  dealer: number;

  handWins: number[];
  deadlineAt: number | null;
  you: number;
  seats: ({ name: string; cat: CatAppearance; personality: Personality; kind: string; connected: boolean } | null)[];
  game: GameState | null;
}) {
  const prev = useStore.getState();
  const seats: SeatMeta[] = st.seats.map((s, i) =>
    s
      ? { name: s.name, cat: s.cat, personality: s.personality, tag: s.kind === 'bot' ? 'bot' : s.connected ? 'here' : 'away' }
      : {
          name: 'Empty seat',
          cat: prev.seats[i]?.cat ?? prev.seats[0]?.cat ?? defaultCat(i),
          personality: prev.seats[i]?.personality ?? prev.seats[0]?.personality ?? ARCHETYPES[0].personality,
          tag: 'open',
        },
  );

  // online nothing went through `act`, so the hand record is written here — once,
  // on the snapshot that turns the table over
  if (st.game?.phase === 'ended' && prev.game?.phase !== 'ended') {
    const won = st.game.win?.seat === st.you;
    const fan = st.game.win?.score?.fan ?? 0;
    const measured = recordHand(useStore.getState().stats, { won, draw: !!st.game.drawGame, fan });
    commitStats(measured);
    noteHandLost(st.game.win ? st.game.win.seat !== st.you : false);
    track('hand:end', { won, drawn: !!st.game.drawGame, fan, hands: measured.hands, online: true });
  }

  const handChanged = prev.handNo !== st.handNo || !prev.game;
  const me = st.you;
  // the rack order lives on the client; reconcile it against the authoritative hand on every
  // snapshot (locally `act` used to do this, and online that code never runs)
  const hand = st.game?.seats[me].hand ?? [];
  const nextOrder = reconcileOrder(handChanged ? [] : prev.myOrder, hand);
  // the server owns the hand; a mark whose tile has left it must go, or a later
  // copy of that kind arrives pre-locked and the player cannot throw it
  const nextKeep = handChanged ? [] : pruneKeep(prev.keep, hand);

  useStore.setState({
    mode: 'online',
    online: 'connected',
    roomCode: st.code,
    roomPhase: st.phase,
    mySeat: me,
    seats,
    target: st.target,
    handNo: st.handNo,
    dealer: st.dealer,
    handWins: st.handWins,
    deadlineAt: st.deadlineAt,
    game: st.game ?? null,
    screen: st.phase === 'playing' ? 'table' : 'lobby',
    // a dismissed result card stays dismissed: a snapshot for the same ended hand
    // must not slam it back over a player who is reading the final board
    resultOpen: st.game?.phase === 'ended' && !prev.resultDismissed,
    // a fresh deal clears the dismissal, so the next hand's card still shows up
    resultDismissed: st.game?.phase === 'ended' ? prev.resultDismissed : false,
    matchOver: st.handWins.some((w) => w >= st.target),
    myOrder: nextOrder,
    keep: nextKeep,
    // the raised tile is an index into the rack we just replaced; the server
    // owns the hand, so a selection made against the previous one means nothing
    selected: null,
  });
}

export const net = {
  create(profile: Profile, target: 1 | 2 | 3, minFan = 0): void {
    track('room:create', { target, minFan });
    conn().emit('room:create', { profile, target, minFan });
  },
  join(code: string, profile: Profile): void {
    track('room:join');
    conn().emit('room:join', { code: code.toUpperCase().trim(), profile });
  },
  addBot(): void {
    conn().emit('room:addBot');
  },
  addCat(code: string, name?: string): void {
    conn().emit('room:addCat', { code, name });
  },
  start(): void {
    conn().emit('room:start');
  },
  nextHand(): void {
    conn().emit('room:nextHand');
  },
  action(a: GameAction, id?: string): void {
    conn().emit('room:action', id ? { id, action: a } : a);
  },
  leave(): void {
    writeSeat(null);
    conn().emit('room:leave');
    useStore.setState({ mode: 'solo', roomCode: null, roomPhase: null, game: null, deadlineAt: null, screen: 'menu', mySeat: 0 });
  },
};
