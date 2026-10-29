import React from 'react';
import type { GameState } from '../../engine/types';
import type { SeatMeta } from '../store';
import { IconClose } from '../components/Icons';
import { useDialog } from '../useDialog';

/** The engine writes seat labels ("East discards …"); the table uses cat names. */
const SEAT_LABEL = ['East', 'South', 'West', 'North'];

function withCatName(text: string, seat: number | null, seats: SeatMeta[]): string {
  if (seat === null) return text;
  const label = SEAT_LABEL[seat];
  const name = seats[seat]?.name;
  if (!name || !text.startsWith(label)) return text;
  return name + text.slice(label.length);
}

interface LogSheetProps {
  game: GameState;
  seats: SeatMeta[];
  mySeat: number;
  onClose: () => void;
}

/**
 * The table log: what actually happened, newest first. The dock button used to
 * flash the last line for a second; that is not a record you can read.
 *
 * Draws are dimmed because they are most of the entries and nobody scans them,
 * while discards and calls stay at full strength. Freezing the table while this
 * is open is the caller's job.
 */
export function LogSheet({ game, seats, mySeat, onClose }: LogSheetProps) {
  const rows = React.useMemo(() => game.log.slice().reverse().slice(0, 120), [game.log]);
  const dialog = useDialog(onClose);

  return (
    <div className="modal-scrim" onClick={onClose} role="presentation">
      <div
        className="card log"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Table log"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row row--between log__head">
          <div>
            <h2 className="log__title">Table log</h2>
            <span className="log__sub">
              Hand {game.handNumber} · {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <button className="icon-btn" aria-label="Close the log" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="log__empty">Nothing has happened yet.</p>
        ) : (
          <ol className="log__list">
            {rows.map((e) => (
              <li
                key={e.t}
                className={[
                  'log__row',
                  // the highlight means "you did this", so it stays off the draws
                  e.seat === mySeat && e.type !== 'draw' ? 'is-you' : '',
                  e.type === 'draw' ? 'is-draw' : '',
                  e.type === 'pon' || e.type === 'chi' || e.type === 'kan' ? 'is-call' : '',
                  e.type === 'win' || e.type === 'drawGame' ? 'is-end' : '',
                ].filter(Boolean).join(' ')}
              >
                <span
                  className="log__dot"
                  style={{ background: e.seat === null ? 'rgb(248 240 225 / 0.35)' : `var(--seat-${e.seat})` }}
                  aria-hidden="true"
                />
                <span className="log__text">{withCatName(e.text, e.seat, seats)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
