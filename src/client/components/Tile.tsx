import React from 'react';
import { kind, spriteUrl } from '../../engine/tiles';
import type { Meld } from '../../engine/types';

interface TileProps {
  k: number;
  /** Extra class names. */
  className?: string;
  style?: React.CSSProperties;
  raised?: boolean;
  drawn?: boolean;
  staticSize?: boolean;
  dim?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  title?: string;
}

/** A single face-up tile. The pack art is a finished tile, so it needs no frame. */
export function Tile({ k, className = '', style, raised, drawn, staticSize, dim, onClick, onPointerDown, title }: TileProps) {
  const def = kind(k);
  const cls = [
    'tile',
    raised ? 'tile--raised' : '',
    drawn ? 'tile--drawn' : '',
    staticSize ? 'tile--static' : '',
    dim ? 'tile--dim' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const img = <img src={spriteUrl(k)} alt={def.label} draggable={false} loading="eager" decoding="async" />;
  if (onClick || onPointerDown) {
    return (
      <button
        type="button"
        className={cls}
        style={style}
        onClick={onClick}
        onPointerDown={onPointerDown}
        title={title ?? def.label}
        aria-label={def.label}
      >
        {img}
      </button>
    );
  }
  return (
    <div className={cls} style={style} title={title ?? def.label} role="img" aria-label={def.label}>
      {img}
    </div>
  );
}

export function TileBack({ className = '' }: { className?: string }) {
  return <div className={`tile tile--back ${className}`} aria-hidden="true" />;
}

/** Called melds, drawn smaller than the hand. */
export function Melds({ melds }: { melds: Meld[] }) {
  if (!melds.length) return null;
  return (
    <div className="melds">
      {melds.map((m, i) => (
        <div key={`${m.k}-${i}`} className={`meld ${m.type === 'kong' ? 'meld--kong' : ''}`}>
          {m.tiles.map((t, j) => (
            <Tile key={j} k={t} staticSize className={m.concealed ? 'is-concealed' : ''} />
          ))}
          {m.type === 'kong' && <span className="meld__flag">kong</span>}
        </div>
      ))}
    </div>
  );
}

export function Flowers({ flowers }: { flowers: number[] }) {
  if (!flowers.length) return null;
  return (
    <div className="flowers" aria-label={`${flowers.length} bonus tiles`}>
      {flowers.map((f, i) => (
        <Tile key={i} k={f} staticSize />
      ))}
    </div>
  );
}
