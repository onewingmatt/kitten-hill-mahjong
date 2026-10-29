import React from 'react';
import { useStore } from './store';
import { Menu } from './screens/Menu';
import { Creator } from './screens/Creator';
import { Lobby } from './screens/Lobby';
import { Game } from './Game';
import { Announcer } from './Announcer';
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

  React.useEffect(() => {
    boot();
  }, [boot]);

  return (
    <>
      <Announcer />
      {screen === 'lobby' ? <Lobby /> : screen === 'creator' ? <Creator /> : screen === 'table' ? <Game /> : <Menu />}
    </>
  );
}
