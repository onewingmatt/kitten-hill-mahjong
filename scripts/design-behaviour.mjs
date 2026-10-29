#!/usr/bin/env node
/**
 * Design checks: the settled product decisions, asserted against the running build.
 *
 *   PLAYWRIGHT_REQUIRE_FROM=/home/onewing/github/MahjongAscent/package.json \
 *     node scripts/design-behaviour.mjs [url]
 *
 * These are not generic lint rules: every check encodes a decision the player asked for
 * (portrait one-screen table, hand belongs to the player, claims that cannot be missed,
 * a creator with no play-style picker). A failure here means the design drifted, not that
 * a stylesheet regressed.
 */
import { createRequire } from 'node:module';

// playwright lives with the tile-art repo, not here: env first, then a plain resolve
const PW_FROM = process.env.PLAYWRIGHT_REQUIRE_FROM || '/home/onewing/github/MahjongAscent/package.json';
let chromium;
try {
  ({ chromium } = createRequire(PW_FROM)('playwright'));
} catch {
  ({ chromium } = await import('playwright'));
}

const results = [];
const check = (id, ok, detail) => results.push({ id, ok: !!ok, detail });
const PROFILE = JSON.stringify({
  name: 'Toast',
  cat: { fur: '#e0b98a', patternColor: '#5b4636', pattern: 'tabby', eyes: '#8fd18a', eyeStyle: 'round', size: 1, weight: 1, earSize: 1, collar: '#2f8f7f', accessory: 'none', hair: 'none', seed: 41 },
  personality: { name: 'you', setBias: .5, greed: .5, caution: .5, aggression: .4, honourLoyalty: .5, suits: [1, 1, 1], limitHunter: .25, tilt: .2 },
});

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', args: ['--no-sandbox'] });

