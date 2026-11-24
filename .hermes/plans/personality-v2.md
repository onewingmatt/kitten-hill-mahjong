# Plan: personality v2 — make the learned cat actually play like you

Date: 2026-11-01
Repo: `~/github/kitten-hill-mahjong`

## Goal

Turn the measured play-style from a label into the bot that replaces you: record every decision (including
online), persist the vector, and give the vector enough — and only enough — axes that a bot of you plays
differently from a bot of anyone else.

## What the deep dive measured (baseline, do not re-derive)

- Recording works in **solo** only: `store.act` records throws/claims for `action.seat === mySeat`, and
  `recordHand` fires in both settle branches. 24 scripted hands produced 77 claim offers, 0 errors.
- Two opposite players produced clearly different vectors and codes
  (`Silent · Guarded` caution .95 / aggression .08 vs `Pung-hunter` setBias .95) — the maths is right.
- `khm.profile.v1.personality` is written **once**, at cat creation, and never refreshed. Menu label and
  CAT CODE recompute live; `net.create/join` sends the stale profile, so your online seat and its
  stand-in bot play your creation-time vector.
- Online records **nothing**: `act()` returns early for `mode === 'online'`, `applyRoomState` records nothing.
- Trait responsiveness (80 turning hands / 24 pon offers, sweep 0.05→0.95 vs NEUTRAL):

  | trait | discards changed | claims changed |
  |---|---|---|
  | setBias | 10 | 21 |
  | aggression | 0 | 21 |
  | caution | 4 | 0 |
  | honourLoyalty | 7 | 0 |
  | suits | 27 (bamboo-heavy) | 0 |
  | greed | 0 | 0 |
  | limitHunter | 0 | 0 |
  | tilt | 0 (never read) | 0 |

- `suits` flatlines: `1.85 - max(0, share - 1/3) * 4.2` returns 1.85 for every suit until one exceeds a third
  of your throws. Both 12-hand sessions read 1.85/1.85/1.85.
- `limitHunter`'s only consumer gates at > 0.6; measurement tops out ≈0.16 (needs a 3.75-fan average).

## The v2 vector (the "credentials")

Nine axes. Every one has a statistic that exists or is cheap to collect, a bot consumer that can flip a
decision, and a default that reads neutral.

| axis | measured from | consumer in `bot.ts` | range | neutral |
|---|---|---|---|---|
| `setBias` | pon share of claims | pair retention, pung/chi appetite, self-kong | .1–.95 | .5 |
| `claimAppetite` (rename of `aggression`) | claims ÷ offers | claim thresholds, kan gate | .05–.95 | .42 |
| `caution` | mean `dangerOf` of your throws ÷ mean of the safest option available | danger penalty weight | .1–.95 | .5 |
| `efficiency` (new) | share of throws that kept best `shantenByDiscard` | new `sloppiness = 1 - efficiency` dial | .3–1 | .9 |
| `honourLoyalty` | early honour dumps ÷ hands | honour retention in plan + pair flavour | .1–.95 | .5 |
| `suits[3]` | throw shares normalised against your own mean | plan suit score + per-tile flavour | .35–2.4 | 1.0 |
| `greed` | mean fan of your wins vs the table's | flush commit threshold, `fanWeight` | .15–.95 | .5 |
| `limitHunter` | share of wins at 3+ fan + kongs/hand | kokushi plan (gate 0.6 → 0.35) | 0–.9 | .25 |
| `tilt` | danger accepted in the 3 throws after a loss vs baseline | first-3-throws risk amplification | 0–.6 | .2 |

New suit formula (continuous, neutral 1.0, no flat region):
`pull_s = clamp(1 + (1/3 - share_s) * 3.2, 0.35, 2.4)`.
45% dots dumper → 0.63 · 20% dots thrower → 1.42 · even split → 1.0.

## Tasks

### P0 — make what already exists reach the bot of you

