import React from 'react';
import { useStore, HUMAN, seatWind } from '../store';
import { CatFace } from '../cat';
import { kind, spriteUrl } from '../../engine/tiles';
import { playStyleLabel } from '../../engine/bots/personality';
import { IconClose } from '../components/Icons';
import { useDialog } from '../useDialog';

const WIND_GLYPH = ['東', '南', '西', '北'];

/**
 * Everything the table already shows about one seat, laid out big enough to read: portrait,
 * concealed count, melds, flowers and the full discard river. Only public state — concealed
 * tiles stay face down even here.
 */
export function PlayerSheet({ seat, onClose }: { seat: number; onClose: () => void }) {
  const { game, seats, scores, handWins, target, dealer, mySeat } = useStore();
  const dialog = useDialog(onClose, { modal: false });
  if (!game) return null;

  const meta = seats[seat];
  const t = game.seats[seat];
  const isYou = seat === mySeat;
  const wind = seatWind(seat, dealer);
  const active = game.phase === 'discard' && game.turn === seat;
  const discards = t.discards;
  const lastDiscard = discards.length - 1;

  return (
    <aside className="sheet sheet--dock" ref={dialog} role="dialog" aria-label={`${meta?.name ?? 'Cat'} details`}>
        <button className="sheet__close icon-btn" aria-label="Close" onClick={onClose}>
          <IconClose size={14} />
        </button>

        <header className="sheet__head">
          <div className={`sheet__fig seat--${seat}`}>
            <div className="sheet__portrait">
              <CatFace cat={meta?.cat} live={active} />
            </div>
          </div>
          <div className="sheet__id">
            <h2 className="sheet__name">{meta?.name ?? 'Cat'}</h2>
            <div className="sheet__tags">
              <span className="wind-disc" style={{ ['--seat' as string]: `var(--seat-${seat})` }}>
                {WIND_GLYPH[wind]}
              </span>
              <span className="sheet__style">{playStyleLabel(meta!.personality)}</span>
              {seat === dealer && <span className="sheet__dealer">dealer</span>}
              {game.phase === 'discard' && game.turn === seat && <span className="sheet__paused">their turn</span>}
              {game.phase === 'claim' && game.pendingSeats.includes(seat) && !game.claimResponses[seat] && (
                <span className="sheet__paused">deciding</span>
              )}
            </div>
            <div className="sheet__score">
              <b>{scores[seat] > 0 ? `+${scores[seat]}` : scores[seat]}</b>
              <span>pts</span>
              <span className="pips" aria-label={`${handWins[seat]} of ${target} hands`}>
                {Array.from({ length: target }).map((_, i) => (
                  <span key={i} className={`pip ${i < handWins[seat] ? 'is-on' : ''}`} />
                ))}
              </span>
            </div>
          </div>
        </header>

        <section className="sheet__section">
          <h2 className="card-label">{isYou ? 'Your hand' : 'Holding'}</h2>
          {isYou ? (
            <div className="sheet__tiles">
              {t.hand
                .slice()
                .sort((a, b) => a - b)
                .map((k, i) => (
                  <img key={`${k}-${i}`} className="sheet__tile" src={spriteUrl(k)} alt={kind(k).label} />
                ))}
            </div>
          ) : (
            <div className="sheet__tiles">
              {Array.from({ length: t.hand.length }).map((_, i) => (
                <span key={i} className="sheet__back" />
              ))}
              <span className="sheet__count">{t.hand.length} concealed</span>
            </div>
          )}

          {t.melds.length > 0 && (
            <div className="sheet__melds">
              {t.melds.map((m, i) => (
                <div key={i} className="sheet__meld">
                  {m.tiles.map((k, j) => (
                    <img
                      key={j}
                      className={`sheet__tile ${m.concealed && j === 0 && m.type !== 'kong' ? 'is-hidden' : ''}`}
                      src={spriteUrl(k)}
                      alt={kind(k).label}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {t.flowers.length > 0 && (
            <div className="sheet__tiles sheet__flowers">
              {t.flowers.map((k, i) => (
                <img key={i} className="sheet__tile" src={spriteUrl(k)} alt={kind(k).label} />
              ))}
              <span className="sheet__count">{t.flowers.length} flowers</span>
            </div>
          )}
        </section>

        <section className="sheet__section">
          <h2 className="card-label">
            Discards <span className="sheet__n">{discards.length}</span>
          </h2>
          {discards.length === 0 ? (
            <p className="sheet__empty">Nothing thrown yet.</p>
          ) : (
            <div className="sheet__river">
              {discards.map((k, i) => (
                <img
                  key={i}
                  className={`sheet__tile ${i === lastDiscard ? 'is-last' : ''}`}
                  src={spriteUrl(k)}
                  alt={kind(k).label}
                />
              ))}
            </div>
          )}
        </section>

    </aside>
  );
}
