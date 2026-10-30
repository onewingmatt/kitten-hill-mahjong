import React from 'react';
import { useStore } from './store';
import { Menu } from './screens/Menu';
import { Creator } from './screens/Creator';
import { Lobby } from './screens/Lobby';
import { Game } from './Game';
import { Announcer } from './Announcer';
import { Coach } from './screens/Coach';
import './styles.css';

// Exposed for QA probes: the live store is the fastest way to read table state.
declare global {
  interface Window {
    __khm?: typeof useStore;
  }
}
if (typeof window !== 'undefined') window.__khm = useStore;

export function App() {
  const screen = useStore((s) => s.screen);
  const boot = useStore((s) => s.boot);
  const coachSeen = useStore((s) => s.coachSeen);
  const coachOpen = useStore((s) => s.coachOpen);
  const setRotateGuard = useStore((s) => s.setRotateGuard);

  /* A phone held sideways cannot show this table: the felt collapsed to 2px and
     the dock ran 63px past the bottom edge. The manifest asks for portrait, but
     a browser tab ignores that, so the app asks too — and freezes the table
     underneath while it does, or a rotate would throw a claim away. */
  React.useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 520px)');
    const apply = () => setRotateGuard(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [setRotateGuard]);

  React.useEffect(() => {
    boot();
  }, [boot]);

  return (
    <>
      <Announcer />
      {screen === 'lobby' ? <Lobby /> : screen === 'creator' ? <Creator /> : screen === 'table' ? <Game /> : <Menu />}
      {/* first run: over the table it is explaining. Any later time: whoever asked for it. */}
      {(coachOpen || (screen === 'table' && !coachSeen)) && <Coach />}
      <RotateGuard />
    </>
  );
}

/** Shown by CSS only in landscape on a short viewport. See the query in App. */
function RotateGuard() {
  return (
    <div className="rotate-guard" role="status" aria-live="polite">
      <svg viewBox="0 0 72 72" className="rotate-guard__art" aria-hidden="true">
        <g transform="rotate(-90 36 36)">
          <rect x="26" y="13" width="20" height="46" rx="6" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="36" cy="52" r="2" fill="currentColor" />
        </g>
        <path d="M11 41a26 26 0 0 1 8-19" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
        <path d="M9 33l2 9 9-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      </svg>
      <p className="rotate-guard__title">Turn your phone upright</p>
      <p className="rotate-guard__body">The table needs the height. Your hand is safe — nothing moves until you turn back.</p>
    </div>
  );
}
