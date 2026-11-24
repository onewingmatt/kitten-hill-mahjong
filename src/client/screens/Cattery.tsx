import React from 'react';
import { IconClose } from '../components/Icons';
import { useDialog } from '../useDialog';
import { useStore } from '../store';
import { sfx } from '../audio';
import { listPool, poolCatCode, poolCatLabel, publishCat, publishedCode, unpublishCat, type PoolCat } from '../pool';
import { encodePersonality } from '../../engine/bots/personality';

/**
 * The cattery: the player cats anyone can sit down against.
 *
 * Solo it sets the rival cat across the table; in a room it fills an empty seat.
 * Publishing is explicit and reversible, and the panel says exactly what is
 * shared — the name, the cat and the play style, never the record.
 */
export function Cattery({ mode, onClose }: { mode: 'solo' | 'room'; onClose: () => void }) {
  const dialog = useDialog(onClose);
  const profile = useStore((s) => s.profile);
  const addRival = useStore((s) => s.addRival);
  const [cats, setCats] = React.useState<PoolCat[] | null>(null);
  const [published, setPublished] = React.useState<boolean>(() => publishedCode() !== null);
  const [status, setStatus] = React.useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    void listPool(12).then(setCats);
  }, []);

  React.useEffect(load, [load]);

  const togglePublish = async () => {
    if (!profile) return;
    setBusy(true);
    setStatus(null);
    try {
      if (published) {
        const res = await unpublishCat();
        if (!res.ok) setStatus({ tone: 'bad', text: res.why ?? 'Could not take the cat down.' });
        else {
          setPublished(false);
          setStatus({ tone: 'ok', text: 'Taken down. Nobody new will meet this cat.' });
          load();
        }
      } else {
        const res = await publishCat(profile);
        if (!res.ok) setStatus({ tone: 'bad', text: res.why ?? 'Could not publish the cat.' });
        else {
          setPublished(true);
          setStatus({ tone: 'ok', text: 'Published. Other tables can now sit down against it.' });
          load();
        }
      }
      sfx.ui();
    } finally {
      setBusy(false);
    }
  };

  const take = async (c: PoolCat) => {
    const code = poolCatCode(c);
    if (mode === 'solo') {
      const ok = addRival(code, c.name);
      setStatus(ok ? { tone: 'ok', text: `${c.name} takes the far seat.` } : { tone: 'bad', text: 'That cat would not decode.' });
      if (ok) sfx.claim();
    } else {
      const { net } = await import('../net');
      net.addCat(code, c.name);
      sfx.claim();
      onClose();
    }
  };

  const mine = profile ? encodePersonality(profile.personality) : null;

  return (
    <div className="modal-scrim" onClick={onClose} role="presentation">
      <div
        className="card cattery"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="The cattery"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row row--between">
          <div>
            <h2 className="cattery__title">The cattery</h2>
            <span className="cattery__sub">Player cats, measured at their own tables</span>
          </div>
          <button className="icon-btn" aria-label="Close the cattery" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        {profile && (
          <div className="cattery__mine">
            <div className="cattery__mine-copy">
              <b>{profile.name}</b>
              <span>{published ? 'Published — other tables can meet this cat' : 'Private — nobody meets this cat'}</span>
              <span className="cattery__code">Your cat code {mine}</span>
            </div>
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={togglePublish} aria-pressed={published}>
              {published ? 'Take it down' : 'Publish'}
            </button>
          </div>
        )}

        {status && <p className={`cattery__status is-${status.tone}`}>{status.text}</p>}

        <div className="cattery__list" role="list">
          {cats === null && <p className="cattery__empty">Fetching cats…</p>}
          {cats?.length === 0 && (
            <p className="cattery__empty">
              No cats in the cattery yet. Publish yours and it will be the first one here.
            </p>
          )}
          {cats?.map((c) => (
            <div className="cattery__row" role="listitem" key={c.id}>
              <div className="cattery__who">
                <b>{c.name}</b>
                <span>{poolCatLabel(c)}</span>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => take(c)}>
                {mode === 'solo' ? 'Face this cat' : 'Seat this cat'}
              </button>
            </div>
          ))}
        </div>

        <p className="cattery__note">
          Publishing shares the cat's name, its art and the play style the table measured. Never your
          record, your win count or your backup code.
        </p>
      </div>
    </div>
  );
}
