import React from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard discipline for anything that opens over the table.
 *
 * Without this the scrim is a lie: focus stays on the button behind it, Tab
 * wanders into the dock, and a screen reader never announces that a panel
 * opened. Every overlay calls this, so Escape always means "close what is in
 * front of me" and closing always puts you back where you were.
 */
export function useDialog(onClose: () => void, options: { modal?: boolean } = {}) {
  const { modal = true } = options;
  const ref = React.useRef<HTMLDivElement | null>(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const before = document.activeElement as HTMLElement | null;

    // the first control takes focus, so Tab starts inside the panel
    const first = node.querySelector<HTMLElement>(FOCUSABLE);
    if (first) first.focus({ preventScroll: true });
    else {
      node.setAttribute('tabindex', '-1');
      node.focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (!modal || e.key !== 'Tab') return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !node.contains(active)) {
        e.preventDefault();
        firstItem.focus();
        return;
      }
      if (e.shiftKey && active === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // put focus back — but never steal it from something the player just clicked.
      // when the panel unmounts, focus has usually already fallen back to <body>.
      const active = document.activeElement as HTMLElement | null;
      const lost = !active || active === document.body || node.contains(active);
      if (!lost) return;
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [modal]);

  return ref;
}
