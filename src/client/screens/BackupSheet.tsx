import React from 'react';
import { IconClose } from '../components/Icons';
import { useDialog } from '../useDialog';
import { backupNow, restoreFrom, syncCode } from '../sync';
import { sfx } from '../audio';

/**
 * The cat and the measured play style live in this browser's storage, which is
 * not durable. A five-letter code puts them somewhere that is.
 */
export function BackupSheet({ onClose }: { onClose: () => void }) {
  const dialog = useDialog(onClose);
  const [code, setCode] = React.useState<string | null>(() => syncCode());
  const [typed, setTyped] = React.useState('');
  const [status, setStatus] = React.useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const fresh = await backupNow();
      setCode(fresh);
      setStatus({ tone: 'ok', text: 'Saved. Type this code on any device to bring your cat over.' });
      sfx.ui();
    } catch (err) {
      setStatus({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await restoreFrom(typed);
      sfx.win();
      onClose();
    } catch (err) {
      setStatus({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not restore.' });
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose} role="presentation">
      <div
        className="card backup"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Carry your cat to another device"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row row--between">
          <div>
            <h2 className="backup__title">Carry your cat</h2>
            <span className="backup__sub">Your cat lives in this browser only</span>
          </div>
          <button className="icon-btn" aria-label="Close the backup panel" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <p className="backup__blurb">
          A code saves the cat and everything it has learned about how you play. Type it on another
          phone and it is yours there too. It also outlives a cleared browser.
        </p>

        {code ? (
          <div className="backup__code">
            <span className="backup__code-value">{code}</span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                void navigator.clipboard?.writeText(code);
                setStatus({ tone: 'ok', text: 'Code copied.' });
                sfx.ui();
              }}
            >
              Copy
            </button>
          </div>
        ) : (
          <button className="btn btn--gold" disabled={busy} onClick={save}>
            Create a backup code
          </button>
        )}

        {code && (
          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Refresh the save'}
          </button>
        )}
        {code && <p className="backup__note">Updates itself after every hand.</p>}

        <div className="backup__split" />

        <label className="backup__label" htmlFor="restore-code">
          Have a code?
        </label>
        <div className="row" style={{ gap: 8 }}>
          <input
            id="restore-code"
            className="backup__input"
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
            placeholder="ABCDE"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn btn--ghost btn--sm" disabled={busy || typed.length < 4} onClick={restore}>
            Restore
          </button>
        </div>

        {status && <p className={`backup__status is-${status.tone}`}>{status.text}</p>}
      </div>
    </div>
  );
}
