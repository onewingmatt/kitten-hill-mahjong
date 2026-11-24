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
  // the CTA is "Start a new match" when a saved solo match is on the menu, and
  // sitting down here is what replaces it — either label is the same decision
  await page.getByRole('button', { name: /Sit down|Start a new match/ }).click();
  await page.waitForTimeout(2200);
  const secondSit = await page.evaluate(() => !!document.querySelector('.coach'));
  check('coach:first-visit-shows', first.coach, `${first.steps} step dot(s)`);
  check('coach:closes-and-remembers', closed === 'done', `stored ${closed}`);
  check('coach:not-shown-again', !secondRun && !secondSit, 'second visit is clean');
  check('coach:no-errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* 1b. the menu foot opens the full rules, and every section actually explains something */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(process.argv[2] ?? 'http://localhost:4180/', { waitUntil: 'networkidle' });
  await page.evaluate((p) => { localStorage.clear(); localStorage.setItem('khm.coach.v1', 'done'); localStorage.setItem('khm.profile.v1', p); }, PROFILE);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'How to play' }).click();
  await page.waitForTimeout(400);
  const doc = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.howto__card')];
    const sc = document.querySelector('.howto__scroll');
    sc.scrollTop = sc.scrollHeight;
    const last = cards.at(-1).getBoundingClientRect();
    const reach = last.bottom <= sc.getBoundingClientRect().bottom + 1;
    sc.scrollTop = 0;
    return {
      open: !!document.querySelector('.screen--howto'),
      coach: !!document.querySelector('.coach'),
      cards: cards.length,
      titles: cards.map((c) => (c.querySelector('h2')?.textContent || '').replace(/^\d+/, '').trim()),
      // a card is a section only if it says more than its heading
      thin: cards.filter((c) => (c.innerText || '').replace(c.querySelector('h2')?.textContent || '', '').trim().length < 60).length,
      figures: document.querySelectorAll('.howto__card .tile').length,
      reach,
    };
  });
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.waitForTimeout(350);
  const back = await page.evaluate(() => !!document.querySelector('.screen--menu') && !document.querySelector('.screen--howto'));
  check('howto:opens-from-menu', doc.open && !doc.coach, `${doc.cards} sections`);
  check('howto:every-section-explains', doc.cards >= 8 && doc.thin === 0, `${doc.titles.length} headings, ${doc.thin} thin`);
  check('howto:illustrated', doc.figures >= 13, `${doc.figures} tile art`);
  check('howto:last-section-reachable', doc.reach, 'scrolled to the end');
  check('howto:closes-to-menu', back, 'Got it returns to the menu');
  check('howto:no-errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* 1b2. a solo hand teaches the cat: the record moves AND the profile carries it */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(process.argv[2] ?? 'http://localhost:4180/', { waitUntil: 'networkidle' });
  await page.evaluate((p) => { localStorage.clear(); localStorage.setItem('khm.coach.v1', 'done'); localStorage.setItem('khm.profile.v1', p); }, PROFILE);
  await page.reload({ waitUntil: 'networkidle' });
  const learned = await page.evaluate(async () => {
    const S = () => window.__khm.getState();
    S().startMatch(3);
    const before = S().stats.hands;
    const t0 = Date.now();
    while (S().stats.hands === before && Date.now() - t0 < 20_000) {
      const s = S();
      const g = s.game;
      if (!g) break;
      if (g.phase === 'ended') { s.nextHand(); continue; }
      const mine = s.mySeat ?? 0;
      if (g.phase === 'claim' && g.pendingSeats.includes(mine) && !g.claimResponses[mine]) s.act({ type: 'pass', seat: mine });
      else if (g.phase === 'discard' && g.turn === mine) {
        const hand = g.seats[mine].hand;
        if (hand.length) s.act({ type: 'discard', seat: mine, k: hand[hand.length - 1] });
      } else s.stepBot();
      await new Promise((r) => setTimeout(r, 8));
    }
    await new Promise((r) => setTimeout(r, 500));
    const stats = S().stats;
    const saved = JSON.parse(localStorage.getItem('khm.profile.v1') || 'null');
    const live = window.__khmLearn?.personalityFromStats(stats) ?? null;
    return {
      hands: stats.hands,
      throws: stats.throwsBySuit.reduce((a, b) => a + b, 0),
      saved: saved?.personality ?? null,
      live,
      code: saved !== null && live ? window.__khmLearn.encodePersonality(saved.personality) : null,
    };
  });
  const same = learned.saved && learned.live && JSON.stringify(learned.saved) === JSON.stringify(learned.live);
  check('learn:solo-hand-recorded', learned.hands > 0 && learned.throws > 0, `${learned.hands} hands, ${learned.throws} throws`);
  check('learn:profile-carries-the-vector', same, same ? learned.code : `saved ${JSON.stringify(learned.saved)} live ${JSON.stringify(learned.live)}`);
  check('learn:no-errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* 1c. a rack index that outlives its hand must not crash the table.
   Online, `applyRoomState` replaces the hand without going through `act()`, so a
   raised tile could point past the end of the new rack; the raise chip then called
   spriteUrl(undefined) and the whole screen fell to the crash page. */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(process.argv[2] ?? 'http://localhost:4180/', { waitUntil: 'networkidle' });
  await page.evaluate((p) => { localStorage.clear(); localStorage.setItem('khm.coach.v1', 'done'); localStorage.setItem('khm.profile.v1', p); }, PROFILE);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sit down' }).click();
  await page.waitForTimeout(2600);
  const out = await page.evaluate(() => {
    const S = window.__khm.getState();
    const g = S.game;
    // raise the last tile of the rack, then hand back a shorter rack, as a snapshot would
    const short = { ...g, seats: g.seats.map((s, i) => (i === 0 ? { ...s, hand: s.hand.slice(0, 10) } : s)) };
    window.__khm.setState({ mode: 'online', game: short, selected: 13 });
    return { hand: g.seats[0].hand.length };
  });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    crash: !!document.querySelector('.crash'),
    detail: document.querySelector('.crash__detail')?.textContent ?? null,
    rack: document.querySelectorAll('.dock__hand .tile').length,
    chip: !!document.querySelector('.shape-tiles'),
  }));
  check('rack:stale-index-is-harmless', !after.crash && after.rack > 0, `rack ${after.rack}, chip ${after.chip}${after.detail ? ' — ' + after.detail : ''}`);
  check('rack:stale-index-no-errors', errs.length === 0, errs.slice(0, 2).join(' | '));
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