1. **Live profile vector** — `src/client/store.ts`
   - Add `syncProfilePersonality()`: if `profile`, rewrite `khm.profile.v1` with
     `personality: personalityFromStats(get().stats)` (no `track`, no screen change).
   - Call it from a store subscription on `stats` (debounced 250 ms, same shape as the match save) so solo
     and online both refresh; and in `net.create/join` send
     `{ ...profile, personality: personalityFromStats(stats) }` (`src/client/screens/Lobby.tsx`).
   - Verify: play 8 hands → `JSON.parse(localStorage.getItem('khm.profile.v1')).personality.caution` matches
     `personalityFromStats(stats).caution`; today it stays 0.5.
2. **Online recording** — `server/index.ts`, `src/client/net.ts`, `src/client/store.ts`
   - `net.action(a)` → `conn().emit('room:action', { id, action: a })`, `id = crypto.randomUUID()`.
   - `act()` online branch: compute the stat **now** from the held snapshot (`recordThrow` needs
     `visibleCounts`/`dangerOf` for the new axes) and queue `{ id, stat }` in a module map; commit on ack.
   - Server `room:action`: after a successful `applyAction`, `socket.emit('room:applied', { id })`;
     on `IllegalAction`, `socket.emit('room:rejected', { id })`.
   - Client: on `applied` → `saveStats` + `set({ stats })`; on `rejected` → drop. Solo path untouched.
   - Verify: `node scripts/learn-check.mjs` (new, patterned on `scripts/rooms-check.mjs`): create a room with
     three bots, play one hand over the socket, assert `khm.stats.v1.hands` +1 and `throwsBySuit` equals the
     client's own discards.
3. **Heal every incoming personality** — `src/engine/bots/personality.ts`
   - Add `healPersonality(raw): Personality` filling missing/NaN fields from `NEUTRAL`.
   - Use it in `restoreFrom` (`src/client/sync.ts`), `decodePersonality`, and `room:create`/`room:join`
     (`server/index.ts`) before the seat is stored. Without it a v1 backup or a v1 cat code puts `undefined`
     into `chooseDiscard` and every score becomes `NaN`.
   - Verify: feed a personality object missing `efficiency` and `suits` through it; assert all nine fields are
     finite and in range.

### P1 — record enough to measure the new axes

4. **Stats v2 counters** — `src/client/stats.ts`
   - Add: `dangerAccepted`, `dangerAvailable`, `efficientThrows`, `efficientTotal`, `kongCount`,
     `postLossThrows`, `postLossDanger`.
   - Bump `STATS_KEY` to `khm.stats.v2`. `loadStats()` reads v2; when v2 is absent it reads the old
     `khm.stats.v1` key and heals it forward — shared counters copy across, the new ratios default to neutral
     (danger 0.5, efficiency 0.9, tilt 0.5), never to zero, or every existing player reads as reckless. The v1
     key is left in place for one release, not deleted.
   - Recorders take the pre-action state: `recordThrow(s, kind, discardsSoFar, ctx)` where `ctx` carries
     `danger` and `wasBest` (computed by the caller with `visibleCounts`/`dangerOf`/`shantenByDiscard`).
   - Verify: unit tests per counter in `tests/stats.test.ts`; a v1 record heals to neutral ratios.
5. **Rewrite `readStyle`** to the table above — `src/client/stats.ts`
   - Keep the `mix(NEUTRAL, read, confidence)` blending and the 8-hand confidence ramp exactly as they are.
   - Verify: extend `tests/stats.test.ts` with one monotonic assertion per axis (safety-averse play → higher
     caution; sloppier play → lower efficiency; suit-dumping → lower pull for that suit; 3+ fan wins → higher
     limitHunter; post-loss risk → higher tilt). Ranges stay inside the table.

### P2 — give the new axes a consumer

6. **`sloppiness` dial** — `src/engine/bots/bot.ts#chooseDiscard`
   - After ranking, pick the 2nd-best discard when a deterministic pseudo-random draw (seeded from
     `s.state.seed + s.seq + seat`, not `Math.random`) is under `(1 - p.efficiency) * 0.5`. At efficiency 1 it
     never fires; at 0.5 roughly a quarter of turns take the second-best line.
   - Gate: archetypes cap at `efficiency >= 0.75`; only player-derived cats may go lower.
   - Verify: `node scripts/traits-check.mjs` shows ≥8 flips at efficiency .5 vs 1.0;
     `npx tsx tests/sim/balance.ts 160` stays within the documented fingerprint.
