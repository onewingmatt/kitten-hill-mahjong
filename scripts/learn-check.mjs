/**
 * Does an ONLINE hand teach the cat anything?
 *
 * Drives the real built app in a browser against a throwaway server, plays a
 * whole hand over the socket protocol, and checks the record and the profile
 * afterwards. No mocks: the client, the server and the ack handshake are the
 * ones that ship.
 *
 *   node scripts/learn-check.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('/home/onewing/github/MahjongAscent/package.json');
const { chromium } = require('playwright');

const PORT = 4198;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(path.join(tmpdir(), 'kh-learn-'));
const DB = path.join(dir, 'rooms.db');

let server = null;
let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function boot() {
  server = spawn('node_modules/.bin/tsx', ['server/index.ts'], {
    cwd: '/home/onewing/github/kitten-hill-mahjong',
    env: { ...process.env, PORT: String(PORT), ROOMS_DB: DB, BOT_BEAT_MS: '110' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  for (let i = 0; i < 120; i++) {
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

await boot();
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

try {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('khm.coach.v1', 'done');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.__khm.getState().saveProfile({
      name: 'Onliner',
      cat: { fur: '#e0b98a', pattern: 'tabby', patternColor: '#5b4636', eyes: '#8fd18a', eyeStyle: 'round', size: 1, weight: 1, earSize: 1, collar: '#2f8f7f', accessory: 'none', hair: 'none', seed: 5 },
      personality: { name: 'Onliner', setBias: 0.5, greed: 0.5, caution: 0.5, aggression: 0.5, honourLoyalty: 0.5, suits: [1, 1, 1], limitHunter: 0.25, tilt: 0.2 },
    });
  });
  await page.waitForTimeout(200);
  const startHands = await page.evaluate(() => JSON.parse(localStorage.getItem('khm.stats.v2') || 'null')?.hands ?? 0);

  await page.getByRole('button', { name: /Play online/ }).click();
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.waitForTimeout(900);
  const code = await page.evaluate(() => window.__khm.getState().roomCode);
  check('room:created', !!code, code ?? '');

  await page.getByRole('button', { name: /^Start/ }).click();

  // play the hand: throw a tile on my turn, pass every offer
  const played = await page.evaluate(async () => {
    const S = () => window.__khm.getState();
    const t0 = Date.now();
    let throws = 0;
    let passes = 0;
    while (Date.now() - t0 < 90_000) {
      const s = S();
      const g = s.game;
      if (g) {
        if (g.phase === 'ended') break;
        const mine = s.mySeat ?? 0;
        const offer = g.phase === 'claim' && g.pendingSeats.includes(mine) && !g.claimResponses[mine];
        if (offer) {
          passes++;
          s.act({ type: 'pass', seat: mine });
        } else if (g.phase === 'discard' && g.turn === mine) {
          const hand = g.seats[mine].hand;
          if (hand.length) {
            throws++;
            s.act({ type: 'discard', seat: mine, k: hand[hand.length - 1] });
          }
        }
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    await new Promise((r) => setTimeout(r, 900)); // ack queue + profile flush
    const stats = S().stats;
    const stored = JSON.parse(localStorage.getItem('khm.stats.v2') || 'null');
    const profile = JSON.parse(localStorage.getItem('khm.profile.v1') || 'null');
    const learn = window.__khmLearn;
    return {
      throws,
      passes,
      phase: S().game?.phase,
      stats,
      stored,
      profileStyle: profile?.personality ?? null,
      liveStyle: learn ? learn.personalityFromStats(stats) : null,
      code: learn ? learn.encodePersonality(learn.personalityFromStats(stats)) : null,
    };
  });

  const throws = played.stats.throwsBySuit.reduce((a, b) => a + b, 0);
  check('online:hand-finished', played.phase === 'ended', `phase ${played.phase}, ${played.throws} throws, ${played.passes} passes`);
  check('online:hand-counted', played.stats.hands > startHands, `hands ${played.stats.hands}`);
  check('online:throws-recorded', throws > 0, JSON.stringify(played.stats.throwsBySuit));
  check('online:claim-offers-recorded', played.stats.claimOffers > 0, `${played.stats.claimOffers} offers`);
  check('online:stats-persisted', (played.stored?.hands ?? -1) === played.stats.hands, JSON.stringify(played.stored?.throwsBySuit));
  const same =
    played.profileStyle && played.liveStyle && JSON.stringify(played.profileStyle) === JSON.stringify(played.liveStyle);
  check('online:profile-carries-the-vector', same, same ? played.code : `saved ${JSON.stringify(played.profileStyle)}`);
  check('online:no-errors', errs.length === 0, errs.slice(0, 2).join(' | '));

  // ---- the cattery: publish, appear, take down ----
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'The cattery' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.waitForTimeout(900);
  const published = await page.evaluate(() => ({
    status: document.querySelector('.cattery__status')?.textContent ?? '',
    rows: document.querySelectorAll('.cattery__row').length,
  }));
  const poolAfterPublish = await fetch(`${BASE}/pool?n=24`).then((r) => r.json());
  const mine = poolAfterPublish.cats.find((c) => c.name === 'Onliner');
  check('cattery:publish-listed', !!mine, `${poolAfterPublish.total} in the pool`);
  check('cattery:vector-complete', !!mine && ['setBias', 'caution', 'tilt', 'efficiency'].every((k) => typeof mine.personality[k] === 'number'), JSON.stringify(mine?.personality ?? {}).slice(0, 90));
  check('cattery:no-code-exposed', !!mine && !('code' in mine), Object.keys(mine ?? {}).join(','));
  check('cattery:panel-shows-it', published.rows > 0, `${published.rows} rows · ${published.status}`);

  // ---- invited, never dealt: the pool is pull-only ----
  const poolCalls = [];
  page.on('request', (r) => { if (r.url().includes('/pool')) poolCalls.push(r.url()); });
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  // drop the reclaimed seat from the first section: a socket that still owns a
  // chair cannot cleanly host a new room
  await page.evaluate(() => localStorage.removeItem('khm.seat.v1'));
  await page.waitForTimeout(1200);
  const beforeAsk = poolCalls.length;
  const seated = await page.evaluate(async () => {
    const S = () => window.__khm.getState();
    S().startMatch(3);
    await new Promise((r) => setTimeout(r, 400));
    // seat 0 is the player's own cat: the question is who is across the table
    const names = S().seats.filter((_, i) => i !== (S().mySeat ?? 0)).map((s) => s.name);
    S().leave();
    return names;
  });
  await page.waitForTimeout(600);
  const afterMatch = poolCalls.length;
  check('cattery:no-fetch-until-asked', beforeAsk === 0 && afterMatch === 0, `${afterMatch} /pool request(s) while playing`);
  check('cattery:never-auto-seated', !seated.includes('Onliner'), seated.join(', '));

  // the same rule in a room: an empty chair fills with an archetype, never a player's cat
  await page.evaluate(() => window.__khm.getState().enterLobby());
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Create room' }).click();
  // the socket has to connect and the room come back before the host controls exist
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => !!window.__khm.getState().roomCode)) break;
    await page.waitForTimeout(150);
  }
  await page.getByRole('button', { name: /Start the hand/ }).click();
  await page.waitForTimeout(1600);
  const roomSeats = await page.evaluate(() => {
    const s = window.__khm.getState();
    // my own chair holds my cat; the question is who filled the empty ones
    const names = s.seats
      .filter((_, i) => i !== (s.mySeat ?? 0))
      .map((x) => x?.name ?? null)
      .filter(Boolean);
    s.leave();
    return names;
  });
  await page.waitForTimeout(900);
  check('cattery:room-fills-with-archetypes', !roomSeats.includes('Onliner'), roomSeats.join(', '));
  check('cattery:no-fetch-in-room', poolCalls.length === 0, `${poolCalls.length} request(s)`);

  await page.getByRole('button', { name: 'The cattery' }).click();
  await page.waitForTimeout(700);
  check('cattery:fetches-when-opened', poolCalls.length > 0, `${poolCalls.length} request(s)`);

  await page.getByRole('button', { name: 'Take it down' }).click();
  await page.waitForTimeout(800);
  const poolAfter = await fetch(`${BASE}/pool?n=24`).then((r) => r.json());
  check('cattery:unpublish-removes', !poolAfter.cats.some((c) => c.name === 'Onliner'), `${poolAfter.total} left`);
} finally {
  await browser.close();
  if (server) {
    server.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 600));
  }
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
