import React from 'react';
import { useStore } from '../store';
import { CatFace, defaultCat } from '../cat';
import { IconClose } from '../components/Icons';
import { encodePersonality, playStyleLabel } from '../../engine/bots/personality';
import { personalityFromStats } from '../stats';
import { BackupSheet } from './BackupSheet';
import { Cattery } from './Cattery';
import { sfx } from '../audio';
import { useDialog } from '../useDialog';
import { IconMute, IconSound } from '../components/Icons';

export function Menu() {
  const {
    profile,
    target,
    startMatch,
    go,
    muted,
    toggleMute,
    boot,
    rival,
    addRival,
    clearRival,
    stats,
    savedMatch,
    resume,
    dropSaved,
    openHowTo,
    openOptions,
  } = useStore();
  const [choice, setChoice] = React.useState<1 | 2 | 3>(target);
  const [copied, setCopied] = React.useState(false);
  const [backupOpen, setBackupOpen] = React.useState(false);
  const [codeInput, setCodeInput] = React.useState('');
  const [codeError, setCodeError] = React.useState(false);
  const [nameInput, setNameInput] = React.useState('');
  const [rivalOpen, setRivalOpen] = React.useState(false);
  const rivalAddRef = React.useRef<HTMLButtonElement>(null);
  const [askNew, setAskNew] = React.useState(false);
  const [catteryOpen, setCatteryOpen] = React.useState(false);

  React.useEffect(() => {
    if (!rivalOpen || rival) return;
    const frame = window.requestAnimationFrame(() => {
      rivalAddRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [rivalOpen, rival]);

  React.useEffect(() => {
    boot();
  }, [boot]);

  // the vector is measured, so the menu must read it live or it goes stale the moment you play
  const personality = personalityFromStats(stats);
  const code = profile ? encodePersonality(personality) : '';

  const copyCode = async () => {
    if (!code) return;
    sfx.ui();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const sit = () => {
    sfx.claim();
    startMatch(choice);
  };

  return (
    <div className="screen screen--menu">
      <button className="icon-btn screen__corner" aria-label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
        {muted ? <IconMute /> : <IconSound />}
      </button>

      <div className="menu__hero">
        <div className="menu__cat">
          {profile ? (
            <CatFace cat={profile.cat} />
          ) : (
            // a cat-shaped hole reads as "your cat goes here"; a question mark reads as a bug
            <div className="menu__ghost" aria-hidden="true">
              <CatFace cat={defaultCat(0)} />
            </div>
          )}
        </div>
        <div className="wordmark">
          <h1>
            Kitten Hill
            <br />
            Mahjong
          </h1>
          <p>four cats · one table</p>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 12 }}>
          <div className="grow">
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 21 }}>
              {profile?.name ?? 'No cat yet'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(248,240,225,.68)', marginTop: 3 }}>
              {profile ? playStyleLabel(personality) : 'Create a cat to sit down'}
              {/* the record is what your cat's style is measured from — showing it
                  turns a hidden mechanic into a reason to come back, and costs a line
                  that was already there */}
              {profile && stats.hands > 0 && ` · ${stats.hands} hand${stats.hands === 1 ? '' : 's'}, ${stats.wins} won`}
            </div>
          </div>
          {profile && (
            <button className="btn btn--ghost btn--sm" onClick={() => go('creator')}>
              Edit
            </button>
          )}
        </div>

        {profile && (
          <>
            <button className="codechip" onClick={copyCode} aria-label="Copy your cat code">
              <span className="codechip__label">{copied ? 'copied' : 'cat code'}</span>
              <span className="codechip__value">{code}</span>
            </button>
          </>
        )}
        <button className="menu__backup" onClick={() => setBackupOpen(true)}>
          {profile ? 'Back up or restore this cat' : 'Restore a cat from a code'}
        </button>
      </div>

      {/* the saved-match card has to fit in the slot the match-length card
          leaves: it is the same decision (which match am I playing), so it must
          not push "Play online" off a 640-tall screen */}
      {savedMatch ? (
        <div className="card resume">
          <div className="row row--between resume__head">
            <span className="resume__label">
              Saved · hand {savedMatch.handNo} of {savedMatch.target}
            </span>
            <button className="resume__drop" onClick={dropSaved}>
              Delete save
            </button>
          </div>
          <div className="row resume__row">
            <span className="resume__sub">
              You {savedMatch.handWins[savedMatch.mySeat] ?? 0} –{' '}
              {Math.max(...savedMatch.handWins.filter((_, i) => i !== savedMatch.mySeat))}{' '}
              {bestRivalName(savedMatch.seats, savedMatch.mySeat, savedMatch.handWins)}
            </span>
            <button className="btn btn--primary" style={{ height: 44, padding: '0 14px' }} onClick={resume}>
              Resume
            </button>
          </div>
        </div>
      ) : (
      <div className="card">
        <h2>Match length</h2>
        <div className="pills">
          {([1, 2, 3] as const).map((t) => (
            <button
              key={t}
              className={`pill ${choice === t ? 'is-on' : ''}`}
              onClick={() => {
                sfx.ui();
                setChoice(t);
              }}
            >
              {t === 1 ? 'Single hand' : `First to ${t}`}
            </button>
          ))}
        </div>
      </div>
      )}

      <button
        className={`btn ${savedMatch ? 'btn--ghost' : 'btn--primary'} menu__create`}
        style={{ height: 52, fontSize: 16, marginTop: 2 }}
        onClick={() => {
          if (!profile) {
            sfx.ui();
            go('creator');
          } else if (savedMatch) {
            setAskNew(true);
          } else {
            sit();
          }
        }}
      >
        {!profile ? 'Create a cat' : savedMatch ? 'Start a new match' : 'Sit down'}
      </button>

      <button
        className="btn btn--ghost btn--outline menu__online"
        style={{ height: 44 }}
        onClick={() => { sfx.ui(); useStore.getState().enterLobby(); }}
        disabled={!profile}
        aria-describedby={!profile ? 'menu-online-note' : undefined}
      >
        Play online · rooms
      </button>
      {!profile && <p className="menu__disabled-note" id="menu-online-note">Create a cat before playing online.</p>}

      <div className="card menu__rival">
        {rival ? (
          <>
            <h2>Face a cat</h2>
            <div className="row" style={{ gap: 10 }}>
              <div className="seat__badge" style={{ width: 40, height: 40, borderColor: 'var(--seat-1)' }}>
                <CatFace cat={rival.cat} />
              </div>
              <div className="grow">
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{rival.name}</div>
                <div style={{ fontSize: 10.5, color: 'rgba(248,240,225,.6)' }}>
                  seated · {playStyleLabel(rival.personality)}
                </div>
              </div>
              <button className="icon-btn" aria-label="Remove this cat" onClick={clearRival}>
                <IconClose size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className="menu__rival-toggle"
              aria-label="Face a cat"
              aria-expanded={rivalOpen}
              aria-controls="menu-rival-form"
              onClick={() => setRivalOpen((open) => !open)}
            >
              <span className="menu__rival-copy">
                <span className="menu__rival-title">Face a cat</span>
                <span className="menu__rival-subtitle">Add a friend’s cat by code</span>
              </span>
              <span className="menu__rival-mark" aria-hidden="true">{rivalOpen ? '−' : '+'}</span>
            </button>
            <div id="menu-rival-form" className="menu__rival-form" hidden={!rivalOpen}>
              <input
                className="input"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value.toUpperCase());
                  setCodeError(false);
                }}
                placeholder="CAT CODE"
                spellCheck={false}
                autoComplete="off"
                aria-label="Cat code"
              />
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <input
                  className="input input--name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value.slice(0, 14))}
                  placeholder="CAT'S NAME"
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Cat name"
                />
                <button
                  ref={rivalAddRef}
                  className="btn btn--ghost btn--sm"
                  style={{ height: 42 }}
                  onClick={() => {
                    if (!codeInput.trim()) return;
                    const ok = addRival(codeInput, nameInput.trim() || 'Guest');
                    setCodeError(!ok);
                    if (ok) {
                      sfx.claim();
                      setCodeInput('');
                      setNameInput('');
                    }
                  }}
                >
                  Add
                </button>
              </div>
              {codeError && (
                <p className="menu__code-error" role="status">
                  That code is not 11 characters — check it and try again.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="grow" />
      <div className="menu__foot">
        <button className="menu__footlink" onClick={() => { sfx.ui(); openHowTo(); }}>
          How to play
        </button>
        <button className="menu__footlink" onClick={() => { sfx.ui(); openOptions(); }}>
          Options
        </button>
        <button className="menu__footlink" onClick={() => { sfx.ui(); setCatteryOpen(true); }} disabled={!profile}>
          The cattery
        </button>
        <span className="menu__version">KITTEN HILL · v1.0</span>
      </div>
          {backupOpen && <BackupSheet onClose={() => setBackupOpen(false)} />}
      {catteryOpen && <Cattery mode="solo" onClose={() => setCatteryOpen(false)} />}
      {askNew && (
        <StartOverDialog
          onKeep={() => setAskNew(false)}
          onStart={() => {
            setAskNew(false);
            sit();
          }}
        />
      )}
</div>
  );
}

/** Whoever is closest to you, so the line says whose wins those are. */
function bestRivalName(
  seats: { name: string }[],
  mySeat: number,
  wins: number[],
): string {
  let best = -1;
  let most = -Infinity;
  wins.forEach((w, i) => {
    if (i !== mySeat && w > most) {
      most = w;
      best = i;
    }
  });
  return best >= 0 ? (seats[best]?.name ?? '') : '';
}

/**
 * Starting a new match while one is saved throws the saved hand away, and the
 * resume card two rows up is not a warning. Its own component: useDialog reads
 * its node once, on mount.
 */
function StartOverDialog({ onKeep, onStart }: { onKeep: () => void; onStart: () => void }) {
  const ref = useDialog(onKeep);
  return (
    <div
      className="modal-scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onKeep();
      }}
    >
      <div className="card leave" ref={ref} role="dialog" aria-modal="true" aria-label="Start a new match?">
        <h2 className="card-label">Start a new match</h2>
        <p className="leave__body">
          Your saved hand is dropped, and that cannot be undone. The cats keep their record.
        </p>
        <div className="row leave__cta">
          <button className="btn btn--primary grow" style={{ height: 44 }} onClick={onKeep}>
            Resume instead
          </button>
          <button className="btn btn--danger" style={{ height: 44 }} onClick={onStart}>
            Start new
          </button>
        </div>
      </div>
    </div>
  );
}
