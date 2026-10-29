import React from 'react';
import { useStore } from '../store';
import { CatFace, defaultCat } from '../cat';
import { IconClose } from '../components/Icons';
import { encodePersonality, playStyleLabel } from '../../engine/bots/personality';
import { personalityFromStats } from '../stats';
import { BackupSheet } from './BackupSheet';
import { sfx } from '../audio';
import { IconMute, IconSound } from '../components/Icons';

export function Menu() {
  const { profile, target, startMatch, go, muted, toggleMute, boot, rival, addRival, clearRival, stats } = useStore();
  const [choice, setChoice] = React.useState<1 | 2 | 3>(target);
  const [copied, setCopied] = React.useState(false);
  const [backupOpen, setBackupOpen] = React.useState(false);
  const [codeInput, setCodeInput] = React.useState('');
  const [codeError, setCodeError] = React.useState(false);
  const [nameInput, setNameInput] = React.useState('');

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
    <div className="screen">
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
            <div style={{ fontSize: 11, color: 'rgba(248,240,225,.6)', marginTop: 3 }}>
              {profile ? playStyleLabel(personality) : 'Create a cat to sit down'}
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={() => go('creator')}>
            {profile ? 'Edit' : 'Create'}
          </button>
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
        <p style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.55, color: 'rgba(248,240,225,.6)' }}>
          Chinese Classical. 144 tiles, 13 in hand, flowers set aside for bonus points. Three cats join
          you, each with its own appetite for risk.
        </p>
      </div>

      <button
        className="btn btn--primary"
        style={{ height: 52, fontSize: 16, marginTop: 2 }}
        onClick={sit}
        disabled={!profile}
      >
        {profile ? 'Sit down' : 'Create your cat first'}
      </button>

      <button
        className="btn btn--ghost"
        style={{ height: 44 }}
        onClick={() => { sfx.ui(); useStore.getState().enterLobby(); }}
        disabled={!profile}
      >
        Play online · rooms
      </button>

      <div className="card">
        <h2>Face a cat</h2>
        {rival ? (
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
        ) : (
          <>
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
                className="btn btn--ghost btn--sm"
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
            <p style={{ margin: '8px 0 0', fontSize: 11, lineHeight: 1.5, color: codeError ? 'var(--coral)' : 'rgba(248,240,225,.55)' }}>
              {codeError
                ? 'That code is not 11 characters — check it and try again.'
                : 'Paste a friend’s cat code and their cat sits at your table, playing the way they do.'}
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2>How you win</h2>
        <div className="hint">
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold)' }}>東</span>
          <span>
            Four sets and a pair. Any completed hand wins — doubles like a flush, a dragon pung or your
            own wind multiply the payout, and the counter under your hand tracks what it's worth.
          </span>
        </div>
      </div>

      <div className="grow" />
      <div className="menu__foot">KITTEN HILL · v1.0</div>
          {backupOpen && <BackupSheet onClose={() => setBackupOpen(false)} />}
</div>
  );
}