7. **`limitHunter` gate** 0.6 → 0.35, and require `wall > 40` for the kokushi commitment.
   - Verify: a measured vector (limitHunter .16) still ignores kokushi; .4 commits on a 12-unique hand.
8. **`tilt` consumer** — first three discards of a hand carry `- dangerOf * tilt * 40` extra; stateless, from
   `player.discards.length < 3`.
   - Verify: ≥5 flips at tilt .55 vs .2 on the corpus.
9. **Re-centre `suits`** — measured suits now centre on 1.0, so raise the plan coefficient
   (`p.suits[s] * 1.6` → `* 2.6`) and re-check the balance fingerprint.

### P3 — codes and surface

10. **Share code v2** — `src/engine/bots/personality.ts`
    - v2 = 13 chars: `'2'` + 12 nibbles (nine axes + three suits at 4 bits) + checksum, e.g. `2QHMFLNNNCB-Y`.
    - `decodePersonality` accepts 11-char v1 (unchanged bit order) and 13-char v2; `encodePersonality` emits v2.
    - Verify: round-trip test over 200 random vectors (max per-axis error 1/15 or 0.16 for suits); a v1 code from
      `JHQBNNNNCD-V` still decodes.
11. **CAT CODE chip fits 13 chars at 360** — `src/client/styles.css`, `src/client/screens/Menu.tsx`
    - Measure the chip; if it overflows, tighten tracking rather than shrinking below 10px.
    - `retail-audit` menu pass must stay green.
12. **Labels** — `playStyleLabel` gains at most two phrases (`Sloppy`/`Tidy` from efficiency, `Danger-shy` from
    caution); still capped at three parts, still no jargon.

### P4 — gates

13. `scripts/traits-check.mjs` — the responsiveness table as pass/fail, minimum flips per axis
    (setBias 8, claimAppetite 10 claims, caution 5, efficiency 8, honourLoyalty 5, suits 10, greed 3,
    limitHunter 3, tilt 5). This is the rule that keeps a trait from going decorative again.
14. `npx tsx tests/sim/balance.ts 160` — win rate and fan histogram within 4 points of the documented baseline;
    record the new numbers in the skill either way.

## Definition of done

- A 12-hand session moves the saved profile, not just the label, and the CAT CODE changes with it.
- An online hand increments `khm.stats.v2` and the stand-in bot for that seat plays the measured vector.
- `scripts/traits-check.mjs` and `scripts/learn-check.mjs` are green; `retail-audit`, `design-behaviour`,
  `design-audit`, `design-interaction` unchanged; `npx vitest run` + `tsc --noEmit` clean.

## Decisions — locked 2026-11-01

1. **`tilt`** — implement as post-loss risk. Keeps the code's promise; the measurement changes from
   `draws/hands` to post-loss danger, which is what the name means.
2. **`sloppiness`** — the eight archetypes get the dial too, and the balance sweep is re-tuned to the new
   fingerprint. Every archetype gets an `efficiency` value in its literal (Pip fast and clean, Sable loose);
   the sweep is the gate, not a cap.
3. **Code** — 13-char v2 (`2` + 12 nibbles + checksum); v1 codes still decode.

## Shipped 2026-11-01 (P0–P5, all of it)

- **P1 record:** `khm.stats.v2` with `dangerAccepted/Available`, `efficientThrows/Total`, `kongs`,
  `postLossThrows/Danger`. v1 records carry forward with neutral defaults for the ratios they never
  measured. `readStyle` rewritten: continuous suit pull centred on 1.0, caution from accepted-vs-
  available danger, efficiency from kept-best throws, tilt from post-loss risk, limitHunter from the
  share of 3+ fan wins.
