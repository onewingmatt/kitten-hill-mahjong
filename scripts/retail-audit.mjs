#!/usr/bin/env node
/**
 * Retail audit: the checks a reviewer notices in the first ten seconds, without a vision model.
 *
 *   node scripts/retail-audit.mjs [url]
 *
 * Fails (exit 1) on: page overflow, interactive targets under 32px, text under 10px, or text below
 * 4.5:1 contrast. Run it at both a 390x844 and a 375x667 viewport — the short phone is where the
 * HUD wraps and the board collides, and auditing one size hides both.
 *
 * Contrast is skipped for anything sitting on a gradient (computed colour vs. a sampled ancestor
 * background produces nonsense there — gold buttons otherwise report 1.04:1).
 */
import { createRequire } from 'node:module';

const require = createRequire(process.env.PLAYWRIGHT_REQUIRE_FROM || import.meta.url.replace(/\/scripts\/[^/]+$/, '/package.json'));
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = await import('playwright'));
}

const URL_UNDER_TEST = process.argv[2] ?? 'http://localhost:4180/';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome-stable';
const MIN_TARGET = 32;
const MIN_TEXT = 10;
const MIN_CONTRAST = 4.5;
const AUDIT_CFG = { MIN_TEXT, MIN_TARGET, MIN_CONTRAST };
const PROFILE = JSON.stringify({
  name: 'Toast',
  cat: {
    fur: '#e0b98a', patternColor: '#5b4636', pattern: 'tabby', eyes: '#8fd18a', eyeStyle: 'round',
    size: 1, weight: 1, earSize: 1, collar: '#2f8f7f', accessory: 'none', seed: 41,
  },
  personality: {
    name: 'you', setBias: 0.5, greed: 0.5, caution: 0.5, aggression: 0.4, honourLoyalty: 0.5,
    suits: [1, 1, 1], limitHunter: 0.25, tilt: 0.2,
  },
});

const AUDIT = (cfg) => {
  const parse = (c) => {
    const m = c.match(/[\d.]+/g);
    return m ? m.slice(0, 4).map(Number) : [0, 0, 0, 1];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  };
  const blend = (fg, bg) => {
    const a = fg[3] ?? 1;
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  };
  const bgOf = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && !c.includes('rgba(0, 0, 0, 0)')) {
        const v = parse(c);
        if ((v[3] ?? 1) > 0.85) return v;
      }
    }
    return [10, 30, 27, 1];
  };
  const onGradient = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (getComputedStyle(n).backgroundImage !== 'none') return true;
    }
    return false;
  };

  const tiny = [];
  const lowContrast = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) continue;

    const size = parseFloat(cs.fontSize);
    const text = el.textContent.trim().slice(0, 28);
    if (size < cfg.MIN_TEXT) tiny.push({ text, size, cls: el.className?.toString().slice(0, 26) });
    if (onGradient(el)) continue;

    const bg = bgOf(el);
    const cr = ratio(blend(parse(cs.color), bg), bg);
    if (cr < cfg.MIN_CONTRAST) lowContrast.push({ text, ratio: Math.round(cr * 100) / 100, size });
  }

  const targets = [...document.querySelectorAll('button, [role="button"], input, a')].map((b) => {
    const r = b.getBoundingClientRect();
    return {
      label: (b.getAttribute('aria-label') || b.textContent || b.getAttribute('placeholder') || '').trim().slice(0, 24),
      w: Math.round(r.width),
      h: Math.round(r.height),
      visible: r.width >= 2 && r.height >= 2 && getComputedStyle(b).visibility !== 'hidden',
    };
  });

  const opponentHands = [...document.querySelectorAll('.opp')].map((seat) => {
    const hold = seat.querySelector('.opp__hold');
    const holdRect = hold?.getBoundingClientRect();
    const pawRect = seat.querySelector('.opp__paw')?.getBoundingClientRect();
    const backs = [...(hold?.querySelectorAll('.opp__back') ?? [])];
    const rects = backs.map((back) => back.getBoundingClientRect());
    const last = rects.at(-1);
    return {
      count: backs.length,
      minWidth: rects.length ? Math.min(...rects.map((r) => r.width)) : 0,
      minHeight: rects.length ? Math.min(...rects.map((r) => r.height)) : 0,
      lastRight: last?.right ?? 0,
      holdRight: holdRect?.right ?? 0,
      pawOverlap: last && pawRect
        ? [Math.max(0, Math.min(last.right, pawRect.right) - Math.max(last.left, pawRect.left)), Math.max(0, Math.min(last.bottom, pawRect.bottom) - Math.max(last.top, pawRect.top))]
        : [0, 0],
      pawGap: last && pawRect ? pawRect.left - last.right : 0,
      winLabel: seat.querySelector('.opp__wins')?.textContent?.includes('wins') ?? false,
    };
  });
  const myWinsLabel = document.querySelector('.dock__you .seat__meta')?.textContent?.includes('wins') ?? false;
  const wallEl = document.querySelector('.wall');
  const wallRing = wallEl?.querySelector('.wall__ring');
  const wallRect = wallRing?.getBoundingClientRect();
  const wallCount = wallEl?.querySelector('.wall__count');
  const countRect = wallCount?.getBoundingClientRect();
  const tileRects = [...(wallEl?.querySelectorAll('.wall__tile') ?? [])].map((tile) => tile.getBoundingClientRect());
  const wall = wallEl ? {
    label: wallEl.getAttribute('aria-label') ?? '',
    countText: wallCount?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    sides: wallEl.querySelectorAll('.wall__seg').length,
    tileBacks: tileRects.length,
    width: wallRect?.width ?? 0,
    height: wallRect?.height ?? 0,
    countCentered: !!wallRect && !!countRect
      && Math.abs((countRect.left + countRect.right) / 2 - (wallRect.left + wallRect.right) / 2) < 1
      && Math.abs((countRect.top + countRect.bottom) / 2 - (wallRect.top + wallRect.bottom) / 2) < 1,
    countClear: !!countRect && tileRects.every((r) => r.right <= countRect.left || r.left >= countRect.right || r.bottom <= countRect.top || r.top >= countRect.bottom),
  } : null;

  return {
    overflow: [
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
    ],
    tiny,
    lowContrast: lowContrast.sort((a, b) => a.ratio - b.ratio).slice(0, 8),
    smallTargets: targets.filter((t) => t.visible && (t.w < cfg.MIN_TARGET || t.h < cfg.MIN_TARGET)),
    opponentHands,
    myWinsLabel,
    wall,
  };
};

