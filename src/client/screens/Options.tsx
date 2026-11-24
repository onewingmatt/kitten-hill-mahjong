import React from 'react';
import { useStore } from '../store';
import { useDialog } from '../useDialog';
import { sfx } from '../audio';

/**
 * The options sheet.
 *
 * Preferences that change how the table reads, not what the rules are: nothing
 * here can make a hand invalid, so it can open over a live hand without pausing
 * anything. Each row is an explicit Off/On pair rather than a switch, matching the
 * creator's collar control — a phone player can see which side is live without
 * having to interpret a knob position.
 */
export function OptionsDialog() {
  const numerals = useStore((s) => s.numerals);
  const setNumerals = useStore((s) => s.setNumerals);
  const minFan = useStore((s) => s.minFan);
  const setMinFan = useStore((s) => s.setMinFan);
  const muted = useStore((s) => s.muted);
  const toggleMute = useStore((s) => s.toggleMute);
  const closeOptions = useStore((s) => s.closeOptions);
  const ref = useDialog(closeOptions);

  const row = (
    label: string,
    detail: string,
    on: boolean,
    set: (v: boolean) => void,
    name: string,
  ) => (
    <div className="opt">
      <div className="opt__text">
        <span className="opt__label">{label}</span>
        <span className="opt__detail">{detail}</span>
      </div>
      <div className="segmented opt__toggle" role="group" aria-label={name}>
        <button
          type="button"
          className={on ? '' : 'is-on'}
          aria-pressed={!on}
          onClick={() => {
            if (!on) return;
            sfx.ui();
            set(false);
          }}
        >
          Off
        </button>
        <button
          type="button"
          className={on ? 'is-on' : ''}
          aria-pressed={on}
          onClick={() => {
            if (!on) sfx.ui();
            set(true);
          }}
        >
          On
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="modal-scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeOptions();
      }}
    >
      <div className="card options" ref={ref} role="dialog" aria-modal="true" aria-label="Options">
        <div className="row row--between options__head">
          <h2 className="card-label">Options</h2>
          <button className="icon-btn" aria-label="Close options" onClick={closeOptions}>
            ✕
          </button>
        </div>
        <div className="options__rows">
          {row('Sound effects', 'Tile clacks, calls and the wash.', muted ? false : true, (v) => {
            if (v === muted) toggleMute();
          }, 'Sound effects')}
          {row(
            'Numbers on character tiles',
            'Print the rank on 萬 tiles, for anyone who does not read the numeral.',
            numerals,
            setNumerals,
            'Numbers on character tiles',
          )}
          {/* Advanced: a rule, not a preference. It changes what a legal win
              is, so it is stated as one and never buried behind a switch. */}
          <div className="opt opt--stack">
            <div className="opt__text">
              <span className="opt__label">
                Minimum fan to win <span className="opt__tag">advanced</span>
              </span>
              <span className="opt__detail">
                A hand worth fewer fan than this cannot be declared — 1 fan per double. Applies to
                the next match you start, online included; the cats play to it too.
              </span>
            </div>
            <div className="pills opt__pills" role="group" aria-label="Minimum fan to win">
              {/* "None" not "No minimum": four labels have to share one 276px row at 360 */}
              {[0, 1, 2, 3].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`pill ${minFan === m ? 'is-on' : ''}`}
                  aria-pressed={minFan === m}
                  onClick={() => {
                    if (minFan === m) return;
                    sfx.ui();
                    setMinFan(m);
                  }}
                >
                  {m === 0 ? 'None' : `${m} fan`}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="options__foot">
          Saved on this device. Everything here is a way of reading the table, except the minimum —
          that one changes what a legal win is.
        </p>
      </div>
    </div>
  );
}
