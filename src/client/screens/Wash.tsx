import React from 'react';
import { CatPaw } from '../cat';
import type { SeatMeta } from '../store';

const SLOTS = 28;
const BEAT_MS = 620;
const MOVE_MS = 560;
/** share of the heap that joins each beat — the rest hold their spot */
const ACTIVE = 0.8;
const FAT_PX = 60;

type Slot = { x: number; y: number; rot: number; z: number };

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Sunflower (golden-angle) placement: even density with no lattice lines, which is what
 * makes a heap read as scattered rather than as a grid of cards.
 */
function buildSlots(n: number): Slot[] {
  const rand = lcg(0x6b1d);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const ranks = Array.from({ length: n }, (_, i) => i);
  for (let i = ranks.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
  }
  return Array.from({ length: n }).map((_, i) => {
    const r = Math.sqrt((i + 0.5) / n);
    const a = i * golden;
    return {
      x: Math.cos(a) * r * 120 + (rand() - 0.5) * 8,
      y: Math.sin(a) * r * 86 + (rand() - 0.5) * 6,
      rot: (rand() - 0.5) * FAT_PX,
      // a unique depth per slot, so any overlapping pair has a settled stacking order
      z: ranks[i],
    };
  });
}

const gapBetween = (a: Slot, b: Slot) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The wash: every cat at the table pushes the tiles into one heap before the deal.
 *
 * Tiles change places rather than jitter. Each beat pairs up most of the heap and swaps
 * their slots, so the pile physically re-forms; pairs are chosen between neighbours so no
 * tile travels across the whole heap, and a moving tile lifts (scale, shadow, raised
 * z-index) so it passes over the others instead of sliding through them.
 */
export function Wash({ seats }: { seats: SeatMeta[] }) {
  const slots = React.useMemo(() => buildSlots(SLOTS), []);
  const assignRef = React.useRef<number[]>(slots.map((_, i) => i));
  const [assign, setAssign] = React.useState<number[]>(assignRef.current);
  const [moving, setMoving] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__khmWash = { assign, moving, slots };
    }
  }, [assign, moving, slots]);

  React.useEffect(() => {
    const timers: number[] = [];

    const beat = () => {
      const current = assignRef.current;
      const pool = current.map((_, t) => t).filter(() => Math.random() < ACTIVE);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      const next = current.slice();
      const paired: number[] = [];
      const used = new Set<number>();

      for (const a of pool) {
        if (used.has(a)) continue;
        let best = -1;
        let bestGap = Infinity;
        for (const b of pool) {
          if (b === a || used.has(b)) continue;
          const d = gapBetween(slots[current[a]], slots[current[b]]);
          if (d < bestGap) {
            bestGap = d;
            best = b;
          }
        }
        if (best < 0) continue;
        used.add(a);
        used.add(best);
        // the swap: each takes the other's slot, so the heap re-forms without duplicates
        [next[a], next[best]] = [next[best], next[a]];
        paired.push(a, best);
      }

      if (!paired.length) return;
      assignRef.current = next;
      setAssign(next);
      setMoving(paired);
      timers.push(window.setTimeout(() => setMoving([]), MOVE_MS));
    };

    beat();
    const id = window.setInterval(beat, BEAT_MS);
    return () => {
      window.clearInterval(id);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [slots]);

  return (
    <div className="wash" aria-hidden="true">
      <div className="wash__pile">
        {assign.map((slotIndex, tile) => {
          const slot = slots[slotIndex];
          const isMoving = moving.includes(tile);
          return (
            <div
              key={tile}
              className="wash__slot"
              data-slot={slotIndex}
              data-moving={isMoving ? '1' : '0'}
              style={{
                transform: `translate3d(${slot.x}px, ${slot.y}px, 0)`,
                zIndex: isMoving ? 900 + tile : slot.z,
                transition: `transform ${MOVE_MS}ms cubic-bezier(0.34, 0.02, 0.24, 1)`,
              }}
            >
              <div
                className={`wash__card ${isMoving ? 'is-moving' : ''}`}
                style={{ transform: `rotate(${slot.rot}deg)` }}
              />
            </div>
          );
        })}
      </div>

      {[0, 1, 2, 3].map((seat) => (
        <div key={seat} className={`wash__paw wash__paw--${seat}`}>
          <CatPaw cat={seats[seat]?.cat} pose="rest" />
        </div>
      ))}
    </div>
  );
}