const MENU_LAYOUT = () => {
  const screen = document.querySelector('.screen--menu');
  const cards = [...(screen?.querySelectorAll('.card') ?? [])];
  return {
    overflow: screen ? screen.scrollHeight - screen.clientHeight : null,
    splitCards: cards.filter((card) => {
      const r = card.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > window.innerHeight;
    }).map((card) => (card.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 32)),
  };
};

/* The rules doc is one scroll: the card column must never be wider than the
   scroller, the CTA is fixed, and the last card has to be reachable, or the
   screen has silently amputated a section. */
const HOWTO_LAYOUT = () => {
  const sc = document.querySelector('.howto__scroll');
  const cards = [...document.querySelectorAll('.howto__card')];
  const footer = document.querySelector('.howto__footer');
  if (!sc || !footer) return null;
  const keep = sc.scrollTop;
  sc.scrollTop = sc.scrollHeight;
  const scRect = sc.getBoundingClientRect();
  const last = cards.at(-1)?.getBoundingClientRect();
  const reachable = !!last && last.bottom <= scRect.bottom + 1;
  sc.scrollTop = keep;
  const f = footer.getBoundingClientRect();
  return {
    cards: cards.length,
    scrollOverflowX: sc.scrollWidth - sc.clientWidth,
    scrollWidth: Math.round(scRect.width),
    widestCard: cards.length ? Math.round(Math.max(...cards.map((c) => c.getBoundingClientRect().width))) : 0,
    footerOnScreen: f.bottom <= window.innerHeight + 0.5,
    footerFlush: Math.abs(f.left - scRect.left) <= 1 && Math.abs(f.right - scRect.right) <= 1,
    lastCardReachable: reachable,
  };
};

const VIEWPORTS = [
  ['360x640', 360, 640],
  ['375x667', 375, 667],
  ['390x844', 390, 844],
  ['414x896', 414, 896],
];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let failures = 0;

