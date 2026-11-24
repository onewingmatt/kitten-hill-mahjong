import React from 'react';

/**
 * Inline SVG icons. Emoji render as full-colour glyphs and break the palette,
 * so every control glyph in the shell is drawn here instead.
 */
type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function IconSound({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

export function IconMute({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </svg>
  );
}

/** Options: three sliders, because a gear reads as "settings app" not "a few switches". */
export function IconSliders({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M4 7h6M14 7h6M4 12h10M18 12h2M4 17h3M11 17h9" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

export function IconClose({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** A written record, not a menu: the dock button opens the table log. */
export function IconLog({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M6 3.6h9.4l3.2 3.2v12.6a1.6 1.6 0 0 1-1.6 1.6H6a1.6 1.6 0 0 1-1.6-1.6V5.2A1.6 1.6 0 0 1 6 3.6z" />
      <path d="M15.2 3.8v3.2h3.2" />
      <path d="M7.8 11.4h8M7.8 14.6h8M7.8 17.6h4.6" />
    </svg>
  );
}

export function IconMenu({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

export function IconBack({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M14.5 5.5L8 12l6.5 6.5" />
    </svg>
  );
}

export function IconDice({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPaw({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <ellipse cx="12" cy="15.5" rx="5.2" ry="4.2" />
      <ellipse cx="6.2" cy="10" rx="1.9" ry="2.4" />
      <ellipse cx="10.4" cy="7.4" rx="1.9" ry="2.6" />
      <ellipse cx="14.9" cy="7.6" rx="1.9" ry="2.6" />
      <ellipse cx="18.2" cy="10.6" rx="1.8" ry="2.3" />
    </svg>
  );
}

export function IconSparkle({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  );
}

export function IconLock({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export function IconTrophy({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M7 4h10v4.5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 8 11M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11" />
      <path d="M12 13.5V17M8.5 20h7" />
    </svg>
  );
}

/** Chevron up with a rule under it: "this opens a panel". */
export function IconExpand({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M7 14.5 12 9.5l5 5" />
      <path d="M7 19h10" />
    </svg>
  );
}

export function IconPause({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M9 6v12M15 6v12" />
    </svg>
  );
}

export function IconPlay({ size = 18, className }: P) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M8 5.5 18 12l-10 6.5z" />
    </svg>
  );
}
