import React from 'react';
import { useStore } from '../store';
import { useDialog } from '../useDialog';
import { IconPaw, IconSparkle, IconTrophy } from '../components/Icons';

const STEPS = [
  {
    icon: IconPaw,
    title: 'Your rack',
    body: 'Tap a tile to raise it, tap again to throw it. Drag one sideways or up a row to arrange the hand however you read it best.',
  },
  {
    icon: IconSparkle,
    title: 'The table',
    body: 'One cat plays at a time — their ring lights up, their paw moves, and a call flashes over their head. The number in the middle is how many tiles are left to draw.',
  },
  {
    icon: IconTrophy,
    title: 'Winning',
    body: 'Four sets and a pair. A flush, a dragon pung or your own wind each add a fan — that is what a hand is worth here. Watch for READY: it means one tile finishes you.',
  },
];

/** First-hand walkthrough. Shown once, then remembered. */
export function Coach() {
  // the walkthrough is a first-run surface: closing it spends the one-shot flag
  // and it unmounts. The full rules live behind How to play on the menu.
  const close = useStore((s) => s.closeCoach);
  const card = useDialog(close);
  const [step, setStep] = React.useState(0);
  const Icon = STEPS[step].icon;
  const last = step === STEPS.length - 1;

  return (
    <div
      className={`coach ${step === 0 ? 'coach--top' : ''}`}
      ref={card}
      role="dialog"
      aria-modal="true"
      aria-label="How to play"
    >
      <div className="coach__card">
        <span className="coach__step">
          {step + 1} / {STEPS.length}
        </span>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <span style={{ color: 'var(--gold)' }}>
            <Icon size={26} />
          </span>
          <h2 className="coach__title">{STEPS[step].title}</h2>
        </div>
        <p className="coach__body">{STEPS[step].body}</p>
        <div className="coach__dots">
          {STEPS.map((_, i) => (
            <span key={i} className={`coach__dot ${i === step ? 'is-on' : ''}`} />
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--ghost" onClick={close}>
            Skip
          </button>
          <button
            className="btn btn--primary grow"
            onClick={() => (last ? close() : setStep(step + 1))}
          >
            {last ? 'Deal me in' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
