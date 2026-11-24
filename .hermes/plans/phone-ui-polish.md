# Plan: Kitten Hill Mahjong phone UI polish
Date: 2026-10-30

## Goal
Fix the phone menu’s clipped content and misleading empty-state actions, make opponents’ concealed hands read as tiles, and clarify the few remaining compact status labels without sacrificing the portrait table layout.

## Scope and starting point
- Phone app only. **No desktop layout work.**
- Start from the current working tree. `src/client/screens/Menu.tsx`, `src/client/screens/Creator.tsx`, and `src/client/styles.css` already contain uncommitted changes; preserve and build on them. Do not reset or replace those edits.
- The current retail audit passes at 390×844 and 375×667, but the menu’s own scroll container still overflows: 109px at 375×667 and 136px at 360×640. At 375×667, the “Face a cat” card crosses the fold: the name field and Add control begin below the viewport.

## Tasks

1. **Make the default menu fit short phones without cutting a card** — `src/client/screens/Menu.tsx`, `src/client/styles.css`
   - Keep the main cat/profile and match-length decisions visible. Present rival-code entry as a compact secondary action that expands into a clearly intentional form (inline disclosure or a phone-sized sheet); do not shrink text to make the default layout fit.
   - If the form expands into a scrollable surface, make the scroll boundary apparent and keep the form’s Add action reachable.
   - Extend `scripts/retail-audit.mjs` to measure the menu screen’s own `scrollHeight` and child/card bounds at 360×640, 375×667, 390×844, and 414×896. Document overflow alone is insufficient.
   - **Accept:** the default menu has no card crossing the fold at those viewports; the rival form remains fully usable when opened; no required text falls below 10px.

2. **Fix the empty-profile action hierarchy** — `src/client/screens/Menu.tsx`, `src/client/styles.css`, `scripts/design-interaction.mjs`
   - Make the prominent gold **Create your cat first** action actually open the creator, with concise action copy such as **Create a cat**. Remove or demote the duplicate small Create action in the empty profile card so there is one obvious primary route.
   - Keep online play unavailable until a cat exists, but make that state visibly disabled and explain the prerequisite next to it; it must not look like a live button that silently does nothing.
   - Add interaction checks for the no-profile state: the primary opens the creator; online play’s disabled state and reason are clear; creating a profile enables the appropriate actions.

3. **Make concealed opponent hands read as tiles** — `src/client/styles.css`, `src/client/Game.tsx`, `scripts/design-behaviour.mjs`
   - The current `.opp__back` measures 5×10px, which reads like a meter tick. Increase the width to at least 6px while preserving the 10px height and the existing seat-card geometry; retain enough spacing to distinguish individual backs.
   - Add a geometry check for 13 concealed markers per closed opponent hand, marker dimensions, and no collision with the paw or count strip at phone sizes.
   - **Accept:** markers are recognizable as repeated tile backs in a cropped seat-card review and still fit at 360px width.

4. **Clarify the remaining compact labels; keep the existing fan explanation** — `src/client/Game.tsx`, `src/client/Creator.tsx`, `src/client/styles.css`
   - Make the `0/2` seat counter’s meaning as match wins clear with a compact visible cue or nearby legend, without changing scoring or match logic.
   - The away indicator already has a tooltip and the fan meter already opens its explanation sheet. Preserve those; only adjust the visible away wording if a phone-size review still leaves “4 away” ambiguous, and avoid duplicating the fan-sheet copy.
   - Add a visible **Coat colour** label above the creator’s first swatch group. Keep the existing accessible section headings and verify the added label does not compromise the creator’s short-screen layout.

5. **Run the full phone regression pass**
   - `PLAYWRIGHT_REQUIRE_FROM=/home/onewing/github/MahjongAscent/package.json node scripts/retail-audit.mjs http://localhost:4180/` — extend the harness to include 360×640 and 414×896 as part of Task 1.
   - `node scripts/design-audit.mjs && node scripts/design-behaviour.mjs && node scripts/design-interaction.mjs`
   - `npx vitest run`
   - `npx tsc --noEmit`
   - `node node_modules/vite/bin/vite.js build`
   - Capture menu, expanded rival form, creator, and table screenshots at 360×640, 375×667, 390×844, and 414×896. Review the menu fold and opponent backs at native phone scale, not only enlarged crops.

## Order
Tasks 1–3 address the likely customer complaints first. Task 4 is lower-priority polish and should not delay the menu or hand-marker fixes. Run Task 5 after all changes.