import React from 'react';

/** Everything a player can customise about their cat. */
export interface CatAppearance {
  /** Base fur colour. */
  fur: string;
  /** Secondary colour used by the pattern. */
  patternColor: string;
  pattern: PatternId;
  /** Eye iris colour. */
  eyes: string;
  eyeStyle: EyeStyle;
  /** Overall scale, 0.85 - 1.15. */
  size: number;
  /** Chonk, 0.7 (slim) - 1.3 (round). */
  weight: number;
  /** Ear size, 0.8 - 1.2. */
  earSize: number;
  /** Collar colour, or null for bare. */
  collar: string | null;
  /** Accessory id. */
  accessory: AccessoryId;
  /** Hair length, drawn in the pattern colour. */
  hair: HairId;
  /** Stable seed for patch placement. */
  seed: number;
}

export type PatternId = 'solid' | 'tabby' | 'tuxedo' | 'calico' | 'bicolour' | 'pointed' | 'spots';
export type EyeStyle = 'round' | 'almond' | 'sleepy' | 'wide';
export type AccessoryId = 'none' | 'ribbon' | 'scarf' | 'flower' | 'crown';
export type HairId = 'none' | 'short' | 'medium' | 'long';

export const FUR_COLORS = [
  '#f4e3cf', '#e8c9a0', '#c99a6b', '#a3743f', '#6f4a2f', '#3e3a38',
  '#8c8f95', '#cfd3d8', '#fbfaf7', '#e9a06a', '#d97b5a', '#7d5b8c',
  '#5f7f6a', '#2f4a5c', '#c2403f', '#e0b64a',
];

export const PATTERN_COLORS = [
  '#2f2a28', '#5b4636', '#8a5a3b', '#d9b98f', '#f7f2e8', '#b8422f',
  '#5c6b73', '#3d5a4a', '#8a4f7d', '#d98b3a',
];

export const EYE_COLORS = ['#7bc96f', '#e0b64a', '#67c6e3', '#9b6bd6', '#d98b3a', '#4a5560', '#e0596b'];

export const PATTERNS: { id: PatternId; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'tabby', label: 'Tabby' },
  { id: 'tuxedo', label: 'Tuxedo' },
  { id: 'calico', label: 'Calico' },
  { id: 'bicolour', label: 'Bicolour' },
  { id: 'pointed', label: 'Pointed' },
  { id: 'spots', label: 'Spotted' },
];

export const EYE_STYLES: { id: EyeStyle; label: string }[] = [
  { id: 'round', label: 'Round' },
  { id: 'almond', label: 'Almond' },
  { id: 'sleepy', label: 'Sleepy' },
  { id: 'wide', label: 'Wide' },
];

export const COLLARS = [null, '#c2403f', '#2f8f7f', '#e0b64a', '#8a4f7d', '#2f4a5c'];
export const ACCESSORIES: { id: AccessoryId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'ribbon', label: 'Ribbon' },
  { id: 'scarf', label: 'Scarf' },
  { id: 'flower', label: 'Flower' },
  { id: 'crown', label: 'Crown' },
];

export const HAIRS: { id: HairId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'short', label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'long', label: 'Long' },
];

export function defaultCat(seed = 1): CatAppearance {
  return {
    fur: '#e8c9a0',
    patternColor: '#5b4636',
    pattern: 'tabby',
    eyes: '#7bc96f',
    eyeStyle: 'round',
    size: 1,
    weight: 1,
    earSize: 1,
    collar: '#2f8f7f',
    accessory: 'none',
    hair: 'none',
    seed,
  };
}

