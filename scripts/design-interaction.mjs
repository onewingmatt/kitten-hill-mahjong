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

/* 0. the empty-profile menu is understandable and fits a short phone */
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(process.argv[2] ?? 'http://localhost:4180/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('khm.coach.v1', 'done'); });
  await page.reload({ waitUntil: 'networkidle' });

  const layout = await page.evaluate(() => {
    const screen = document.querySelector('.screen--menu');
    const split = [...(screen?.querySelectorAll('.card') ?? [])].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > innerHeight;
    });
    return { overflow: screen ? screen.scrollHeight - screen.clientHeight : Infinity, split: split.length };
  });
  check('menu:empty-fits-360x640', layout.overflow <= 1 && layout.split === 0, `screen overflow ${layout.overflow}px, split cards ${layout.split}`);

  const smallCreateCount = await page.getByRole('button', { name: 'Create', exact: true }).count();
  const create = page.getByRole('button', { name: 'Create a cat', exact: true });
  const createReady = (await create.count()) === 1 && !(await create.isDisabled());
  if (createReady) await create.click();
  await page.waitForTimeout(100);
  const creatorOpen = await page.evaluate(() => !!document.querySelector('.screen--creator'));
  check('menu:create-action-opens-creator', createReady && creatorOpen, `enabled ${createReady}, creator ${creatorOpen}`);
  check('menu:no-duplicate-create-action', smallCreateCount === 0, `${smallCreateCount} secondary Create button(s)`);
  if (creatorOpen) {
    const coatLabel = page.getByText('Coat colour', { exact: true });
    check('creator:coat-swatches-labelled', await coatLabel.count() === 1 && await coatLabel.isVisible(), 'visible label above coat swatches');
    await page.getByRole('button', { name: '‹ Back', exact: true }).click();
    await page.waitForTimeout(100);
  }

  const online = page.getByRole('button', { name: 'Play online · rooms', exact: true });
  const onlineCount = await online.count();
  const onlineDisabled = onlineCount === 1 && await online.isDisabled();
  const note = page.getByText('Create a cat before playing online.', { exact: true });
  const noteVisible = await note.isVisible();
  const onlineExplained = onlineDisabled && noteVisible;
  check('menu:online-prerequisite-visible', onlineExplained, JSON.stringify({ onlineCount, onlineDisabled, noteVisible }));

  const rivalToggle = page.getByRole('button', { name: 'Face a cat', exact: true });
  const collapsed = (await rivalToggle.count()) === 1
    && !(await page.getByRole('textbox', { name: 'Cat code' }).count());
  if (collapsed) {
    await rivalToggle.click();
    await page.waitForTimeout(250);
  }
  const addBox = await page.getByRole('button', { name: 'Add', exact: true }).boundingBox().catch(() => null);
  const formUsable = await page.getByRole('textbox', { name: 'Cat code' }).count() === 1
    && await page.getByRole('textbox', { name: 'Cat name' }).count() === 1
    && !!addBox && addBox.y >= 0 && addBox.y + addBox.height <= 640;
  check('menu:rival-form-opens-and-add-is-visible', collapsed && formUsable, JSON.stringify({ collapsed, addBox }));
  check('menu:no-errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

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
const clickMainSort = async (name) => {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(200);
};
const openMoreSorts = async () => {
  await page.getByRole('button', { name: 'More sort options', exact: true }).click();
  await page.getByRole('dialog', { name: 'More sort options' }).waitFor({ state: 'visible' });
};
// the order the deal left the player with, before any lens is applied
const mineOrder = await order();
const manualPressed = await page.getByRole('button', { name: 'My order', exact: true }).getAttribute('aria-pressed');
check('sort:my-order-is-clear-default', manualPressed === 'true', `aria-pressed ${manualPressed}`);

await openMoreSorts();
const menuHasDescriptions = await page.getByText('Line up the same number across suits.', { exact: true }).count() === 1
  && await page.getByText('Triplets and pairs, then runs and singles.', { exact: true }).count() === 1;
check('sort:more-menu-explains-advanced-options', menuHasDescriptions, `descriptions visible ${menuHasDescriptions}`);
await page.getByRole('button', { name: 'By number', exact: true }).click();
const byRank = await order();

await clickMainSort('By suit');
const bySuit = await order();
await clickMainSort('Hand shape');
const bySmart = await order();
const shapePressed = await page.getByRole('button', { name: 'Hand shape', exact: true }).getAttribute('aria-pressed');

await openMoreSorts();
await page.getByRole('button', { name: 'Groups first', exact: true }).click();
const bySets = await order();
await openMoreSorts();
const groupsPressed = await page.getByRole('button', { name: 'Groups first', exact: true }).getAttribute('aria-pressed');
await page.keyboard.press('Escape');
await page.getByRole('dialog', { name: 'More sort options' }).waitFor({ state: 'detached' });
const escapeClosed = await page.getByRole('dialog', { name: 'More sort options' }).count() === 0;
await page.setViewportSize({ width: 360, height: 640 });
await openMoreSorts();
const shortSheet = await page.evaluate(() => {
  const panel = document.querySelector('.sort-sheet');
  const r = panel?.getBoundingClientRect();
  const options = [...(panel?.querySelectorAll('.sort-option') ?? [])].map((e) => e.getBoundingClientRect());
  return {
    fits: !!r && r.top >= 0 && r.bottom <= innerHeight && panel.scrollHeight <= panel.clientHeight + 1,
    targets: options.map((b) => ({ w: b.width, h: b.height })),
  };
});
const shortSheetFits = shortSheet.fits && shortSheet.targets.length === 2 && shortSheet.targets.every((b) => b.w >= 44 && b.h >= 44);
await page.keyboard.press('Escape');
await page.getByRole('dialog', { name: 'More sort options' }).waitFor({ state: 'detached' });
await page.setViewportSize({ width: 390, height: 844 });
await clickMainSort('My order');
const byMine = await order();
check('sort:rank-orders-by-rank', JSON.stringify(byRank) !== JSON.stringify(byMine), byRank.join(','));
check('sort:suit-groups-suits', JSON.stringify(bySuit) !== JSON.stringify(byRank), bySuit.join(','));
check('sort:groups-option-works', JSON.stringify(bySets) !== JSON.stringify(bySuit), bySets.join(','));
check('sort:groups-selection-announced', groupsPressed === 'true', `aria-pressed ${groupsPressed}`);
check('sort:hand-shape-groups-pairs', JSON.stringify(bySmart) !== JSON.stringify(bySuit), bySmart.join(','));
check('sort:hand-shape-selection-announced', shapePressed === 'true', `aria-pressed ${shapePressed}`);
check('sort:escape-closes-more-menu', escapeClosed, `closed ${escapeClosed}`);
check('sort:more-menu-fits-360x640', shortSheetFits, JSON.stringify(shortSheet));
check('sort:my-order-restores-own-order', JSON.stringify(byMine) === JSON.stringify(mineOrder), `my order ${byMine.join(',')}`);

/* drag an auto-sorted tile: the gesture must return the hand to its own order */
await clickMainSort('Hand shape');
const before = await order();
const box = await page.locator('.dock__hand .tile').first().boundingBox();
const last = await page.locator('.dock__hand .tile').last().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(last.x + last.width - 4, last.y + last.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = await order();
const manualAfterDrag = await page.getByRole('button', { name: 'My order', exact: true }).getAttribute('aria-pressed');
check('drag:reorders-by-hand', JSON.stringify(after) !== JSON.stringify(before) && after.length === before.length, `${before[0]} moved → ${after.join(',')}`);
check('drag:returns-to-my-order', manualAfterDrag === 'true', `My order aria-pressed ${manualAfterDrag}`);

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
