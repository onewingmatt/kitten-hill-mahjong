/**
 * Counting, not spying.
 *
 * Numbers only: which screen was reached, how a hand ended, how long it took.
 * No names, no tiles, no room codes, no cookies. The session id is made fresh on
 * every page load and never stored, so two visits cannot be joined into a person.
 * Do Not Track is honoured by not sending anything at all.
 */
/** Injected by vite.config.ts: the commit this bundle was built from. */
declare const __BUILD__: string;
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'unknown';
/**
 * Playwright/WebDriver sets `navigator.webdriver`. The audits force the crash
 * boundary on purpose, and those rows used to be indistinguishable from a real
 * player hitting the same screen — flag them at the source.
 */
const PROBE =
  typeof navigator !== 'undefined' && (navigator as { webdriver?: boolean }).webdriver === true;

const session =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const queue: { name: string; at: number; props?: Record<string, number | string | boolean> }[] = [];
let timer: number | null = null;

const optedOut = (): boolean =>
  typeof navigator !== 'undefined' && (navigator.doNotTrack === '1' || (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true);

function flush(beacon = false): void {
  if (queue.length === 0) return;
  const events = queue.splice(0, queue.length);
  const body = JSON.stringify({ session, build: BUILD, probe: PROBE, events });
  if (beacon && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon('/beacon', new Blob([body], { type: 'application/json' }));
    return;
  }
  void fetch('/beacon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    /* a dropped counter is not worth a retry loop */
  });
}

export function track(name: string, props?: Record<string, number | string | boolean>): void {
  if (optedOut()) return;
  queue.push({ name, at: Date.now(), props });
  if (queue.length >= 20) {
    flush();
    return;
  }
  if (timer === null) {
    timer = window.setTimeout(() => {
      timer = null;
      flush();
    }, 8000);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flush(true));
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}