function hash(n: number): number {
  let x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function darken(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.min(255, (n & 255) * (1 - amount)));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function lighten(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = ((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * amount;
  const g = ((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amount;
  const b = (n & 255) + (255 - (n & 255)) * amount;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

interface FaceProps {
  cat: CatAppearance;
  /** Adds a blink animation when true (disabled by reduced-motion CSS). */
  live?: boolean;
  className?: string;
  /** Where the cat is looking, -1..1 horizontally. */
  look?: number;
}

/**
 * A cat portrait drawn entirely from parts: base colour, pattern, eye style,
 * chonk and size all come from the appearance. Used at 100% in the creator and
 * scaled down for the seat badge, so it stays crisp everywhere.
 */
export function CatFace({ cat, live = true, className, look = 0 }: FaceProps) {
  const id = React.useId().replace(/[:]/g, '');
  const w = cat.weight;
  const rx = 38 * (0.94 + 0.09 * w);
  const ry = 34 * (0.96 + 0.06 * w);
  const cheek = 1 + (w - 1) * 0.9;
  const inner = darken(cat.fur, 0.06);
  const dark = cat.patternColor;

  const hair = cat.hair ?? 'none';
  /**
   * Fixed lightening amounts turn black fur into grey fur: a 22% highlight put
   * the lit side of a #2f2a27 skull at rgb(93,89,86), and the 42% muzzle patch
   * painted a pale grey mask across the lower face. Scale every lift by the
   * coat's own luminance instead, so dark cats stay black and light cats are
   * untouched.
   */
  const furLum = (() => {
    const hex = cat.fur.replace('#', '');
    if (hex.length !== 6) return 0.5;
    const n = parseInt(hex, 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  })();
  const coatLift = Math.min(1, Math.max(0.3, furLum / 0.45));
  const furHighlight = 0.22 * coatLift;
  /** A black cat's muzzle is a shade lighter than its fur, not a grey mask. */
  const muzzle =
    cat.pattern === 'tuxedo' || cat.pattern === 'bicolour' ? '#fbf7ef' : lighten(cat.fur, 0.42 * coatLift);
  /** Fur length, not a wig: fluff is drawn in the coat's own colours. */
  const fluffFill = lighten(cat.fur, 0.13);
  const fluffStroke = darken(cat.fur, 0.24);
  /** A wide, dark pass under the outline reads as the layer's own shadow. */
  const fluffShade = darken(cat.fur, 0.3);
  /** Half-width of the head ellipse at a given y, so fur can hug the silhouette. */
  const headEdge = (y: number) => {
    const t = Math.min(0.998, Math.max(-0.998, (y - 66) / ry));
    return rx * Math.sqrt(1 - t * t);
  };
  /**
   * A run of pointed fur tufts along one side of the head. Returns the closed
   * path (for the fill) and the open spike chain (for the stroke), because the
   * closing chord would otherwise draw a line across the face.
   */
  const cheekFur = (side: number, from: number, to: number, count: number, len: number) => {
    // the two sides get their own jitter and a slightly different span: a mirrored
    // pair of identical clumps is the difference between fur and machined fins
    const salt = side > 0 ? 17 : 0;
    const lift = side > 0 ? 1.4 : 0;
    const step = (to - from) / count;
    let d = '';
    for (let i = 0; i < count; i++) {
      const y0 = from + step * i + lift;
      const y1 = y0 + step;
      const ym = y0 + step * 0.5;
      const li = len * (0.6 + (0.55 * i) / Math.max(1, count - 1)) * (0.8 + 0.4 * hash(cat.seed + salt + i * 11));
      const x0 = 60 + side * headEdge(y0);
      const x1 = 60 + side * headEdge(y1);
      const xm = 60 + side * (headEdge(ym) + li);
      // rounded clumps, not sawteeth: a straight spike reads as a costume horn
      d += `${i === 0 ? `M ${x0} ${y0}` : ''} Q ${x0 + side * li * 1.35} ${y0 + step * 0.12} ${xm} ${ym}`;
      d += ` Q ${x1 + side * li * 1.3} ${y1 - step * 0.12} ${x1} ${y1}`;
    }
    return { fill: `${d} Z`, line: d };
  };
  /**
   * A ruff of fur around the neck, fanned from a point on the chest. The fan is
   * wide enough to escape the collar on both sides, so the clumps read as fur
   * around the band whether or not the cat is wearing one.
   */
  const ruffFur = (radius: number, count: number, len: number, spread: number) => {
    const pt = (i: number, r: number) => {
      const a = ((-1 + (2 * i) / count) * spread * Math.PI) / 180;
      return [60 + Math.sin(a) * r, 94 + Math.cos(a) * r];
    };
    let d = '';
    for (let i = 0; i < count; i++) {
      const [ax, ay] = pt(i, radius * (0.94 + 0.12 * hash(cat.seed + i * 5)));
      const [bx, by] = pt(i + 1, radius * (0.94 + 0.12 * hash(cat.seed + i * 5 + 3)));
      const [mx, my] = pt(i + 0.5, (radius + len) * (0.9 + 0.2 * hash(cat.seed + i * 7)));
      d += `${i === 0 ? `M ${ax} ${ay}` : ''} Q ${(ax + mx) / 2} ${(ay + my) / 2} ${mx} ${my}`;
      d += ` Q ${(bx + mx) / 2} ${(by + my) / 2} ${bx} ${by}`;
    }
    return { fill: `${d} Z`, line: d };
  };
  /**
   * Clumps breaking the crown between the ears. Without this a longhaired cat
   * still wears a shorthair's perfect ellipse of a skull.
   */
  const crownFur = (count: number, len: number, spread: number) => {
    const pt = (i: number, grow: number) => {
      const a = ((-1 + (2 * i) / count) * spread * Math.PI) / 180;
      return [60 + Math.sin(a) * (rx + grow), 66 - Math.cos(a) * (ry + grow)] as [number, number];
    };
    let d = '';
    for (let i = 0; i < count; i++) {
      const [ax, ay] = pt(i, 0);
      const [bx, by] = pt(i + 1, 0);
      const [mx, my] = pt(i + 0.5, len * (0.7 + 0.6 * hash(cat.seed + i * 9)));
      d += `${i === 0 ? `M ${ax} ${ay}` : ''} Q ${(ax + mx) / 2} ${(ay + my) / 2} ${mx} ${my}`;
      d += ` Q ${(bx + mx) / 2} ${(by + my) / 2} ${bx} ${by}`;
    }
    return { fill: `${d} Z`, line: d };
  };
  /**
   * Tuft length scales with the coat: a sleek short coat still shows some.
   * `whisker` is the reach left clear of the fur; `crown` is [clumps, length].
   */
  const COATS = {
    short: { from: 63, to: 85, count: 2, len: 2.6, ear: 0.35, ruff: null, crown: null, whisker: 13 },
    medium: { from: 58, to: 92, count: 3, len: 5.5, ear: 0.85, ruff: [29, 7, 6.5, 90], crown: null, whisker: 11 },
    long: { from: 60, to: 94, count: 4, len: 8, ear: 1.4, ruff: [31, 9, 9, 92], crown: [3, 3.9], whisker: 9 },
  } as const;
  const coat = hair === 'none' ? null : COATS[hair];
  /** Every clump is built once: it drives the fills, the strokes and the pattern clip. */
  const clumps = coat
    ? {
        crown: coat.crown ? crownFur(coat.crown[0], coat.crown[1], 13) : null,
        cheeks: [-1, 1].map((side) => cheekFur(side, coat.from, coat.to, coat.count, coat.len)),
        ruff: coat.ruff ? ruffFur(coat.ruff[0], coat.ruff[1], coat.ruff[2], coat.ruff[3]) : null,
      }
    : null;


  const patch = (n: number) => ({
    cx: 30 + hash(cat.seed + n) * 60,
    cy: 48 + hash(cat.seed + n * 7) * 46,
    r: 12 + hash(cat.seed + n * 3) * 10,
  });

  const eyeRx = cat.eyeStyle === 'wide' ? 8.2 : cat.eyeStyle === 'almond' ? 7.4 : 7;
  const eyeRy = cat.eyeStyle === 'sleepy' ? 3.4 : cat.eyeStyle === 'wide' ? 9.4 : cat.eyeStyle === 'almond' ? 6.2 : 7.6;

  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={`${cat.pattern} cat portrait`}>
      <defs>
        <clipPath id={`head-${id}`}>
          <ellipse cx="60" cy="66" rx={rx} ry={ry} />
        </clipPath>
        <radialGradient id={`fur-${id}`} cx="42%" cy="34%" r="72%">
          <stop offset="0%" stopColor={lighten(cat.fur, furHighlight)} />
          <stop offset="62%" stopColor={cat.fur} />
          <stop offset="100%" stopColor={darken(cat.fur, 0.16)} />
        </radialGradient>
        <radialGradient id={`eye-${id}`} cx="45%" cy="35%" r="70%">
          <stop offset="0%" stopColor={lighten(cat.eyes, 0.45)} />
          <stop offset="70%" stopColor={cat.eyes} />
          <stop offset="100%" stopColor={darken(cat.eyes, 0.3)} />
        </radialGradient>
      </defs>

      {/* shoulders: without a body the head floats and every neckwear reads as
          a strap across the chin */}
      <path
        d="M 17 120 Q 21 100 42 96.5 Q 60 110 78 96.5 Q 99 100 103 120 Z"
        fill={`url(#fur-${id})`}
        stroke={darken(cat.fur, 0.22)}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />

      {/* ears */}
      <g>
        <path
          d={`M ${60 - rx * 0.82} ${40} L ${60 - rx * 0.66} ${22 - 6 * cat.earSize} L ${60 - rx * 0.2} ${34} Z`}
          fill={`url(#fur-${id})`}
          stroke={darken(cat.fur, 0.22)}
          strokeWidth="1.1"
        />
        <path
          d={`M ${60 + rx * 0.82} ${40} L ${60 + rx * 0.66} ${22 - 6 * cat.earSize} L ${60 + rx * 0.2} ${34} Z`}
          fill={`url(#fur-${id})`}
          stroke={darken(cat.fur, 0.22)}
          strokeWidth="1.1"
        />
        <path d={`M ${60 - rx * 0.74} ${37} L ${60 - rx * 0.64} ${26} L ${60 - rx * 0.34} ${35} Z`} fill={inner} opacity="0.9" />
        <path d={`M ${60 + rx * 0.74} ${37} L ${60 + rx * 0.64} ${26} L ${60 + rx * 0.34} ${35} Z`} fill={inner} opacity="0.9" />
        {/* ear tufts: the giveaway of a longer coat, growing off each apex */}
        {coat &&
          [-1, 1].map((side) => {
            const tip = { x: 60 + side * rx * 0.66, y: 22 - 6 * cat.earSize };
            const k = coat.ear;
            return (
              <path
                key={`tuft-${side}`}
                d={`M ${tip.x - side * 6.5} ${tip.y + 11}
                   Q ${tip.x - side * 6} ${tip.y - 4 * k} ${tip.x - side * 3.2} ${tip.y - 8.5 * k}
                   Q ${tip.x - side * 1.9} ${tip.y - 3 * k} ${tip.x - side * 0.4} ${tip.y - 10.5 * k}
                   Q ${tip.x + side * 1.9} ${tip.y - 4 * k} ${tip.x + side * 3.2} ${tip.y - 8 * k}
                   Q ${tip.x + side * 6.2} ${tip.y - 2 * k} ${tip.x + side * 7.2} ${tip.y + 11} Z`}
                fill={`url(#fur-${id})`}
                stroke={fluffStroke}
                strokeWidth="0.85"
                strokeLinejoin="round"
              />
            );
          })}
      </g>

      {/* head */}
      <ellipse cx="60" cy="66" rx={rx} ry={ry} fill={`url(#fur-${id})`} stroke={darken(cat.fur, 0.2)} strokeWidth="1.2" />

      {/* cheek fluff: a hint of fur past the silhouette, not a pair of lumps */}
      <path
        d={`M ${60 - rx + 5} ${67} q ${-6.5 * cheek} ${5 * cheek} 0.5 ${12.5 * cheek} q ${1.8 * cheek} -6 -0.5 -${12.5 * cheek} z`}
        fill={`url(#fur-${id})`}
      />
      <path
        d={`M ${60 + rx - 5} ${67} q ${6.5 * cheek} ${5 * cheek} -0.5 ${12.5 * cheek} q ${-1.8 * cheek} -6 0.5 -${12.5 * cheek} z`}
        fill={`url(#fur-${id})`}
      />

      {/* a longer coat breaks the crown between the ears */}
      {clumps?.crown && (
        <g>
          <path d={clumps.crown.fill} fill={fluffFill} />
          <path
            d={clumps.crown.line}
            fill="none"
            stroke={fluffStroke}
            strokeWidth="1"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* pattern */}
      <g clipPath={`url(#head-${id})`}>
        {cat.pattern === 'tabby' && (
          <g stroke={dark} strokeWidth="3.4" strokeLinecap="round" fill="none" opacity="0.85">
            <path d="M 52 34 l 0 10" />
            <path d="M 60 32 l 0 12" />
            <path d="M 68 34 l 0 10" />
            <path d={`M ${60 - rx - 2} 56 q 10 3 16 0`} />
            <path d={`M ${60 - rx - 2} 66 q 10 3 16 0`} />
            <path d={`M ${60 + rx + 2} 56 q -10 3 -16 0`} />
            <path d={`M ${60 + rx + 2} 66 q -10 3 -16 0`} />
          </g>
        )}
        {cat.pattern === 'tuxedo' && (
          <>
            <ellipse cx="60" cy="96" rx={rx * 0.8} ry={ry * 0.6} fill="#fbf7ef" />
            <path d="M 60 30 q 10 22 0 44 q -10 -22 0 -44 z" fill="#fbf7ef" />
          </>
        )}
        {cat.pattern === 'bicolour' && (
          <>
            <ellipse cx="60" cy="97" rx={rx * 0.85} ry={ry * 0.52} fill="#fbf7ef" />
            <ellipse cx="46" cy="60" rx="9" ry="7" fill="#fbf7ef" opacity="0.9" />
          </>
        )}
        {cat.pattern === 'calico' && (
          <>
            {[1, 2, 3].map((n) => {
              const p = patch(n);
              return <circle key={n} cx={p.cx} cy={p.cy} r={p.r} fill={n === 2 ? '#fbf7ef' : dark} opacity="0.92" />;
            })}
          </>
        )}
        {cat.pattern === 'pointed' && (
          <>
            <ellipse cx="60" cy={66 + ry * 0.52} rx={rx * 0.62} ry={ry * 0.42} fill={dark} opacity="0.85" />
            <ellipse cx={60 - rx * 0.72} cy="34" rx="11" ry="12" fill={dark} opacity="0.7" />
            <ellipse cx={60 + rx * 0.72} cy="34" rx="11" ry="12" fill={dark} opacity="0.7" />
          </>
        )}
        {cat.pattern === 'spots' && (
          <>
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const p = patch(n);
              return <circle key={n} cx={p.cx} cy={p.cy} r={3 + hash(cat.seed + n) * 2.6} fill={dark} opacity="0.8" />;
            })}
          </>
        )}
      </g>

      {/* muzzle */}
      <ellipse cx="60" cy="82" rx="17" ry="12" fill={muzzle} opacity="0.95" />

      {/* eyes */}
      <g className={live ? 'kh-blink' : undefined}>
        {[-1, 1].map((side) => (
          <g key={side}>
            <ellipse
              cx={60 + side * 15.5 + look * 2}
              cy="65"
              rx={eyeRx}
              ry={eyeRy}
              fill="#20262b"
            />
            <ellipse
              cx={60 + side * 15.5 + look * 2}
              cy="65"
              rx={eyeRx * 0.78}
              ry={eyeRy * 0.78}
              fill={`url(#eye-${id})`}
            />
            <ellipse cx={60 + side * 15.5 + look * 2} cy="65" rx={eyeRx * 0.3} ry={eyeRy * 0.62} fill="#141a1e" />
            <circle cx={60 + side * 15.5 - 2.4 + look * 2} cy="61.6" r="1.7" fill="#ffffff" opacity="0.92" />
          </g>
        ))}
      </g>

      {/* nose + mouth */}
      <path d="M 56.4 76.4 L 63.6 76.4 L 60 80.4 Z" fill="#d97b8a" />
      <path d="M 60 80.4 q -4 4.4 -7.4 1.6 M 60 80.4 q 4 4.4 7.4 1.6" fill="none" stroke="#59403a" strokeWidth="1.5" strokeLinecap="round" />

      {/* fur length: cheek tufts and a neck ruff, in the coat's own colours */}
      {clumps && (
        <g>
          {[...clumps.cheeks, clumps.ruff].map((c, i) =>
            c ? (
              <g key={i}>
                <path d={c.fill} fill={fluffFill} />
                {/* wide dark pass first: that shadow is what makes the fluff a layer */}
                <path
                  d={c.line}
                  fill="none"
                  stroke={fluffShade}
                  strokeWidth="3.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity="0.46"
                />
                <path
                  d={c.line}
                  fill="none"
                  stroke={fluffStroke}
                  strokeWidth="0.95"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            ) : null,
          )}
        </g>
      )}

      {/* whiskers: fanned, and shorter under a longer coat so they end on fur */}
      <g stroke="#5c4a42" strokeWidth="1.15" strokeLinecap="round" opacity="0.72">
        {(() => {
          const reach = coat ? coat.whisker : 14;
          const rows: [number, number][] = [
            [74, -3],
            [78.5, 0],
            [83, 3],
          ];
          return [-1, 1].map((side) => (
            <g key={side}>
              {rows.map(([y, drop]) => {
                const root = 60 + side * 15.5;
                return (
                  <path
                    key={y}
                    d={`M ${root} ${y} Q ${root + side * reach * 0.55} ${y + drop * 0.4} ${root + side * reach} ${
                      y + drop
                    }`}
                  />
                );
              })}
            </g>
          ));
        })()}
      </g>

      {/* collar: a band around the neck seam, with a tag hanging off the front */}
      {cat.collar && (
        <g>
          <path
            d={`M ${60 - rx * 0.76} 96 Q 60 114 ${60 + rx * 0.76} 96 L ${60 + rx * 0.73} 90.6 Q 60 105 ${60 - rx * 0.73} 90.6 Z`}
            fill={cat.collar}
            stroke={darken(cat.collar, 0.28)}
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
          <path
            d={`M ${60 - rx * 0.66} 95 Q 60 108 ${60 + rx * 0.66} 95`}
            fill="none"
            stroke={lighten(cat.collar, 0.42)}
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity="0.55"
          />
        </g>
      )}
      {/* brass bell on the collar: a ring over a 5x5 rounded square read as a padlock,
          so it is a dome with a rim, a slit and a clapper instead */}
      {cat.collar && cat.accessory !== 'scarf' && (
        <g>
          <circle cx="60" cy="104.6" r="1.5" fill="none" stroke="#8a6519" strokeWidth="1.2" />
          <path
            d="M 60 105.3 C 56.1 105.7 55.2 108 55 109.5 L 65 109.5 C 64.8 108 63.9 105.7 60 105.3 Z"
            fill="#e6be53"
            stroke="#7a5a17"
            strokeWidth="0.7"
            strokeLinejoin="round"
          />
          <path d="M 57.5 106.7 C 56.8 107.5 56.5 108.3 56.4 108.9" fill="none" stroke="#f8e6b0" strokeWidth="0.9" strokeLinecap="round" opacity="0.85" />
          <ellipse cx="60" cy="109.5" rx="5" ry="0.8" fill="#a87c22" stroke="#7a5a17" strokeWidth="0.5" />
          <circle cx="60" cy="110.7" r="1.25" fill="#6d4f1f" />
        </g>
      )}

      {cat.accessory === 'ribbon' && (
        <g transform="translate(60 30)">
          <path d="M -3 0 L -16 -8 L -16 8 Z" fill="#e2725b" />
          <path d="M 3 0 L 16 -8 L 16 8 Z" fill="#e2725b" />
          <circle cy="0" r="4" fill="#c95a44" />
        </g>
      )}
      {cat.accessory === 'flower' && (
        <g transform={`translate(${60 + rx * 0.6} 40)`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} rx="4.2" ry="6" fill="#f0a2b8" transform={`rotate(${a}) translate(0 -5)`} />
          ))}
          <circle r="3" fill="#f7d774" />
        </g>
      )}
      {cat.accessory === 'crown' && (
        <path d="M 46 26 L 52 14 L 60 22 L 68 14 L 74 26 Z" fill="#e0b64a" stroke="#b8902f" strokeWidth="1.2" />
      )}
      {cat.accessory === 'scarf' && (() => {
        const wool = cat.collar ?? '#c9553f';
        const warm = darken(wool, 0.24);
        const shine = lighten(wool, 0.34);
        return (
          <g>
            {/* tails first, so the wrap sits over them */}
            <g fill={warm} stroke={darken(wool, 0.42)} strokeWidth="0.7" strokeLinejoin="round">
              <path d="M 51 105 q -4 6.4 -3 9.6 q 4.4 1.3 8.6 -0.5 q -1.2 -4.4 1 -9 z" />
              <path d="M 65 105 q 4 5.6 3.4 9.2 q 4.4 1 7.6 -1.5 q -2.6 -4.4 -2.6 -8.5 z" />
            </g>
            <g stroke={darken(wool, 0.34)} strokeWidth="1.1" strokeLinecap="round">
              <path d="M 51.9 115.2 l -0.6 2.2" />
              <path d="M 54.4 115.4 l -0.3 2.4" />
              <path d="M 56.9 115.2 l -0.1 2.4" />
              <path d="M 68.5 114.6 l 0.5 2.3" />
              <path d="M 71 114.2 l 0.7 2.2" />
              <path d="M 73.4 113.6 l 0.8 2" />
            </g>
            {/* the wrap */}
            <path
              d={`M ${60 - rx * 0.82} 91 Q 60 113 ${60 + rx * 0.82} 91 L ${60 + rx * 0.78} 100.5 Q 60 119 ${60 - rx * 0.78} 100.5 Z`}
              fill={wool}
              stroke={darken(wool, 0.38)}
              strokeWidth="0.8"
              strokeLinejoin="round"
            />
            {/* knit */}
            <g fill="none" stroke={shine} strokeWidth="0.9" strokeLinecap="round" opacity="0.55">
              <path d={`M ${60 - rx * 0.6} 101.5 Q 60 114 ${60 + rx * 0.6} 101.5`} />
              <path d={`M ${60 - rx * 0.42} 106 Q 60 115.5 ${60 + rx * 0.42} 106`} strokeDasharray="1.6 3" />
            </g>
          </g>
        );
      })()}
    </svg>
  );
}

interface PawProps {
  cat: CatAppearance;
  className?: string;
  /** Raised, tapping or flat on the table. */
  pose?: 'rest' | 'raise' | 'tap' | 'slam';
  /** Left or right paw. */
  side?: 'left' | 'right';
}

/** The paw that does the work at the table. */
export function CatPaw({ cat, className, pose = 'rest', side = 'right' }: PawProps) {
  const id = React.useId().replace(/[:]/g, '');
  const pad = cat.pattern === 'tuxedo' || cat.pattern === 'bicolour' ? '#e8a3ad' : '#d98b98';
  return (
    <svg viewBox="0 0 120 120" className={`${className ?? ''} kh-paw kh-paw--${pose} kh-paw--${side}`} aria-hidden="true">
      <defs>
        <radialGradient id={`pawfur-${id}`} cx="40%" cy="30%" r="75%">
          <stop offset="0%" stopColor={lighten(cat.fur, 0.3)} />
          <stop offset="70%" stopColor={cat.fur} />
          <stop offset="100%" stopColor={darken(cat.fur, 0.14)} />
        </radialGradient>
      </defs>
      <g>
        <path
          d="M 22 96 q -6 -34 22 -50 q 20 -12 44 2 q 26 16 18 44 q -6 22 -40 22 q -38 0 -44 -18 z"
          fill={`url(#pawfur-${id})`}
          stroke={darken(cat.fur, 0.2)}
          strokeWidth="1.4"
        />
        {/* toe beans */}
        <ellipse cx="46" cy="52" rx="9" ry="11" fill={pad} opacity="0.95" />
        <ellipse cx="66" cy="46" rx="8.4" ry="10.6" fill={pad} opacity="0.95" />
        <ellipse cx="84" cy="54" rx="8" ry="10" fill={pad} opacity="0.95" />
        <ellipse cx="96" cy="68" rx="7" ry="9" fill={pad} opacity="0.9" />
        {/* main pad */}
        <path d="M 44 74 q 16 -10 34 0 q 12 8 6 20 q -8 14 -24 14 q -16 0 -22 -14 q -6 -12 6 -20 z" fill={pad} />
        {cat.pattern === 'tabby' && (
          <g stroke={cat.patternColor} strokeWidth="3" strokeLinecap="round" opacity="0.55">
            <path d="M 34 78 q 10 4 16 2" />
            <path d="M 92 84 q -8 4 -14 2" />
          </g>
        )}
      </g>
    </svg>
  );
}