- **P2 consumers:** `sloppiness = (1 - efficiency) × 0.35` off a deterministic position hash;
  limitHunter gate 0.60 → 0.35 and only while wall > 40; tilt pushes risk in the first three throws
  after a loss; suit coefficient 1.6 → 2.6 (measured suits now centre on 1.0); archetypes carry
  efficiency 0.68–0.96.
- **P3 code:** thirteen characters (`2` + eleven nibbles + checksum). v1 codes still decode.
- **P4 gates:** `npx tsx scripts/traits-check.ts` — nine axes, per-axis minimum flips, two measured
  styles compared, code round-trip. `node scripts/learn-check.mjs` now also covers the cattery.
- **P5 cattery:** `/pool` publish/unpublish/list, `src/client/pool.ts`, `Cattery.tsx` sheet from the
  menu foot and the lobby, seating by re-encoding the vector into a cat code.
- **Balance:** 141/160 hands won (88.1%), 19 drawn, fan 0/1/2/3 = 73/41/21/6 (52/29/15/4%). Old
  fingerprint was 90/10 and 52/32/12/4; the drop is the sloppiness dial doing its job.

Verification run: 130 unit tests, `tsc` clean, traits-check all axes moving, learn-check 13/13,
design-behaviour 31/31, design-audit 48/48, retail-audit green at four widths.

## P0 — shipped 2026-11-01

`commitStats` funnel (stats → profile → debounced write), online learning through the
`room:action {id}` / `room:applied` handshake, hand recorded once on the ended-snapshot transition,
`healPersonality` on every boundary, `window.__khmLearn` QA hook.

Verified: `node scripts/learn-check.mjs` 8/8 (a real online hand: 18 throws, 8 offers, 1 hand, profile
carries the live vector, code `JHJGG…`), design-behaviour 31/31 including `learn:*`, retail-audit and
design-audit/interaction unchanged, `npx vitest run` 122 tests.

## P5 — the cattery: a pool of player cats others can face (asked 2026-11-01)

Today there is **no pool**. `room:addCat` accepts one 11-char cat code; the `profiles` table holds
anonymous backups behind 6-char sync codes with no listing endpoint; the only built-in roster is the
eight archetypes. So today another player can only face your cat if you hand them the code.

Proposal, if you want it:

1. **Opt-in publishing.** Menu control "Let other cats meet mine" publishes `{ name, cat, personality }`
   to a `pool` table keyed by the sync code. Off by default, revocable, and the toggle states exactly
   what becomes visible (name, cat art, style label — never stats, score, history or the sync code).
2. **`GET /pool?n=12`** returns a rotated shortlist: opaque pool id, name, cat, personality, label.
   Capped at a few hundred rows, rate-limited, 30-day refresh or explicit revoke.
3. **Surfaces.** Lobby gains "Pick a cat" (a sheet over the pool) next to the code field; solo
   "Face a cat" gains "Surprise me", which takes a pool cat. `room:addCat` accepts a pool id or a code.
4. **Why it matters for this plan.** A pool is what makes a measured vector worth having: your cat
   becomes a bot other people actually meet, and the stand-in who replaces a dropped phone is only the
   private case of that.
5. **Guardrails.** No free-text beyond the existing 14-char name, no stats published, publishing is one
   row per sync code and deleting the cat deletes the row.

Estimate: one session for table + endpoints + revocation, half for the lobby/solo surfaces, half for an
audit pass (`design-behaviour`: publish → appears in the pool → unpublish → gone).

## Guardrails (product decisions already made — do not re-litigate)

- Never ask "how do you play": the vector is measured, never chosen.
- No style card, no bar chart, no stats screen. The menu keeps `Label · N hands, M won` and the CAT CODE.
- No minimum fan, portrait only, 10px type floor, emoji-free chrome.

## Risks

- **Bot strength drift** from `sloppiness`/`tilt`: mitigated by the archetype cap and the balance fingerprint.
- **Old records read as caricatures** if new ratios default to zero: mitigated by neutral defaults in `healStats`.
- **v1 code breakage** if nibble order changes: v1 decode path is frozen and unit-tested.
- **Double counting** online if both the intent and the snapshot record: only the ack commits the queued stat.
