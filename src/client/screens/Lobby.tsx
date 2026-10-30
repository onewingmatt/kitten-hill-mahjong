import React from 'react';
import { useStore } from '../store';
import { net } from '../net';
import { CatFace } from '../cat';
import { playStyleLabel } from '../../engine/bots/personality';
import { IconClose, IconPaw } from '../components/Icons';

/**
 * Room lobby: create a table, share the code, let bots fill the chairs, start.
 * Once the server says the hand is live the store flips the screen to the table.
 */
export function Lobby() {
  const { profile, roomCode, seats, mySeat, online, roomError, leave, target } = useStore();
  const [joinCode, setJoinCode] = React.useState('');
  const [catCode, setCatCode] = React.useState('');
  const [length, setLength] = React.useState<1 | 2 | 3>(target);

  if (!profile) {
    return (
      <div className="screen">
        <div className="card">
          <h2>Make a cat first</h2>
          <p style={{ fontSize: 12, color: 'rgba(248,240,225,.6)', margin: '6px 0 12px' }}>
            Rooms seat cats, so you need one before you can sit down.
          </p>
          <button className="btn btn--primary" onClick={() => useStore.getState().go('creator')}>
            Create your cat
          </button>
        </div>
      </div>
    );
  }

  if (!roomCode) {
    return (
      <div className="screen">
        <div className="row row--between">
          <button className="btn btn--ghost btn--sm" onClick={() => useStore.getState().go('menu')}>
            ‹ Back
          </button>
          <span className="hud__sub">Online</span>
          <span style={{ width: 54 }} />
        </div>

        <div className="card">
          <h2>Host a table</h2>
          <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(248,240,225,.6)', margin: '6px 0 10px' }}>
            You get a four-letter code. Empty chairs fill with cats when you start.
          </p>
          <div className="pills" style={{ marginBottom: 10 }}>
            {([1, 2, 3] as const).map((t) => (
              <button
                key={t}
                className={`pill ${length === t ? 'is-on' : ''}`}
                onClick={() => setLength(t)}
              >
                {t === 1 ? 'Single hand' : `First to ${t}`}
              </button>
            ))}
          </div>
          <button className="btn btn--primary" style={{ height: 46 }} onClick={() => net.create(profile, length)}>
            Create room
          </button>
        </div>

        <div className="card">
          <h2>Join with a code</h2>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <input
              className="input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="CODE"
              spellCheck={false}
              autoComplete="off"
              aria-label="Room code"
              style={{ letterSpacing: '.3em', textAlign: 'center', fontSize: 17, height: 44 }}
            />
            <button
              className="btn btn--ghost"
              style={{ height: 44 }}
              onClick={() => joinCode.length === 4 && net.join(joinCode, profile)}
            >
              Join
            </button>
          </div>
        </div>

        {roomError && (
          <p style={{ color: 'var(--coral)', fontSize: 11.5, textAlign: 'center', margin: 0 }}>{roomError}</p>
        )}

        <div className="grow" />
        <p style={{ textAlign: 'center', fontSize: 10, color: 'rgba(248,240,225,.66)', margin: 0 }}>
          {online === 'connected' ? 'connected' : online === 'offline' ? 'reconnecting…' : 'tap create or join'}
        </p>
      </div>
    );
  }

  const host = mySeat === 0;

  return (
    <div className="screen">
      <div className="row row--between">
        <button className="btn btn--ghost btn--sm" onClick={leave}>
          <IconClose size={14} /> Leave
        </button>
        <span className="hud__sub">Table {roomCode}</span>
        <span style={{ width: 54 }} />
      </div>

      <div className="lobby__code">
        <span className="lobby__label">share this code</span>
        <div className="lobby__letters">
          {roomCode.split('').map((c, i) => (
            <span key={i} className="lobby__letter">{c}</span>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Seats</h2>
        <div className="lobby__seats">
          {seats.map((s, i) => {
            const empty = !s || s.tag === 'open';
            return (
              <div key={i} className={`lobby__seat ${i === mySeat ? 'is-you' : ''} ${empty ? 'is-empty' : ''}`}>
                <div className="lobby__badge">
                  {empty ? <span style={{ opacity: 0.3 }}>·</span> : <CatFace cat={s.cat} />}
                </div>
                <div className="grow">
                  <div className="lobby__name">{empty ? 'Open chair' : s.name}</div>
                  <div className="lobby__tag">
                    {i === mySeat ? 'you' : empty ? 'will be filled by a cat' : s.tag === 'bot' ? 'bot' : s.tag}
                  </div>
                </div>
                {!empty && s.tag === 'bot' && <IconPaw size={15} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>Fill a chair</h2>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="btn btn--ghost grow" onClick={() => net.addBot()}>
            Add a bot
          </button>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input
            className="input"
            value={catCode}
            onChange={(e) => setCatCode(e.target.value.toUpperCase())}
            placeholder="CAT CODE"
            spellCheck={false}
            autoComplete="off"
            aria-label="Cat code to seat"
          />
          <button
            className="btn btn--ghost"
            onClick={() => {
              if (catCode.trim()) {
                net.addCat(catCode.trim());
                setCatCode('');
              }
            }}
          >
            Seat
          </button>
        </div>
      </div>

      {roomError && (
        <p style={{ color: 'var(--coral)', fontSize: 11.5, textAlign: 'center', margin: 0 }}>{roomError}</p>
      )}

      <div className="grow" />
      <button
        className="btn btn--primary"
        style={{ height: 50, fontSize: 15.5 }}
        onClick={() => net.start()}
        disabled={!host && seats.filter((s) => s && s.tag !== 'open').length < 4}
      >
        {host ? 'Start the hand' : 'Waiting for the host'}
      </button>
      <p style={{ textAlign: 'center', fontSize: 10, color: 'rgba(248,240,225,.66)', margin: '6px 0 0' }}>
        {seats.filter((s) => s && s.tag !== 'open').length} of 4 seated
      </p>
    </div>
  );
}
