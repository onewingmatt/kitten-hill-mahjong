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
    };
  });

  return {
    overflow: [
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
    ],
    tiny,
    lowContrast: lowContrast.sort((a, b) => a.ratio - b.ratio).slice(0, 8),
    smallTargets: targets.filter((t) => t.w < cfg.MIN_TARGET || t.h < cfg.MIN_TARGET),
  };
};

const VIEWPORTS = [
  ['390x844', 390, 844],
  ['375x667', 375, 667],
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
    localStorage.setItem('khm.coach.v1', 'done');
    localStorage.setItem(
      'khm.profile.v1',
      JSON.stringify({
        name: 'Toast',
        cat: {
          fur: '#e0b98a', patternColor: '#5b4636', pattern: 'tabby', eyes: '#8fd18a', eyeStyle: 'round',
          size: 1, weight: 1, earSize: 1, collar: '#2f8f7f', accessory: 'none', seed: 41,
        },
        personality: {
          name: 'you', setBias: 0.5, greed: 0.5, caution: 0.5, aggression: 0.4, honourLoyalty: 0.5,
          suits: [1, 1, 1], limitHunter: 0.25, tilt: 0.2,
        },
      }),
    );
  });
  await page.reload({ waitUntil: 'networkidle' });

  const screens = {};
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
