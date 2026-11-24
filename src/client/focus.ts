/**
 * Which tile a rack index actually points at.
 *
 * `selected` is an index into the *displayed* rack, and `act()` clears it. A
 * server snapshot or a resumed match can replace the hand without going through
 * `act()`, so the index can outlive the tile it pointed at — `display[selected]`
 * then returns `undefined`, `focusKind !== null` is still true, and the raise
 * chip calls `spriteUrl(undefined)`, which throws "tile kind index out of range:
 * undefined" and takes the whole table to the crash screen.
 *
 * One guard for every path: no index, no focus.
 */
export function kindAt(display: number[], selected: number | null): number | null {
  if (selected === null || !Number.isInteger(selected) || selected < 0 || selected >= display.length) {
    return null;
  }
  const k = display[selected];
  return Number.isInteger(k) ? k : null;
}
