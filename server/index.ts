/**
 * Kitten Hill rooms.
 *
 * The server owns the game: it deals, validates every action, runs the bots and holds
 * the clocks. Clients only render snapshots and send intents, which is what makes a
 * shared turn timer possible at all — a client that "pauses" would otherwise fall behind
 * three other players and lose its claims.
 */
import express from 'express';
import compression from 'compression';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server, type Socket } from 'socket.io';

import { applyAction, canSelfWin, claimsFor, createHand, selfKongKinds } from '../src/engine/game';
import { chooseClaim, chooseDiscard, chooseSelfKong, wantsSelfWin } from '../src/engine/bots/bot';
import {
  PROFILE_MAX_BYTES,
  PROFILE_TTL_MS,
  dropRoom,
  eventSummary,
  loadRecentRooms,
  logEvent,
  POOL_TTL_MS,
  listPoolRows,
  prunePoolRows,
  pruneProfileRows,
  pruneRooms,
  publishPoolRow,
  unpublishPoolRow,
  readProfileRow,
  saveProfileRow,
  saveRoom,
} from './store';
import { ARCHETYPES, decodePersonality, healPersonality } from '../src/engine/bots/personality';
import { designedCat } from '../src/client/looks';
import { randomBytes } from 'node:crypto';
import type { CatAppearance } from '../src/client/cat';
import type { GameAction, GameState, Personality } from '../src/engine/types';

const PORT = Number(process.env.PORT ?? 4180);
const TURN_MS = 25_000;
const CLAIM_MS = 12_000;
const BOT_BEAT_MS = Number(process.env.BOT_BEAT_MS ?? 700);

type Seat = {
  socketId: string | null;
  kind: 'human' | 'bot';
  name: string;
  cat: CatAppearance;
  personality: Personality;
  /** a human who dropped: their cat plays on by itself until they come back */
  standIn: boolean;
  /** proves the chair is yours after a reconnect; bots carry an empty string */
  token: string;
};

type Room = {
  code: string;
  hostSocket: string | null;
  seats: (Seat | null)[];
  target: 1 | 2 | 3;
  /** Table minimum in doubles, set by the host when the room is created. */
  minFan: number;
  handNo: number;
  dealer: number;
  handWins: number[];
  game: GameState | null;
  phase: 'lobby' | 'playing';
  deadlineAt: number | null;
  deadlineSeat: number | null;
  timer: NodeJS.Timeout | null;
  botTimer: NodeJS.Timeout | null;
  createdAt: number;
};

const rooms = new Map<string, Room>();
const seatOfSocket = new Map<string, { code: string; seat: number }>();

const ROOM_TTL_MS = 6 * 60 * 60_000;