/* 6. options: the two preferences that change how the table reads */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(process.argv[2] ?? 'http://localhost:4180/', { waitUntil: 'networkidle' });
  await page.evaluate((p) => { localStorage.clear(); localStorage.setItem('khm.profile.v1', p); localStorage.setItem('khm.coach.v1', 'done'); }, PROFILE);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const menuEntry = await page.getByRole('button', { name: 'Options' }).count();
  await page.getByRole('button', { name: 'Options' }).first().click();
  await page.waitForTimeout(400);
  const sheet = await page.evaluate(() => {
    const card = document.querySelector('.options');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return {
      rows: document.querySelectorAll('.opt').length,
      fits: r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      pills: [...document.querySelectorAll('.opt__pills .pill')].map((n) => n.textContent.trim()),
      numeralsOn: [...document.querySelectorAll('.opt')].find((n) => /Numbers on character/.test(n.textContent))?.querySelector('.is-on')?.textContent.trim(),
    };
  });
  check('options:opens-from-menu', menuEntry === 1 && !!sheet, sheet ? `${sheet.rows} rows, fits ${sheet.fits}` : 'no sheet');
  check('options:offers-a-table-minimum', (sheet?.pills ?? []).join('|') === 'None|1 fan|2 fan|3 fan', (sheet?.pills ?? []).join('|'));
  check('options:defaults-to-no-minimum', sheet?.pills?.[0] === 'None' && sheet?.numeralsOn === 'Off', `numerals ${sheet?.numeralsOn}`);

  // turn the numerals on and set a 2-fan minimum
  await page.locator('.opt__pills').getByRole('button', { name: '2 fan' }).click();
  await page.locator('.opt').filter({ hasText: 'Numbers on character tiles' }).getByRole('button', { name: 'On' }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Close options' }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /Sit down|Start a new match/ }).first().click();
  await page.waitForTimeout(2200);

  const painted = await page.evaluate(() => {
    const app = document.querySelector('.app');
    const tiles = [...document.querySelectorAll('.tile[data-num]')];
    const ok = tiles.filter((t) => getComputedStyle(t, '::before').content.replace(/"/g, '') === t.getAttribute('data-num'));
    const nonChar = [...document.querySelectorAll('.tile:not([data-num])')].length;
    return {
      classOn: !!app?.classList.contains('has-numerals'),
      chars: tiles.length,
      painted: ok.length,
      nonChars: nonChar,
      firstSize: tiles[0] ? parseFloat(getComputedStyle(tiles[0], '::before').fontSize) : 0,
    };
  });
  check('options:numerals-paint-the-rank', painted.classOn && painted.chars > 0 && painted.painted === painted.chars,
    `${painted.painted}/${painted.chars} characters tiles printed, ${painted.nonChars} honours untouched`);
  check('options:numeral-type-floor', painted.firstSize >= 10, `${painted.firstSize}px`);

  const gate = await page.evaluate(() => ({ minFan: window.__khm.getState().game?.minFan, hand: window.__khm.getState().game?.seats[0].hand.length }));
  check('options:minimum-reaches-the-deal', gate.minFan === 2 && (gate.hand ?? 0) >= 13, `game.minFan ${gate.minFan}, hand ${gate.hand}`);

  // a reload must keep both preferences
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const kept = await page.evaluate(() => ({ numerals: window.__khm.getState().numerals, minFan: window.__khm.getState().minFan }));
  check('options:prefs-survive-a-reload', kept.numerals === true && kept.minFan === 2, JSON.stringify(kept));
  check('options:no-errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  — ${r.detail}`);
console.log(`\n${results.length - failed.length}/${results.length} behaviour checks pass`);
process.exit(failed.length ? 1 : 0);
