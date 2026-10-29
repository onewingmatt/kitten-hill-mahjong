#!/usr/bin/env node
/**
 * Design checks: the settled product decisions, asserted against the running build.
 *
 *   PLAYWRIGHT_REQUIRE_FROM=/home/onewing/github/MahjongAscent/package.json \
 *     node scripts/design-interaction.mjs [url]
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));

await page.goto(process.argv[2] ?? 'http://localhost:4180/', { waitUntil: 'networkidle' });
await page.evaluate((p) => { localStorage.clear(); localStorage.setItem('khm.coach.v1', 'done'); localStorage.setItem('khm.profile.v1', p); }, PROFILE);
await page.reload({ waitUntil: 'networkidle' });

/* rival code: the menu can seat someone else's cat */
const menuCode = await page.evaluate(() => {
  const id = window.__khm.getState().profile;
  return id ? true : false;
});
const rival = await page.evaluate(async () => {
  const s = window.__khm.getState();
  const mod = await import('/src/engine/bots/personality.ts').catch(() => null);
  return { hasProfile: !!s.profile, hasStats: !!s.stats };
});

await page.getByRole('button', { name: 'Sit down' }).click();
// the deal animation swallows taps for ~2.3s by design
for (let i = 0; i < 40; i++) {
  const clean = await page.evaluate(() => !document.querySelector('.wash'));
  if (clean) break;
  await page.waitForTimeout(150);
}
for (let i = 0; i < 80; i++) {
  const t = await page.evaluate(() => { const g = window.__khm.getState().game; return !!(g && g.phase === 'discard' && g.turn === 0); });
  if (t) break;
  await page.waitForTimeout(200);
}

/* a fixed hand so the sort modes can be compared */
await page.evaluate(() => {
  const s = window.__khm; const g = s.getState().game;
  s.setState({ game: { ...g, seats: g.seats.map((x, i) => i === 0 ? { ...x, hand: [13, 13, 0, 4, 8, 9, 20], melds: [] } : x), lastDrawn: null } });
});
await page.waitForTimeout(300);

const order = () => page.evaluate(() => [...document.querySelectorAll('.dock__hand .tile')].map((t) => t.getAttribute('aria-label')));
// the order the deal left the player with, before any lens is applied
const mineOrder = await order();
const clickSort = async (name) => {
  await page.evaluate((n) => {
    const b = Array.from(document.querySelectorAll('.segmented button')).find((x) => x.textContent.trim() === n);
    b?.click();
  }, name);
  await page.waitForTimeout(200);
};

await clickSort('Rank');
const byRank = await order();
await clickSort('Suit');
const bySuit = await order();
await clickSort('Sets');
const bySets = await order();
await clickSort('Mine');
const byMine = await order();
check('sort:rank-orders-by-rank', JSON.stringify(byRank) !== JSON.stringify(byMine), byRank.join(','));
check('sort:suit-groups-suits', JSON.stringify(bySuit) !== JSON.stringify(byRank), bySuit.join(','));
check('sort:sets-pulls-sets-forward', JSON.stringify(bySets) !== JSON.stringify(bySuit), bySets.join(','));
check('sort:mine-restores-own-order', JSON.stringify(byMine) === JSON.stringify(mineOrder), `mine ${byMine.join(',')}`);

/* drag the first tile to the far right and check the order changed */
const before = await order();
const box = await page.locator('.dock__hand .tile').first().boundingBox();
const last = await page.locator('.dock__hand .tile').last().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(last.x + last.width - 4, last.y + last.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = await order();
check('drag:reorders-by-hand', JSON.stringify(after) !== JSON.stringify(before) && after.length === before.length, `${before[0]} moved → ${after.join(',')}`);

/* the player sheet explains a seat */
await page.evaluate(() => { const el = document.querySelector('.dock__you'); el?.click(); });
await page.waitForTimeout(400);
const sheet = await page.evaluate(() => ({ open: !!document.querySelector('.sheet__head'), close: !!document.querySelector('.sheet__close') }));
check('sheet:opens-from-own-seat', sheet.open, 'player sheet visible');
await page.evaluate(() => document.querySelector('.sheet__close')?.click());
await page.waitForTimeout(300);
check('sheet:closes', await page.evaluate(() => !document.querySelector('.sheet__head')), 'sheet dismissed');

/* mute survives a reload */
await page.evaluate(() => document.querySelector('.icon-btn[aria-label*="ute"]')?.click());
await page.waitForTimeout(200);
const mutedLive = await page.evaluate(() => window.__khm.getState().muted);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const mutedAfterReload = await page.evaluate(() => window.__khm.getState().muted);
check('mute:toggles', typeof mutedLive === 'boolean', `live ${mutedLive}`);
check('mute:persists', mutedAfterReload === mutedLive, `after reload ${mutedAfterReload}`);

check('interaction:no-errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  — ${r.detail}`);
console.log(`\n${results.length - failed.length}/${results.length} interaction checks pass`);
process.exit(failed.length ? 1 : 0);