function newSeatToken(): string {
  return randomBytes(16).toString('hex');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

/**
 * An empty chair, filled on start. Archetypes only — a player's published cat is
 * seated when someone picks it from the cattery, never silently dealt in.
 */
function botSeat(index: number, taken: string[] = []): Seat {
  const pool = ARCHETYPES.filter((x) => !taken.includes(x.name));
  const from = pool.length ? pool : ARCHETYPES;
  const a = from[Math.floor(Math.random() * from.length)];
  return {
    socketId: null,
    kind: 'bot',
    name: a.name,
    personality: a.personality,
    standIn: false,
    token: '',
    // same coat as the solo table: a bot that shows up online must not be a
    // different cat from the one the player already knows
    cat: designedCat(a.id) ?? {
      fur: ['#c99a6b', '#8c8f95', '#3e3a38', '#fbfaf7', '#e9a06a', '#5f7f6a', '#b8927a'][index % 7],
      patternColor: '#2f2a28',
      pattern: (['tabby', 'tuxedo', 'calico', 'bicolour', 'pointed', 'spots'] as const)[index % 6],
      eyes: '#7bc96f',
      eyeStyle: 'round',
      size: 1,
      weight: index % 2 ? 1.08 : 0.96,
      earSize: 1,
      collar: '#2f8f7f',
      accessory: 'none',
      hair: (['short', 'long', 'none', 'medium'] as const)[index % 4],
      seed: 100 + index * 7,
    },
  };
}

/** What every client needs to draw the table. Concealed tiles are in `game` already. */
function snapshot(room: Room) {
  return {
    code: room.code,
    phase: room.phase,
    target: room.target,
    handNo: room.handNo,
    dealer: room.dealer,
    handWins: room.handWins,
    deadlineAt: room.deadlineAt,
    you: 0 as number, // replaced per socket
    seats: room.seats.map((s) =>
      s
        ? {
            name: s.name,
            cat: s.cat,
            personality: s.personality,
            kind: s.kind,
            connected: s.kind === 'bot' ? true : !!s.socketId,
          }
        : null,
    ),
    game: room.game,
  };
}

function broadcast(room: Room, io: Server): void {
  for (let seat = 0; seat < 4; seat++) {
    const s = room.seats[seat];
    if (!s?.socketId) continue;
    io.to(s.socketId).emit('room:state', { ...snapshot(room), you: seat });
  }
}

function clearTimers(room: Room): void {
  if (room.timer) clearTimeout(room.timer);
  if (room.botTimer) clearTimeout(room.botTimer);
  room.timer = null;
  room.botTimer = null;
  room.deadlineAt = null;
  room.deadlineSeat = null;
}

function botFor(seat: Seat): Personality {
  return seat.personality;
}

/** Advance a bot (or a stood-in human) once. */
function botStep(room: Room, seat: number): void {
  const game = room.game;
  const meta = room.seats[seat];
  if (!game || !meta) return;
  const p = botFor(meta);

  if (game.phase === 'claim') {
    const pending = game.pendingSeats.find((s) => !game.claimResponses[s]);
    if (pending === undefined) return;
    if (pending === seat) {
      const d = chooseClaim(game, seat, p);
      room.game = d.type
        ? applyAction(game, { type: 'claim', seat, claim: d.type, withKinds: d.withKinds })
        : applyAction(game, { type: 'pass', seat });
      return;
    }
    return;
  }

  if (game.turn !== seat) return;

  if (wantsSelfWin(game, seat)) {
    room.game = applyAction(game, { type: 'hu', seat });
    return;
  }
  const kong = chooseSelfKong(game, seat, p);
  if (kong !== null) {
    room.game = applyAction(game, { type: 'kan', seat, k: kong });
    return;
  }
  const d = chooseDiscard(game, seat, p);
  room.game = applyAction(game, { type: 'discard', seat, k: d.k });
}

/** Whose decision is it right now, and is that decision a claim or a turn? */
function actorNow(room: Room): { seat: number; kind: 'turn' | 'claim' } | null {
  const g = room.game;
  if (!g || g.phase === 'ended') return null;
  if (g.phase === 'claim') {
    const seat = g.pendingSeats.find((s) => !g.claimResponses[s]);
    return seat === undefined ? null : { seat, kind: 'claim' };
  }
  return { seat: g.turn, kind: 'turn' };
}

function isBotSeat(room: Room, seat: number): boolean {
  const s = room.seats[seat];
  return !s || s.kind === 'bot' || s.standIn;
}

/** The durable shape of a room: no sockets, no timers, nothing the clock owns. */
function serialise(room: Room) {
  return {
    code: room.code,
    target: room.target,
    minFan: room.minFan,
    handNo: room.handNo,
    dealer: room.dealer,
    handWins: room.handWins,
    game: room.game,
    phase: room.phase,
    createdAt: room.createdAt,
    seats: room.seats.map((s) =>
      s
        ? { name: s.name, cat: s.cat, personality: s.personality, kind: s.kind, standIn: s.standIn, token: s.token }
        : null,
    ),
  };
}

function persist(room: Room): void {
  saveRoom(room.code, serialise(room));
}

/** Rebuild a room from disk: nobody is holding a chair yet, so humans play on their own. */
function rehydrate(row: { code: string; state: string }): Room | null {
  try {
    const r = JSON.parse(row.state) as ReturnType<typeof serialise>;
    if (!r || typeof r.code !== 'string' || !Array.isArray(r.seats)) return null;
    return {
      code: r.code,
      hostSocket: null,
      seats: r.seats.map((s) => (s ? { ...s, socketId: null, standIn: s.kind === 'human' } : null)),
      target: r.target,
      minFan: r.minFan ?? 0,
      handNo: r.handNo,
      dealer: r.dealer,
      handWins: r.handWins ?? [0, 0, 0, 0],
      game: r.game ?? null,
      phase: r.phase ?? 'lobby',
      deadlineAt: null,
      deadlineSeat: null,
      timer: null,
      botTimer: null,
      createdAt: r.createdAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

/** Every path that changes a table saves it: a restart must not cost a hand. */
function advance(room: Room, io: Server): void {
  advanceInner(room, io);
  persist(room);
}

/** After any state change: deal with the hand being over, then schedule whoever is next. */
function advanceInner(room: Room, io: Server): void {
  clearTimers(room);
  const g = room.game;
  if (!g) return;

  if (g.phase === 'ended') {
    // the match is decided by hand wins; there is no points ledger to settle
    if (g.win && g.win.seat >= 0) room.handWins[g.win.seat] += 1;
    room.phase = 'playing';
    broadcast(room, io);
    return;
  }

  const actor = actorNow(room);
  if (!actor) {
    broadcast(room, io);
    return;
  }

  if (isBotSeat(room, actor.seat)) {
    room.botTimer = setTimeout(() => {
      botStep(room, actor.seat);
      advance(room, io);
    }, BOT_BEAT_MS + Math.random() * 400);
    broadcast(room, io);
    return;
  }

  room.deadlineSeat = actor.seat;
  room.deadlineAt = Date.now() + (actor.kind === 'claim' ? CLAIM_MS : TURN_MS);
  room.timer = setTimeout(() => {
    const a = actorNow(room);
    if (!a || a.seat !== actor.seat) return;
    if (a.kind === 'claim') {
      room.game = applyAction(room.game!, { type: 'pass', seat: a.seat });
    } else {
      const hand = room.game!.seats[a.seat].hand;
      room.game = applyAction(room.game!, { type: 'discard', seat: a.seat, k: hand[hand.length - 1] });
    }
    advance(room, io);
  }, actor.kind === 'claim' ? CLAIM_MS : TURN_MS);

  broadcast(room, io);
}

function startHand(room: Room, io: Server): void {
  room.game = createHand({ dealer: room.dealer, bots: [false, true, true, true], minFan: room.minFan });
  room.handNo += 1;
  advance(room, io);
}

/** A finished match starts over: same table, fresh win counts. */
function restartMatch(room: Room, io: Server): void {
  room.handWins = [0, 0, 0, 0];
  room.handNo = 0;
  room.dealer = 0;
  startHand(room, io);
}

function nextHandOrEnd(room: Room, io: Server): void {
  // a single-hand match has no next hand: asking to deal again means a new match,
  // otherwise the room sits on an ended game and the table answers nothing
  if (room.target === 1) {
    restartMatch(room, io);
    return;
  }
  room.dealer = (room.dealer + 1) % 4;
  startHand(room, io);
}

const app = express();
// behind Pangolin/Cloudflare: without this req.protocol reads http and the share
// card, and any absolute URL we build, points at the wrong scheme
app.set('trust proxy', 1);
const http = createServer(app);
const io = new Server(http, { cors: { origin: true } });

app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

/** Debug: the server's own view of a room, for comparing against client snapshots. */
app.get('/room/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'no such room' });
  const g = room.game;
  res.json({
    code: room.code,
    phase: room.phase,
    handNo: room.handNo,
    turn: g?.turn ?? null,
    gamePhase: g?.phase ?? null,
    seq: g?.seq ?? null,
    wall: g?.wall.length ?? null,
    remainingMs: room.deadlineAt ? room.deadlineAt - Date.now() : null,
    seats: room.seats.map((s) => (s ? { name: s.name, kind: s.kind, connected: !!s.socketId, standIn: s.standIn } : null)),
  });
});

// 374KB of JS per cold load is 118KB on the wire; without this the bundle ships raw
app.use(compression());
app.use(express.json({ limit: '24kb' }));

/**
 * Anonymous profile backup: five letters and your cat is not hostage to one
 * browser's storage. No account, no email — the code is the whole credential,
 * so it is write-limited per address rather than protected.
 */
const profileWrites = new Map<string, number[]>();
function writeAllowed(ip: string): boolean {
  const now = Date.now();
  const hits = (profileWrites.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 12) {
    profileWrites.set(ip, hits);
    return false;
  }
  hits.push(now);
  profileWrites.set(ip, hits);
  if (profileWrites.size > 5000) profileWrites.clear();
  return true;
}

function profileCode(): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!readProfileRow(code)) return code;
  }
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

app.post('/profile', (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (!writeAllowed(ip)) return res.status(429).json({ error: 'Too many saves. Try again in a minute.' });
  const body = req.body as { code?: string; profile?: unknown } | undefined;
  const profile = body?.profile;
  if (!profile || typeof profile !== 'object') return res.status(400).json({ error: 'Nothing to save.' });
  const size = Buffer.byteLength(JSON.stringify(profile), 'utf8');
  if (size > PROFILE_MAX_BYTES) return res.status(413).json({ error: 'That save is too large.' });

  const asked = String(body?.code ?? '').toUpperCase().trim();
  const code = asked && readProfileRow(asked) ? asked : asked ? asked : profileCode();
  // a code that does not exist yet is claimed by the first writer, which is what
  // makes "type your code on the new phone, then keep saving to it" work
  saveProfileRow(code, profile);
  res.json({ code });
});

/** Batched, anonymous: a page-load id, an event name, a few numbers. Nothing else. */
app.post('/beacon', (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (!writeAllowed(ip)) return res.status(429).end();
  const body = req.body as
    | { session?: string; build?: string; probe?: boolean; events?: { name?: string; at?: number; props?: unknown }[] }
    | undefined;
  const session = String(body?.session ?? '').slice(0, 40);
  const build = String(body?.build ?? '').slice(0, 24);
  const probe = body?.probe === true;
  const events = Array.isArray(body?.events) ? body!.events.slice(0, 40) : [];
  if (!session) return res.status(400).end();
  for (const e of events) {
    const name = String(e?.name ?? '').slice(0, 40);
    if (!name) continue;
    const at = Number(e?.at);
    // every row carries the build it came from, so a crash can be pinned to a
    // diff, and `probe` keeps audit-forced crashes out of the real signal
    const props: Record<string, unknown> =
      e?.props && typeof e.props === 'object' && !Array.isArray(e.props)
        ? { ...(e.props as Record<string, unknown>) }
        : e?.props == null
          ? {}
          : { value: e.props };
    if (build) props.build = build;
    if (probe) props.probe = true;
    logEvent(session, name, Number.isFinite(at) && at > 0 ? at : Date.now(), props);
  }
  res.status(204).end();
});

/** Operator view: needs STATS_TOKEN, so the numbers are not public. */
app.get('/stats/summary', (req, res) => {
  const token = process.env.STATS_TOKEN;
  if (!token || req.query.key !== token) return res.status(404).end();
  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 7)));
  res.json({ since: days, events: eventSummary(Date.now() - days * 24 * 60 * 60_000) });
});