for (const [name, width, height] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('khm.coach.v1', 'done');
  });
  await page.reload({ waitUntil: 'networkidle' });

  const screens = {};
  const emptyMenu = await page.evaluate(AUDIT, AUDIT_CFG);
  const menuLayout = await page.evaluate(MENU_LAYOUT);
  screens['menu-empty'] = {
    ...emptyMenu,
    screenOverflow: menuLayout.overflow,
    splitCards: menuLayout.splitCards,
  };

  await page.evaluate((p) => {
    localStorage.setItem('khm.profile.v1', p);
  }, PROFILE);
  await page.reload({ waitUntil: 'networkidle' });
  screens.menu = await page.evaluate(AUDIT, AUDIT_CFG);

  const toCreator = await page.evaluate(() => {
    const s = window.__khm;
    if (!s) return false;
    s.getState().go('creator');
    return true;
  });
  if (toCreator) {
    await page.waitForTimeout(350);
    screens.creator = await page.evaluate(AUDIT, AUDIT_CFG);
    await page.evaluate(() => window.__khm.getState().go('menu'));
  }

  // the menu foot opens the full rules, not the three-card walkthrough
  const opened = await page.evaluate(() => {
    const link = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'How to play');
    if (!link) return false;
    link.click();
    return true;
  });
  if (opened) {
    await page.waitForTimeout(350);
    screens.howto = { ...(await page.evaluate(AUDIT, AUDIT_CFG)), howto: await page.evaluate(HOWTO_LAYOUT) };
    await page.evaluate(() => window.__khm.getState().closeHowTo());
    await page.waitForTimeout(250);
  } else {
    failures += 1;
    console.log(`FAIL ${name} howto: no "How to play" entry on the menu`);
  }

  // the cattery sheet is a modal, so its type, targets and contrast need the same pass
  const catteryOpen = await page.evaluate(() => {
    const link = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'The cattery');
    if (!link) return false;
    link.click();
    return true;
  });
  if (catteryOpen) {
    await page.waitForTimeout(400);
    screens.cattery = await page.evaluate(AUDIT, AUDIT_CFG);
    screens.cattery.sheet = await page.evaluate(() => {
      const card = document.querySelector('.cattery');
      if (!card) return null;
      const r = card.getBoundingClientRect();
      return {
        width: Math.round(r.width),
        fitsWidth: r.left >= -0.5 && r.right <= window.innerWidth + 0.5,
        scrollX: card.scrollWidth - card.clientWidth,
      };
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }

  const sit = page.getByRole('button', { name: 'Sit down' });
  if (!(await sit.count())) console.log(`warn ${name}: no "Sit down" button, table not audited`);
  if (await sit.count()) {
    await sit.first().click();
    await page.waitForTimeout(2400);
    screens.table = await page.evaluate(AUDIT, AUDIT_CFG);
  }

  for (const [screen, result] of Object.entries(screens)) {
    const bad = [];
    if (result.overflow[0] || result.overflow[1]) bad.push(`overflow ${result.overflow.join('x')}`);
    if (result.tiny.length) bad.push(`${result.tiny.length} text under ${MIN_TEXT}px (${result.tiny[0].text})`);
    if (result.lowContrast.length) bad.push(`${result.lowContrast.length} contrast fails (${result.lowContrast[0].ratio}:1 "${result.lowContrast[0].text}")`);
    if (result.smallTargets.length) bad.push(`${result.smallTargets.length} targets under ${MIN_TARGET}px (${result.smallTargets[0].w}x${result.smallTargets[0].h} ${result.smallTargets[0].label})`);
    if (result.screenOverflow > 1) bad.push(`menu screen overflows by ${Math.ceil(result.screenOverflow)}px`);
    if (result.splitCards?.length) bad.push(`menu card crosses fold (${result.splitCards.join(', ')})`);
    if (screen === 'cattery') {
      const s = result.sheet;
      if (!s) bad.push('cattery sheet did not render');
      else {
        if (!s.fitsWidth) bad.push(`cattery ${s.width}px does not fit the viewport`);
        if (s.scrollX > 1) bad.push(`cattery scrolls sideways by ${s.scrollX}px`);
      }
    }
    if (screen === 'howto') {
      const h = result.howto;
      if (!h) bad.push('howto screen did not render');
      else {
        if (h.cards !== 9) bad.push(`${h.cards} rule cards, expected 9`);
        if (h.scrollOverflowX > 1) bad.push(`rules scroller overflows x by ${h.scrollOverflowX}px`);
        if (h.widestCard > h.scrollWidth + 1) bad.push(`card ${h.widestCard}px wider than scroller ${h.scrollWidth}px`);
        if (!h.footerOnScreen) bad.push('rules CTA below the fold');
        if (!h.footerFlush) bad.push('rules CTA not flush with the card column');
        if (!h.lastCardReachable) bad.push('last rule card unreachable');
      }
    }
    if (screen === 'table' && result.wall) {
      const wallOkay = result.wall.sides === 4 && result.wall.tileBacks === 16
        && result.wall.width <= 58 && result.wall.height <= 58
        && result.wall.countCentered && result.wall.countClear
        && /tiles left in the wall/.test(result.wall.label)
        && /tiles/.test(result.wall.countText);
      if (!wallOkay) bad.push(`wall motif ${result.wall.sides} sides / ${result.wall.tileBacks} tile-backs / ${result.wall.width}×${result.wall.height}px / centered ${result.wall.countCentered} / clear ${result.wall.countClear} / "${result.wall.countText}"`);
    }
    if (result.opponentHands?.length) {
      const malformed = result.opponentHands.some((h) =>
        h.count !== 13 || h.minWidth < 6 || h.minHeight < 10 || h.lastRight > h.holdRight + 0.5 || (h.pawOverlap[0] > 0.5 && h.pawOverlap[1] > 0.5) || h.pawGap < 2 || !h.winLabel,
      );
      if (result.opponentHands.length !== 3 || malformed || !result.myWinsLabel) {
        bad.push(`opponent backs ${result.opponentHands.map((h) => `${h.count}×${h.minWidth.toFixed(1)}×${h.minHeight.toFixed(1)} paw-overlap ${h.pawOverlap.map((n) => n.toFixed(1)).join('×')} paw-gap ${h.pawGap.toFixed(1)}`).join(' / ')}`);
      }
    }
    if (bad.length) {
      failures += 1;
      console.log(`FAIL ${name} ${screen}: ${bad.join(' · ')}`);
    } else {
      console.log(`ok   ${name} ${screen}`);
    }
  }
  if (errors.length) {
    failures += 1;
    console.log(`FAIL ${name}: page errors — ${errors.join(' | ')}`);
  }
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} failing check(s)` : '\nall retail checks pass');
process.exit(failures ? 1 : 0);
