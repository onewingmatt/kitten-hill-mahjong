import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { unlockAudio } from './audio';
import { track } from './telemetry';
import { spriteUrl } from '../engine/tiles';

const el = document.getElementById('root');
if (!el) throw new Error('missing #root');

// iOS will only start an audio context inside a gesture. The first touch anywhere
// warms it, so the deal that follows a tap is audible rather than swallowed.
const warm = () => {
  unlockAudio();
  window.removeEventListener('pointerdown', warm, true);
  window.removeEventListener('touchstart', warm, true);
};
window.addEventListener('pointerdown', warm, true);
window.addEventListener('touchstart', warm, true);

// a long press on the felt should not raise the browser's context menu
window.addEventListener('contextmenu', (e) => {
  if (!(e.target instanceof HTMLElement) || !e.target.closest('input, textarea')) e.preventDefault();
});

// Offline shell. Only in a build, and only over https/localhost: a service worker
// on a bare LAN address never registers, which is why the tailnet URL stays plain.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
  // a new deploy puts a new worker in charge. Reload once so the page is never
  // running JS from a build whose hashed chunks have just been replaced.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

track('boot');

// warm the deck once the first screen has painted, so the deal does not wait on
// fourteen separate image requests
const warmDeck = () => {
  for (let k = 0; k < 42; k++) {
    const img = new Image();
    img.decoding = 'async';
    img.src = spriteUrl(k);
  }
};
const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
if (idle) idle(warmDeck, { timeout: 3000 });
else window.setTimeout(warmDeck, 1500);
window.addEventListener('error', (e) => {
  track('error', { message: String(e.message ?? '').slice(0, 160), source: 'window' });
});
window.addEventListener('unhandledrejection', (e) => {
  track('error', { message: String((e.reason as Error)?.message ?? e.reason ?? '').slice(0, 160), source: 'promise' });
});

createRoot(el).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