/**
 * The cattery: opt-in player cats.
 *
 * Publishing is keyed by the sync code so the publisher can take the cat down
 * again, but the public list never returns that code — only an opaque id and
 * what a bot needs to play.
 */
app.post('/pool/publish', (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (!writeAllowed(ip)) return res.status(429).json({ error: 'Too many publishes. Try again in a minute.' });
  const body = req.body as { code?: string; name?: string; cat?: unknown; personality?: unknown } | undefined;
  // backup codes are five characters; accept six so a future length is not a cliff
  const code = String(body?.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (code.length < 5) return res.status(400).json({ error: 'Publish from a saved cat.' });
  const name = String(body?.name ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 14);
  if (!name) return res.status(400).json({ error: 'That cat needs a name.' });
  if (!body?.cat || typeof body.cat !== 'object') return res.status(400).json({ error: 'That cat is not a cat.' });
  const personality = healPersonality(body.personality, name);
  const size = Buffer.byteLength(JSON.stringify(body.cat), 'utf8');
  if (size > 4096) return res.status(413).json({ error: 'That cat is too large.' });
  const id = publishPoolRow(code, { name, cat: body.cat, personality });
  res.json({ id });
});

app.post('/pool/unpublish', (req, res) => {
  const code = String((req.body as { code?: string } | undefined)?.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (code.length < 5) return res.status(400).json({ error: 'Which cat?' });
  res.json({ removed: unpublishPoolRow(code) });
});

app.get('/pool', (req, res) => {
  const n = Math.min(24, Math.max(1, Number(req.query.n ?? 12) || 12));
  const rows = listPoolRows();
  // a rotating shortlist, not a leaderboard: shuffle then take n
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  res.json({ cats: rows.slice(0, n), total: rows.length });
});

app.get('/profile/:code', (req, res) => {
  const profile = readProfileRow(String(req.params.code ?? '').toUpperCase().trim());
  if (!profile) return res.status(404).json({ error: 'No backup with that code.' });
  res.json({ profile });
});

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
if (existsSync(dist)) {
  // the share card needs an absolute image URL, and the domain is whatever the
  // request arrived on, so the document is templated per request
  const shellPath = path.join(dist, 'index.html');
  // read through an mtime check, not once at boot: a deploy replaces the hashed
  // assets, and a shell held in memory then points at files that no longer exist
  let shellCache: { mtime: number; html: string } | null = null;
  const shell = (): string => {
    try {
      const mtime = statSync(shellPath).mtimeMs;
      if (!shellCache || shellCache.mtime !== mtime) shellCache = { mtime, html: readFileSync(shellPath, 'utf8') };
      return shellCache.html;
    } catch {
      return shellCache?.html ?? '';
    }
  };
  const sendShell = (req: express.Request, res: express.Response) => {
    const origin = `${req.protocol}://${req.get('host') ?? 'localhost'}`;
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(shell().replaceAll('__ORIGIN__', origin));
  };

  app.use(
    express.static(dist, {
      index: false,
      // the file names are content-hashed, so they can live in the browser forever;
      // only the entry document has to be revalidated
      setHeaders(res, filePath) {
        const immutable = filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes(`${path.sep}tiles${path.sep}`);
        res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  app.get('*', (req, res) => sendShell(req, res));
}

io.on('connection', (socket: Socket) => {
  const send = (event: string, payload: unknown) => socket.emit(event, payload);

  function withRoom(fn: (room: Room, seat: number) => void) {
    const at = seatOfSocket.get(socket.id);
    if (!at) return send('room:error', 'You are not at a table.');
    const room = rooms.get(at.code);
    if (!room) return send('room:error', 'That table has closed.');
    fn(room, at.seat);
  }

  socket.on('room:create', (p: {
    profile: { name: string; cat: CatAppearance; personality: Personality };
    target?: 1 | 2 | 3;
    minFan?: number;
  }) => {
    const code = newCode();
    const room: Room = {
      code,
      hostSocket: socket.id,
      seats: [null, null, null, null],
      target: p.target ?? 2,
      // a forged or stale client can send anything; only 0-3 are real gates
      minFan: p.minFan === 1 || p.minFan === 2 || p.minFan === 3 ? p.minFan : 0,
      handNo: 0,
      dealer: 0,
      handWins: [0, 0, 0, 0],
      game: null,
      phase: 'lobby',
      deadlineAt: null,
      deadlineSeat: null,
      timer: null,
      botTimer: null,
      createdAt: Date.now(),
    };
    const token = newSeatToken();
    room.seats[0] = {
      socketId: socket.id,
      kind: 'human',
      name: p.profile.name || 'Cat',
      cat: p.profile.cat,
      // a seat is played by a bot when the player drops: it must be a real vector
      personality: healPersonality(p.profile.personality, p.profile.name),
      standIn: false,
      token,
    };
    rooms.set(code, room);
    seatOfSocket.set(socket.id, { code, seat: 0 });
    send('room:joined', { code, seat: 0, token });
    persist(room);
    broadcast(room, io);
  });

  socket.on('room:join', (p: { code: string; profile: { name: string; cat: CatAppearance; personality: Personality } }) => {
    const room = rooms.get(String(p.code ?? '').toUpperCase().trim());
    if (!room) return send('room:error', 'No table with that code.');
    if (room.phase === 'playing') return send('room:error', 'That hand has already started.');
    const seat = room.seats.findIndex((s) => s === null);
    if (seat < 0) {
      // an away human still holds the chair: it is their seat until the room closes
      const away = room.seats.some((s) => s && s.kind === 'human' && !s.socketId);
      return send('room:error', away ? 'That table is full. A cat is away and still holding its chair.' : 'That table is full.');
    }

    const token = newSeatToken();
    room.seats[seat] = {
      socketId: socket.id,
      kind: 'human',
      name: p.profile.name || 'Cat',
      cat: p.profile.cat,
      // a seat is played by a bot when the player drops: it must be a real vector
      personality: healPersonality(p.profile.personality, p.profile.name),
      standIn: false,
      token,
    };
    seatOfSocket.set(socket.id, { code: room.code, seat });
    send('room:joined', { code: room.code, seat, token });
    persist(room);
    broadcast(room, io);
  });

  socket.on('room:addBot', () => {
    withRoom((room) => {
      if (room.phase === 'playing') return;
      const seat = room.seats.findIndex((s) => s === null);
      if (seat < 0) return;
      room.seats[seat] = botSeat(seat, room.seats.map((s) => s?.name ?? ''));
      broadcast(room, io);
    });
  });

  socket.on('room:addCat', (p: { code: string; name?: string }) => {
    withRoom((room) => {
      if (room.phase === 'playing') return;
      const seat = room.seats.findIndex((s) => s === null);
      if (seat < 0) return;
      const personality = decodePersonality(String(p.code ?? ''), p.name ?? 'Guest');
      if (!personality) return send('room:error', 'That cat code is not valid.');
      const base = botSeat(seat);
      room.seats[seat] = { ...base, name: p.name?.slice(0, 14) || personality.name || 'Guest', personality };
      broadcast(room, io);
    });
  });

  socket.on('room:start', () => {
    withRoom((room) => {
      if (room.phase === 'playing') return;
      // bots auto-fill any empty seat, per the brief
      for (let s = 0; s < 4; s++) if (!room.seats[s]) room.seats[s] = botSeat(s, room.seats.map((x) => x?.name ?? ''));
      room.phase = 'playing';
      room.handWins = [0, 0, 0, 0];
      room.handNo = 0;
      room.dealer = 0;
      startHand(room, io);
    });
  });

  socket.on('room:nextHand', () => {
    withRoom((room) => {
      const champion = room.handWins.findIndex((w) => w >= room.target);
      if (champion >= 0) {
        restartMatch(room, io);
        return;
      }
      nextHandOrEnd(room, io);
    });
  });

  /**
   * An action, and whether it happened.
   *
   * The client learns a cat's style from its own decisions, but online the client
   * is not the writer — so it queues a statistic and commits it only when the
   * server says the action was accepted. `id` is that handshake.
   */
  socket.on('room:action', (payload: { id?: string; action?: GameAction } | GameAction) => {
    const wrapped = payload as { id?: string; action?: GameAction };
    const id = typeof wrapped?.id === 'string' ? wrapped.id : undefined;
    const action = (wrapped?.action ?? payload) as GameAction;
    const reject = (why?: string) => {
      if (id) send('room:rejected', { id });
      if (why) send('room:error', why);
    };
    withRoom((room, seat) => {
      if (room.phase !== 'playing' || !room.game) return reject();
      if (room.game.phase === 'ended') return reject();
      if (action?.seat !== seat) return reject('That is not your seat.');
      if (isBotSeat(room, seat)) return reject();
      try {
        room.game = applyAction(room.game, action);
      } catch (err) {
        reject(err instanceof Error ? err.message : 'Illegal action');
        return;
      }
      if (id) send('room:applied', { id });
      advance(room, io);
    });
  });

  /**
   * Take your chair back. A phone that slept, a subway tunnel, a tab that reloaded:
   * the seat kept playing with the stand-in bot, and this is the way home.
   */
  socket.on('room:reclaim', (p: { code?: string; token?: string }) => {
    const code = String(p?.code ?? '').toUpperCase().trim();
    const token = String(p?.token ?? '');
    const room = rooms.get(code);
    if (!room || !token) return send('room:reclaimFailed', 'closed');
    const seat = room.seats.findIndex((s) => s && s.kind === 'human' && s.token === token);
    if (seat < 0) return send('room:reclaimFailed', 'gone');

    const s = room.seats[seat]!;
    if (s.socketId && s.socketId !== socket.id) {
      // two devices, one token: the newest one wins, the old one is told why it stopped
      io.to(s.socketId).emit('room:error', `${s.name} sat down at another device.`);
    }
    s.socketId = socket.id;
    s.standIn = false;
    room.hostSocket = room.hostSocket && room.seats.some((x) => x?.socketId === room.hostSocket) ? room.hostSocket : socket.id;
    seatOfSocket.set(socket.id, { code: room.code, seat });
    send('room:joined', { code: room.code, seat, token: s.token });
    // the clock restarts on whoever is next, so a returning player is not instantly timed out
    if (room.phase === 'playing' && room.game && room.game.phase !== 'ended') advance(room, io);
    else broadcast(room, io);
  });

  socket.on('room:leave', () => {
    const at = seatOfSocket.get(socket.id);
    if (!at) return;
    const room = rooms.get(at.code);
    seatOfSocket.delete(socket.id);
    if (!room) return;
    room.seats[at.seat] = null;
    if (room.phase === 'playing') {
      // keep the seat so the hand can finish; the chair plays itself
      room.seats[at.seat] = { ...botSeat(at.seat, room.seats.map((x) => x?.name ?? '')), kind: 'bot' };
      advance(room, io);
    }
    if (!room.seats.some((s) => s?.socketId)) {
      clearTimers(room);
      rooms.delete(room.code);
      dropRoom(room.code);
      return;
    }
    persist(room);
    broadcast(room, io);
  });

  socket.on('disconnect', () => {
    const at = seatOfSocket.get(socket.id);
    if (!at) return;
    const room = rooms.get(at.code);
    seatOfSocket.delete(socket.id);
    if (!room) return;
    const seat = room.seats[at.seat];
    if (seat) {
      seat.socketId = null;
      seat.standIn = true; // the cat keeps playing while nobody is holding the chair
    }
    if (room.phase === 'playing') advance(room, io);
    else {
      persist(room);
      broadcast(room, io);
    }
    // reap empty rooms after a while
    setTimeout(() => {
      const r = rooms.get(at.code);
      if (!r) return;
      if (!r.seats.some((s) => s?.socketId)) {
        clearTimers(r);
        rooms.delete(r.code);
        dropRoom(r.code);
      }
    }, 10 * 60_000);
  });
});

// ---- restart recovery ----
pruneRooms(Date.now() - ROOM_TTL_MS);
pruneProfileRows(Date.now() - PROFILE_TTL_MS);
prunePoolRows(Date.now() - POOL_TTL_MS);
let restored = 0;
for (const row of loadRecentRooms(Date.now() - ROOM_TTL_MS)) {
  const room = rehydrate(row);
  if (!room) continue;
  rooms.set(room.code, room);
  restored += 1;
}

http.listen(PORT, () => {
  console.log(`[kitten-hill] rooms listening on ${PORT} (${restored} restored)`);
  // tables that were mid-hand carry on: bots keep playing, humans get their clock back
  for (const room of rooms.values()) {
    if (room.phase === 'playing' && room.game && room.game.phase !== 'ended') advance(room, io);
  }
});
