#!/usr/bin/env node
/**
 * Design checks: the settled product decisions, asserted against the running build.
 *
 *   PLAYWRIGHT_REQUIRE_FROM=/home/onewing/github/MahjongAscent/package.json \
 *     node scripts/design-audit.mjs [url]
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

const HEX = process.env.CHROME_PATH ?? '/usr/bin/google-chrome-stable';

const results = [];
const check = (id, ok, detail) => results.push({ id, ok: !!ok, detail });

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}\u{2600}-\u{27BF}]/u;

const browser = await chromium.launch({ executablePath: HEX, args: ['--no-sandbox'] });

for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  const tag = `${vp.width}`;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(process.argv[2] ?? 'http://localhost:4180/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('khm.coach.v1', 'done');
    localStorage.setItem('khm.profile.v1', JSON.stringify({
      name: 'Toast',
      cat: { fur: '#e0b98a', patternColor: '#5b4636', pattern: 'tabby', eyes: '#8fd18a', eyeStyle: 'round', size: 1, weight: 1, earSize: 1, collar: '#2f8f7f', accessory: 'none', hair: 'none', seed: 41 },
      personality: { name: 'you', setBias: .5, greed: .5, caution: .5, aggression: .4, honourLoyalty: .5, suits: [1, 1, 1], limitHunter: .25, tilt: .2 },
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });

  /* ---------- menu ---------- */
  const menu = await page.evaluate(() => ({
    text: document.body.innerText,
    sit: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Sit down'),
    scrollY: document.documentElement.scrollHeight - window.innerHeight,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    targets: Array.from(document.querySelectorAll('button')).filter((b) => /^(Single hand|First to [23])$/.test(b.textContent.trim())).length,
    name: document.body.innerText.includes('Toast'),
  }));
  check(`menu:${tag}:sit-down`, menu.sit, 'Sit down button');
  check(`menu:${tag}:name`, menu.name, 'profile name shown');
  check(`menu:${tag}:target-choice`, menu.targets === 3, `${menu.targets}/3 match-length options`);
  check(`menu:${tag}:no-h-overflow`, menu.overflowX === 0, `overflowX ${menu.overflowX}`);
  check(`menu:${tag}:no-emoji`, !EMOJI.test(menu.text), 'rendered text is emoji-free');

  /* ---------- creator ---------- */
  await page.evaluate(() => window.__khm.getState().go('creator'));
  await page.waitForTimeout(350);
  const creator = await page.evaluate(() => {
    const save = document.querySelector('.creator__save')?.getBoundingClientRect();
    const sw = document.querySelector('.swatches')?.children ?? [];
    const rows = new Set(Array.from(sw).map((c) => Math.round(c.getBoundingClientRect().top))).size;
    const heads = Array.from(document.querySelectorAll('.creator h2, .creator h3')).map((h) => h.textContent.trim());
    return {
      text: document.body.innerText,
      heads,
      saveBottom: save ? Math.round(save.bottom) : null,
      vh: window.innerHeight,
      swatchRows: rows,
      collarToggle: !!Array.from(document.querySelectorAll('.segmented button')).find((b) => b.textContent.trim() === 'Off'),
      scarf: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Scarf'),
      pageScroll: document.documentElement.scrollHeight - window.innerHeight,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      innerScrollable: (() => { const s = document.querySelector('.creator__scroll'); return s ? s.scrollHeight > s.clientHeight : false; })(),
    };
  });
  check(`creator:${tag}:no-your-style`, !/your style/i.test(creator.text), 'no play-style card');
  check(`creator:${tag}:save-in-view`, creator.saveBottom !== null && creator.saveBottom <= creator.vh, `save bottom ${creator.saveBottom}/${creator.vh}`);
  check(`creator:${tag}:collar-toggle`, creator.collarToggle, 'Off/On segmented control');
  check(`creator:${tag}:scarf-charm`, creator.scarf, 'Scarf charm option');
  check(`creator:${tag}:no-page-scroll`, creator.pageScroll === 0, `page scroll ${creator.pageScroll}`);
  check(`creator:${tag}:inner-scrolls`, creator.innerScrollable, 'controls scroll inside the screen');
  check(`creator:${tag}:no-h-overflow`, creator.overflowX === 0, `overflowX ${creator.overflowX}`);
  check(`creator:${tag}:no-emoji`, !EMOJI.test(creator.text), 'rendered text is emoji-free');
  check(`creator:${tag}:swatch-grid`, vp.width === 375 ? creator.swatchRows >= 2 : creator.swatchRows === 2, `${creator.swatchRows} rows`);

  /* ---------- table ---------- */
  await page.evaluate(() => window.__khm.getState().startMatch(2));
  await page.waitForTimeout(2600);
  const table = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.dock__hand .tile'));
    const tops = new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top)));
    const dock = document.querySelector('.dock')?.getBoundingClientRect();
    return {
      text: document.body.innerText,
      tiles: tiles.length,
      rows: tops.size,
      tileW: tiles[0] ? Math.round(tiles[0].getBoundingClientRect().width) : 0,
      sortMode: window.__khm.getState().sortMode,
      chip: document.querySelector('.away, .ready')?.textContent?.trim() ?? null,
      dockW: dock ? Math.round(dock.width) : null,
      vw: window.innerWidth,
      pageScroll: document.documentElement.scrollHeight - window.innerHeight,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  check(`table:${tag}:no-page-scroll`, table.pageScroll === 0, `page scroll ${table.pageScroll}`);
  check(`table:${tag}:no-h-overflow`, table.overflowX === 0, `overflowX ${table.overflowX}`);
  check(`table:${tag}:dock-pinned`, table.dockW === table.vw, `dock ${table.dockW} / viewport ${table.vw}`);
  check(`table:${tag}:two-rows`, table.rows === 2, `${table.rows} rows`);
  check(`table:${tag}:tile-size`, table.tileW >= 45, `tile ${table.tileW}px wide`);
  check(`table:${tag}:hand-size`, table.tiles >= 13, `${table.tiles} tiles in hand`);
  check(`table:${tag}:manual-sort`, table.sortMode === 'manual', `sort ${table.sortMode}`);
  check(`table:${tag}:distance-chip`, !!table.chip, `chip "${table.chip}"`);
  check(`table:${tag}:no-emoji`, !EMOJI.test(table.text), 'rendered text is emoji-free');
  check(`table:${tag}:no-errors`, errs.length === 0, errs.slice(0, 2).join(' | '));

  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  — ${r.detail}`);
console.log(`\n${results.length - failed.length}/${results.length} checks pass`);
process.exit(failed.length ? 1 : 0);
