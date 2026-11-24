/**
 * Rooms must survive a dropped phone and a server restart. This drives the real
 * server over the real socket protocol — no mocks, no fake clock.
 *
 *   node scripts/rooms-check.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('/home/onewing/github/MahjongAscent/package.json');
const { io } = require('/home/onewing/github/kitten-hill-mahjong/node_modules/socket.io-client/build/esm-debug/index.js');

const PORT = 4199;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(path.join(tmpdir(), 'kh-rooms-'));
const DB = path.join(dir, 'rooms.db');

let server = null;
let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function boot() {
  server = spawn('node_modules/.bin/tsx', ['server/index.ts'], {
    cwd: '/home/onewing/github/kitten-hill-mahjong',
    env: { ...process.env, PORT: String(PORT), ROOMS_DB: DB, BOT_BEAT_MS: '120' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

async function shutdown() {
  if (!server) return;
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 700));
  server = null;
}

function client() {
  const s = io(BASE, { transports: ['websocket'], forceNew: true, reconnection: false });
  const events = [];
  s.onAny((event, payload) => events.push({ event, payload }));
  const waitState = async (pred, ms = 6000) => {
    const started = Date.now();
    let seen = 0;
    while (Date.now() - started < ms) {
      const states = events.filter((e) => e.event === 'room:state').map((e) => e.payload);
      for (; seen < states.length; seen++) if (pred(states[seen])) return states[seen];
      await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error('timeout waiting for a matching room:state');
  };
  const waitFor = (event, ms = 4000) =>
    new Promise((resolve, reject) => {
      const hit = events.find((e) => e.event === event);
      if (hit) return resolve(hit.payload);
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
      s.once(event, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  return { socket: s, events, waitFor, waitState };
}

const PROFILE = {
  name: 'Toast',
  cat: { fur: '#e0b98a', patternColor: '#5b4636', pattern: 'tabby', eyes: '#8fd18a', eyeStyle: 'round', size: 1, weight: 1, earSize: 1, collar: '#2f8f7f', accessory: 'none', seed: 41 },
  personality: { name: 'you', setBias: 0.5, greed: 0.5, caution: 0.5, aggression: 0.4, honourLoyalty: 0.5, suits: [1, 1, 1], limitHunter: 0.25, tilt: 0.2 },
};

const room = async (code) => (await fetch(`${BASE}/room/${code}`)).json();

let code = null;
let token = null;
let seqBeforeDrop = null;

try {
  await boot();

  /* 1. create a table and start a hand */
  {
    const a = client();
    a.socket.emit('room:create', { profile: PROFILE, target: 3 });
    const joined = await a.waitFor('room:joined');
    code = joined.code;
    token = joined.token;
    check('create issues a seat token', typeof token === 'string' && token.length >= 16, `${code} ${String(token).slice(0, 6)}…`);
    a.socket.emit('room:start');
    const st = await a.waitState((x) => x.phase === 'playing' && x.game);
    check(
      'hand starts with bots filling the empty chairs',
      st.phase === 'playing' && st.game?.phase !== 'ended' && st.seats.filter((x) => x?.kind === 'bot').length === 3,
      `${st.seats.filter((x) => x?.kind === 'bot').length} bots`,
    );
    await new Promise((r) => setTimeout(r, 900));
    const live = await room(code);
    seqBeforeDrop = live.seq;
    check('the table is moving', typeof seqBeforeDrop === 'number' && seqBeforeDrop > 0, `seq ${seqBeforeDrop}`);
    a.socket.close();
  }

  /* 2. the phone sleeps: the cat keeps playing */
  await new Promise((r) => setTimeout(r, 1200));
  {
    const r = await room(code);
    check('a dropped seat is marked away, not emptied', r.seats[0] && r.seats[0].standIn === true && r.seats[0].connected === false);
    check('the stand-in keeps the hand alive', r.seq > seqBeforeDrop, `seq ${seqBeforeDrop} → ${r.seq}`);
  }

  /* 3. the same device comes back with its token */
  {
    const b = client();
    b.socket.emit('room:reclaim', { code, token });
    const joined = await b.waitFor('room:joined');
    check('reclaim returns the same chair', joined.seat === 0 && joined.code === code);
    const back = await room(code);
    check('the seat is a human again', back.seats[0].kind === 'human' && back.seats[0].connected === true && back.seats[0].standIn === false);
    b.socket.close();
  }

  /* 4. a wrong token gets nothing */
  {
    const c = client();
    c.socket.emit('room:reclaim', { code, token: 'deadbeef'.repeat(4) });
    const why = await c.waitFor('room:reclaimFailed');
    check('a forged token is refused', why === 'gone', String(why));
    c.socket.close();
  }

  /* 5. a restart must not cost the hand */
  const beforeRestart = await room(code);
  await shutdown();
  await boot();
  // give the resumed bot clock one beat: nobody is holding a chair, so the table plays itself
  await new Promise((r) => setTimeout(r, 1200));
  const afterRestart = await room(code);
  check('the table survives a restart', afterRestart && afterRestart.code === code, `handNo ${afterRestart?.handNo}`);
  check('the hand number and win counts are intact', afterRestart.handNo === beforeRestart.handNo);
  check('play resumes after the restart', afterRestart.seq > beforeRestart.seq, `seq ${beforeRestart.seq} → ${afterRestart.seq}`);

  /* 6. and the chair is still claimable afterwards */
  {
    const d = client();
    d.socket.emit('room:reclaim', { code, token });
    const joined = await d.waitFor('room:joined');
    check('the chair survives the restart', joined.seat === 0);
    d.socket.close();
  }
} catch (err) {
  failed += 1;
  console.log(`FAIL  harness: ${err instanceof Error ? err.message : err}`);
} finally {
  await shutdown();
  rmSync(dir, { recursive: true, force: true });
  console.log(`\n${passed}/${passed + failed} rooms checks pass`);
  process.exit(failed ? 1 : 0);
}
