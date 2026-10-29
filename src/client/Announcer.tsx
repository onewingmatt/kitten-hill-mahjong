import React from 'react';
import { useStore } from './store';

/**
 * Screen readers get the table narration the sighted player gets from animation. One polite live
 * region, rewritten on each meaningful state change; it is never visible and never focusable.
 */
export function Announcer() {
  const screen = useStore((s) => s.screen);
  const game = useStore((s) => s.game);
  const seats = useStore((s) => s.seats);
  const mySeat = useStore((s) => s.mySeat);
  const resultOpen = useStore((s) => s.resultOpen);
  const [message, setMessage] = React.useState('');

  const turn = game?.turn;
  const phase = game?.phase;

  React.useEffect(() => {
    if (screen !== 'table' || !game) {
      setMessage('');
      return;
    }
    let next = '';
    if (resultOpen) {
      next = 'Hand finished. Result is open.';
    } else if (phase === 'claim') {
      next = 'A call is available.';
    } else if (phase === 'ended') {
      next = 'Hand over.';
    } else if (turn === mySeat) {
      next = 'Your turn.';
    } else if (turn !== undefined) {
      next = `${seats[turn]?.name ?? 'Another cat'} is playing.`;
    }
    // clearing first makes a repeated announcement speak again
    setMessage('');
    const id = window.setTimeout(() => setMessage(next), 60);
    return () => window.clearTimeout(id);
  }, [screen, game, phase, turn, mySeat, resultOpen, seats]);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