/* 1. coach on a first visit, and only on a first visit */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(process.argv[2] ?? 'http://localhost:4180/', { waitUntil: 'networkidle' });
  await page.evaluate((p) => { localStorage.clear(); localStorage.setItem('khm.profile.v1', p); }, PROFILE);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sit down' }).click();
  await page.waitForTimeout(2200);
  const first = await page.evaluate(() => ({ coach: !!document.querySelector('.coach'), steps: document.querySelectorAll('.coach__step').length }));
  const dismiss = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.coach button'));
    const next = btns[btns.length - 1];
    // walk every step so the coach is fully closed
    return btns.map((b) => b.textContent.trim());
  });
  for (let i = 0; i < 6; i++) {
    const has = await page.evaluate(() => !!document.querySelector('.coach'));
    if (!has) break;
    await page.evaluate(() => { const btns = Array.from(document.querySelectorAll('.coach button')); btns[btns.length - 1]?.click(); });
    await page.waitForTimeout(250);
  }
  const closed = await page.evaluate(() => !document.querySelector('.coach') && localStorage.getItem('khm.coach.v1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const secondRun = await page.evaluate(() => !!document.querySelector('.coach'));
  await page.getByRole('button', { name: 'Sit down' }).click();
  await page.waitForTimeout(2200);
  const secondSit = await page.evaluate(() => !!document.querySelector('.coach'));
  check('coach:first-visit-shows', first.coach, `${first.steps} step dot(s)`);
  check('coach:closes-and-remembers', closed === 'done', `stored ${closed}`);
  check('coach:not-shown-again', !secondRun && !secondSit, 'second visit is clean');
  check('coach:no-errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* 2. keeping a tile safe, then discarding it */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(process.argv[2] ?? 'http://localhost:4180/', { waitUntil: 'networkidle' });
  await page.evaluate((p) => { localStorage.clear(); localStorage.setItem('khm.coach.v1', 'done'); localStorage.setItem('khm.profile.v1', p); }, PROFILE);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sit down' }).click();
  for (let i = 0; i < 80; i++) {
    const t = await page.evaluate(() => { const g = window.__khm.getState().game; return !!(g && g.phase === 'discard' && g.turn === 0); });
    if (t) break;
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => {
    const s = window.__khm; const g = s.getState().game;
    s.setState({ game: { ...g, seats: g.seats.map((x, i) => i === 0 ? { ...x, hand: [0, 1, 2, 9, 10, 11, 13, 13, 6, 8, 20, 21, 27, 31], melds: [] } : x), lastDrawn: null } });
  });
  await page.waitForTimeout(250);
  const clickTile = async (label) => {
    const idx = await page.evaluate((l) => [...document.querySelectorAll('.dock__hand .tile')].findIndex((t) => t.getAttribute('aria-label') === l), label);
    await page.locator('.dock__hand .tile').nth(idx).click();
    await page.waitForTimeout(180);
  };
  await clickTile('Dots 2');
  await page.locator('.shape-tiles').click();
  await page.waitForTimeout(200);
  const marked = await page.evaluate(() => ({ keep: window.__khm.getState().keep.length, keptTiles: document.querySelectorAll('.tile--kept').length, hint: document.querySelector('.shape-line')?.textContent?.trim(), mark: !!document.querySelector('.shape-tiles.is-kept') }));
  await clickTile('Dots 2'); // this tap releases the mark instead of discarding
  const released = await page.evaluate(() => ({ hand: window.__khm.getState().game.seats[0].hand.length, keep: window.__khm.getState().keep.length }));
  await clickTile('Dots 2');
  await page.waitForTimeout(500);
  const discarded = await page.evaluate(() => window.__khm.getState().game.seats[0].hand.length);
  check('keep:group-marks', marked.keep === 3 && marked.keptTiles === 3 && marked.mark, `keep ${marked.keep}, bars ${marked.keptTiles}`);
  check('keep:hint-explains', /safe/.test(marked.hint ?? ''), `hint "${marked.hint}"`);
  check('keep:blocks-discard', released.hand === 14 && released.keep < 3, `hand ${released.hand}, keep ${released.keep}`);
  check('keep:discard-after-unmark', discarded === 13, `hand ${discarded}`);
  check('keep:no-errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* 3. the claim offer, and a hand played to the end */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(process.argv[2] ?? 'http://localhost:4180/', { waitUntil: 'networkidle' });
  await page.evaluate((p) => { localStorage.clear(); localStorage.setItem('khm.coach.v1', 'done'); localStorage.setItem('khm.profile.v1', p); }, PROFILE);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sit down' }).click();
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    const s = window.__khm; const g = s.getState().game; const k = 13;
    s.setState({ game: { ...g, phase: 'claim', pending: { k, from: 1 }, pendingSeats: [0], claimResponses: {}, lastDrawn: null,
      seats: g.seats.map((x, i) => i === 0 ? { ...x, hand: [k, k, 0, 4, 8, 12, 16, 20, 24, 27, 28, 29, 30], melds: [] } : x) } });
  });
  await page.waitForTimeout(500);
  const offer = await page.evaluate(() => ({
    bar: !!document.querySelector('.claimbar'),
    clock: document.querySelector('.claimbar__clock')?.textContent?.trim(),
    btns: [...document.querySelectorAll('.claimbar button')].map((b) => b.textContent.trim()),
    reflow: (() => {
      const before = document.querySelector('.table').getBoundingClientRect().top;
      return before;
    })(),
  }));
  await page.getByRole('button', { name: 'Pung' }).click();
  await page.waitForTimeout(400);
  const claimed = await page.evaluate(() => ({ melds: window.__khm.getState().game.seats[0].melds.map((m) => m.type), bar: !!document.querySelector('.claimbar') }));

  // play a whole hand through the store
  const hand = await page.evaluate(async () => {
    const s = window.__khm;
    let steps = 0;
    for (let i = 0; i < 4000; i++) {
      const g = s.getState().game;
      if (!g || g.phase === 'ended') break;
      const st = s.getState();
      if (g.phase === 'claim') {
        const seat = g.pendingSeats.find((x) => !g.claimResponses[x]);
        if (seat === 0) st.humanPass(); else if (seat === undefined) st.stepBot(); else st.stepBot();
      } else if (g.turn === 0) {
        const h = g.seats[0].hand;
        st.act({ type: 'discard', seat: 0, k: h[h.length - 1] });
      } else st.stepBot();
      steps++;
      if (steps % 40 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    const g = s.getState().game;
    return { phase: g?.phase, steps };
  });
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    const card = document.querySelector('.modal-scrim .card');
    const r = card?.getBoundingClientRect();
    return {
      open: !!document.querySelector('.modal-scrim'),
      fits: r ? r.top >= 0 && r.bottom <= window.innerHeight : null,
      bottom: r ? Math.round(r.bottom) : null,
      vh: window.innerHeight,
      pageScroll: document.documentElement.scrollHeight - window.innerHeight,
    };
  });
  check('claim:offer-shows', offer.bar, 'claim bar visible');
  check('claim:clock-visible', /^\d+s$/.test(offer.clock ?? ''), `clock "${offer.clock}"`);
  check('claim:buttons', offer.btns.includes('Pung') && offer.btns.includes('Pass'), offer.btns.join('/'));
  check('claim:pung-applies', claimed.melds.includes('pung') && !claimed.bar, `melds ${claimed.melds.join(',')}`);
  check('hand:completes', hand.phase === 'ended', `phase ${hand.phase} after ${hand.steps} steps`);
  check('result:opens', result.open, 'result card shown');
  check('result:fits', result.fits === true, `bottom ${result.bottom}/${result.vh}`);
  check('result:no-page-scroll', result.pageScroll === 0, `scroll ${result.pageScroll}`);
  check('table:no-errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* 4. a crash lands somewhere usable */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(process.argv[2] ?? 'http://localhost:4180/', { waitUntil: 'networkidle' });
  await page.evaluate((p) => { localStorage.clear(); localStorage.setItem('khm.coach.v1', 'done'); localStorage.setItem('khm.profile.v1', p); }, PROFILE);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sit down' }).click();
  await page.waitForTimeout(1800);
  await page.evaluate(() => { const g = window.__khm.getState().game; window.__khm.setState({ game: { ...g, seats: undefined } }); });
  await page.waitForTimeout(600);
  const crash = await page.evaluate(() => ({
    shown: !!document.querySelector('.crash'),
    title: document.querySelector('.crash__title')?.textContent?.trim(),
    reload: !!Array.from(document.querySelectorAll('.crash button, .screen button')).find((b) => /reload/i.test(b.textContent)),
    fresh: !!Array.from(document.querySelectorAll('button')).find((b) => /start fresh/i.test(b.textContent)),
    blank: document.body.innerText.trim().length < 20,
  }));
  check('crash:renders', crash.shown && !crash.blank, `title "${crash.title}"`);
  check('crash:offers-recovery', crash.reload && crash.fresh, 'reload + start fresh');
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  — ${r.detail}`);
console.log(`\n${results.length - failed.length}/${results.length} behaviour checks pass`);
process.exit(failed.length ? 1 : 0);
