import React from 'react';
import { useStore, HUMAN, seatWind, humanClaims, humanKongs, humanCanWin, handView } from './store';
import { Tile, TileBack, Melds, Flowers } from './components/Tile';
import { CatFace, CatPaw } from './cat';
import { estimateFan, fanBreakdown, type FanLine } from '../engine/bots/fan-estimate';
import { countsOf } from '../engine/shanten';
import { afterEachDiscard, blockByKind, decompose, describe as describeShape, distanceToReady } from '../engine/shape';
import { kind, spriteUrl } from '../engine/tiles';
import { ResultOverlay } from './screens/Result';
import { PlayerSheet } from './screens/PlayerSheet';
import { Wash } from './screens/Wash';
import { claimOptions, currentWaits } from '../engine/game';
import { LogSheet } from './screens/LogSheet';
import { sfx } from './audio';
import { useDialog } from './useDialog';
import { IconClose, IconExpand, IconLock, IconLog, IconMute, IconPause, IconPlay, IconSound, IconSparkle, IconTrophy } from './components/Icons';

const WIND_GLYPH = ['東', '南', '西', '北'];

/** Relative position around the table: 0 = you, 1 = right, 2 = across, 3 = left. */
function rel(seat: number, mySeat: number): number {
  return (seat - mySeat + 4) % 4;
}

function money(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function Game() {
  const {
    game,
    seats,
    dealer,
    handNo,
    target,
    scores,
    handWins,
    sortMode,
    myOrder,
    selected,
    moveTile,
    muted,
    banner,
    paw,
    resultOpen,
    online,
    stepBot,
    nextActor,
    selectTile,
    discardSelected,
    humanClaim,
    humanPass,
    humanHu,
    humanKong,
    setSort,
    toggleMute,
    leave,
    say,
    mySeat,
    mode,
    deadlineAt,
    userPaused,
    togglePause,
    keep,
    keepNudge,
    toggleKeep,
    openResult,
    matchOver,
  } = useStore();

  /* ---- the player sheet freezes the table: no bot ticks, no claim clock ---- */
  const [sheetSeat, setSheetSeat] = React.useState<number | null>(null);
  /* reading the log should never cost you a turn or a claim */
  const [logOpen, setLogOpen] = React.useState(false);
  /* the fan counter explains itself on demand: a phone has no hover, so the
     `title` it used to carry reached nobody */
  const [fanOpen, setFanOpen] = React.useState(false);
  /* the X in the HUD used to drop the hand on the first tap, from the corner
     where a thumb rests. Leaving mid-hand asks first; leaving a finished hand
     does not, because there is nothing left to lose. */
  const [leaveAsk, setLeaveAsk] = React.useState(false);

  /* ---- the wash plays over the top of each new deal ---- */
  const reducedMotion =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [washing, setWashing] = React.useState(!reducedMotion);
  React.useEffect(() => {
    if (reducedMotion) return;
    setWashing(true);
    sfx.wash();
    const id = window.setTimeout(() => setWashing(false), 2300);
    return () => window.clearTimeout(id);
  }, [handNo, reducedMotion]);

  /* ---- bot driver: one action per tick, with a beat between plays ---- */
  const lastSeq = React.useRef<number>(-1);
  React.useEffect(() => {
    if (mode === 'online') return;
    if (!game || game.phase === 'ended') return;
    if (userPaused || logOpen) {
      // clear the marker so the same position can step again once play resumes
      lastSeq.current = -1;
      return;
    }
    const actor = nextActor();
    if (actor === null || actor === mySeat) return;
    if (lastSeq.current === game.seq) return;
    lastSeq.current = game.seq;
    const delay = 380 + Math.random() * 320;
    const id = window.setTimeout(() => stepBot(), delay);
    return () => window.clearTimeout(id);
  }, [game, game?.seq, nextActor, stepBot, mode, userPaused, logOpen]);

  /* ---- auto-pass so a forgotten claim never stalls the table ---- */
  const myClaims = humanClaims(game);
  // once the seat has answered — including the auto-pass — the offer is over:
  // leaving the buttons up would hand the player a dead control
  const waiting = game?.phase === 'claim' && myClaims.length > 0 && !game.claimResponses[mySeat];

  /* the window is visible and timed: an offer that vanishes without a clock
     reads as a bug, which is exactly how it felt */
  const CLAIM_MS = 15000;
  const [claimLeft, setClaimLeft] = React.useState(CLAIM_MS);
  React.useEffect(() => {
    if (!waiting || logOpen) return;
    const start = Date.now();
    setClaimLeft(CLAIM_MS);
    const id = window.setInterval(() => setClaimLeft(Math.max(0, CLAIM_MS - (Date.now() - start))), 100);
    return () => window.clearInterval(id);
  }, [waiting, game?.seq, logOpen]);
  React.useEffect(() => {
    if (mode === 'online' || !waiting || userPaused || logOpen) return;
    const id = window.setTimeout(() => humanPass(), CLAIM_MS);
    return () => window.clearTimeout(id);
  }, [waiting, game?.seq, humanPass, mode, userPaused, logOpen]);

  /* ---- online: the bar renders the server's clock, not a local guess ---- */
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (mode !== 'online' || !deadlineAt) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [mode, deadlineAt]);
  const remainMs = deadlineAt ? Math.max(0, deadlineAt - nowMs) : null;
  // the snapshot carries the deadline, not the length: the length is whatever
  // was left when it arrived, which is right for the first frame of a turn
  const deadlineTotal = React.useRef(0);
  React.useEffect(() => {
    deadlineTotal.current = deadlineAt ? Math.max(4000, deadlineAt - Date.now()) : 0;
  }, [deadlineAt]);

  if (!game) return null;

  const myHand = game.seats[mySeat].hand;
  const myTurn = game.phase === 'discard' && game.turn === mySeat;
  const ended = game.phase === 'ended';
  const myWind = seatWind(mySeat, dealer);
  const myFan = estimateFan(countsOf(myHand), game.seats[mySeat].melds, myWind, game.roundWind);
  const fanLines = fanBreakdown(countsOf(myHand), game.seats[mySeat].melds, myWind, game.roundWind);
  const canWin = humanCanWin(game);
  const kongs = humanKongs(game);

  const display = handView({ game, sortMode, myOrder, mySeat });
  const sorted = display.map((k, i) => ({ k, i }));
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__khmRack = {
      displayLen: display.length, handLen: myHand.length, orderLen: myOrder.length, sortMode, myTurn,
    };
  }
  let drawn: { k: number; i: number } | null = null;
  if (myTurn && game.lastDrawn !== null && game.lastDrawSeat === mySeat) {
    const pos = sorted.map((e) => e.k).lastIndexOf(game.lastDrawn);
    if (pos >= 0) drawn = sorted.splice(pos, 1)[0];
  }

  /* ---- the hand's shape: which tiles already belong together ---- */
  const meldCount = game.seats[mySeat].melds.length;
  const blocks = decompose(myHand);
  const shaped = blockByKind(blocks);
  const away = distanceToReady(myHand, meldCount);
  const focusKind = selected !== null ? display[selected] : null;
  const focusBlock = focusKind !== null ? shaped.get(focusKind) : undefined;
  const focusLine = focusKind !== null ? describeShape(blocks, focusKind) : null;
  /* a lone tile can be marked safe too, so the mark follows the tile, not the block */
  const focusKinds = focusBlock ? Array.from(new Set(focusBlock.tiles)) : focusKind !== null ? [focusKind] : [];
  const groupKept = focusKinds.length > 0 && focusKinds.every((k) => keep.includes(k));
  const raisedKept = focusKind !== null && keep.includes(focusKind);
  /* raising a tile is a question about the discard, so answer it in the chip */
  const after = focusKind !== null ? afterEachDiscard(myHand, meldCount)?.get(focusKind) : undefined;
  const chipText =
    after !== undefined
      ? after <= 0 ? '→ ready' : `→ ${after} away`
      : away <= 0 ? 'ready' : `${away} away`;

  const wallPct = Math.max(0, Math.min(1, game.wall.length / 90));

  /* ---- who just did what: drive the opponent paws and callouts off the log ---- */
  const [flash, setFlash] = React.useState<{ seat: number; type: string; id: number } | null>(null);
  React.useEffect(() => {
    if (!game) return;
    const last = game.log[game.log.length - 1];
    if (!last || last.seat === null) return;
    setFlash({ seat: last.seat, type: last.type, id: last.t });
    const id = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(id);
  }, [game?.seq, game]);

  const poseFor = (seat: number) => {
    if (!flash || flash.seat !== seat) return 'rest' as const;
    if (flash.type === 'pon' || flash.type === 'chi' || flash.type === 'kan' || flash.type === 'win') return 'slam' as const;
    if (flash.type === 'discard') return 'tap' as const;
    if (flash.type === 'draw') return 'raise' as const;
    return 'rest' as const;
  };
  const calloutFor = (seat: number) => {
    if (!flash || flash.seat !== seat) return null;
    const label =
      flash.type === 'pon' ? 'pung' :
      flash.type === 'chi' ? 'chi' :
      flash.type === 'kan' ? 'kong' :
      flash.type === 'win' ? 'mahjong' : null;
    return label;
  };

  /* ---- ready state: what the hand is waiting on ---- */
  const waits = game.phase === 'claim' || (game.phase === 'discard' && game.turn !== mySeat)
    ? currentWaits(game, mySeat)
    : [];

  /* ---- arranging the rack: drag a tile, or tap it to raise it ---- */
  const handRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ i: number; x: number; y: number; moved: boolean } | null>(null);
  const [drag, setDrag] = React.useState<{ i: number; dx: number; dy: number; moved: boolean } | null>(null);

  /* a keyboard "click" is the only click that needs its own path: pointer taps
     are handled on pointerup. Both signals are checked, because a browser that
     reports detail 0 for a touch would otherwise discard on a single tap. */
  const lastPointerAt = React.useRef(0);

  const onPointerDown = (e: React.PointerEvent, i: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lastPointerAt.current = Date.now();
    dragRef.current = { i, x: e.clientX, y: e.clientY, moved: false };
    setDrag({ i, dx: 0, dy: 0, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // A two-row rack is dragged vertically as often as horizontally: measure
    // the whole gesture, not just x.
    const moved = d.moved || Math.hypot(dx, dy) > 7;
    dragRef.current = { ...d, moved };
    if (moved || drag) setDrag({ i: d.i, dx, dy, moved });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (!d.moved) {
      selectTile(d.i);
      return;
    }
    const container = handRef.current;
    if (!container) return;
    // Work in LAYOUT coordinates (offsetLeft/offsetTop + container origin).
    // getBoundingClientRect includes the drag transform, so a raised or dragged
    // tile would measure itself as the nearest slot and the drop would no-op.
    const tiles = Array.from(container.querySelectorAll('.tile')) as HTMLElement[];
    const cRect = container.getBoundingClientRect();
    const px = e.clientX - cRect.left + container.scrollLeft;
    const py = e.clientY - cRect.top;

    let target = d.i;
    let best = Infinity;
    tiles.forEach((el, idx) => {
      const cx = el.offsetLeft + el.offsetWidth / 2;
      const cy = el.offsetTop + el.offsetHeight / 2;
      // 2D distance with y weighted, so rows win over columns at this size.
      const dist = Math.hypot(px - cx, (py - cy) * 1.6);
      if (dist < best) { best = dist; target = idx; }
    });
    (window as unknown as Record<string, unknown>).__khmLastDrop = {
      px: Math.round(px), py: Math.round(py), from: d.i, target,
      cells: tiles.map((t) => [t.offsetLeft, t.offsetTop, t.offsetWidth, t.offsetHeight]),
    };
    if (target !== d.i) moveTile(d.i, target);
  };

  return (
    <div className="app app--enter" key={`hand-${handNo}`}>
      <Hud
        handNo={handNo}
        target={target}
        muted={muted}
        onMute={toggleMute}
        onLeave={() => (ended ? leave() : setLeaveAsk(true))}
        wind={myWind}
        wall={game.wall.length}
      />

      {/* online only: the two things the server knows and the table did not say */}
      {mode === 'online' && online === 'offline' && (
        <div className="netstrip" role="status">
          <span className="netstrip__dot" aria-hidden="true" />
          Connection lost — reconnecting
        </div>
      )}
      {mode === 'online' && remainMs !== null && deadlineTotal.current > 0 && (
        <div className={`deadline${remainMs < 5000 ? ' is-low' : ''}`} aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, remainMs / deadlineTotal.current))})` }} />
        </div>
      )}

      <div className="opponents">
        {[3, 2, 1].map((d) => (mySeat + d) % 4).map((seat) => (
          <OpponentCard
            key={seat}
            seat={seat}
            side={seat === 3 ? 'west' : seat === 1 ? 'east' : 'north'}
            dealer={dealer}
            game={game}
            meta={seats[seat]}
            scores={scores}
            wins={handWins}
            pose={poseFor(seat)}
            callout={calloutFor(seat)}
            onOpen={() => setSheetSeat((cur) => (cur === seat ? null : seat))}
          />
        ))}
      </div>

      <div className="table">
        <div className="felt">
          <div className="felt__compass" aria-hidden="true">{WIND_GLYPH[game.roundWind]}</div>
          <div className="wall" aria-label={`${game.wall.length} tiles left in the wall`}>
            <div className="wall__ring" style={{ ['--left' as string]: wallPct.toFixed(3) }} aria-hidden="true">
              <i className="wall__seg wall__seg--n" />
              <i className="wall__seg wall__seg--e" />
              <i className="wall__seg wall__seg--s" />
              <i className="wall__seg wall__seg--w" />
              <span className="wall__core" />
            </div>
            <div className="wall__count">
              {game.wall.length}
              <small>left</small>
            </div>
          </div>

          {[0, 1, 2, 3].map((seat) => (
            <River key={seat} seat={seat} game={game} pending={game.pending} />
          ))}

          {/* a paused table is the only thing that stops play; ended says so in the dock */}
          {userPaused && !ended && <div className="paused-chip">paused</div>}
          {banner && <div className="banner" key={banner.id}>{banner.text}</div>}
        </div>

        {sheetSeat !== null && <PlayerSheet seat={sheetSeat} onClose={() => setSheetSeat(null)} />}
      {logOpen && <LogSheet game={game} seats={seats} mySeat={mySeat} onClose={() => setLogOpen(false)} />}
      </div>

      {/* ---- your dock ---- */}
      <div className="dock">
        {/* the call offer floats over the felt: it cannot reflow the table and
            it cannot be missed, and the bar shows the time left before auto-pass */}
        {waiting && game.pending && (
          <div className="claimbar" role="group" aria-label="Call this tile">
            <div className="claimbar__head">
              <img className="claimbar__tile" src={spriteUrl(game.pending.k)} alt={kind(game.pending.k).label} />
              <div className="claimbar__who">
                <strong>{seats[game.pending.from]?.name ?? 'Someone'}</strong>
                <span>threw {kind(game.pending.k).label}</span>
              </div>
              <span className="claimbar__clock">{Math.ceil(claimLeft / 1000)}s</span>
            </div>
            <div className="claimbar__btns">
              {myClaims.find((c) => c.type === 'hu') && (
                <button className="btn btn--primary" onClick={humanHu}>
                  Hu · {myClaims.find((c) => c.type === 'hu')!.points}
                </button>
              )}
              {myClaims.find((c) => c.type === 'kan') && (
                <button className="btn" onClick={() => humanClaim('kan')}>Kong</button>
              )}
              {myClaims.find((c) => c.type === 'pon') && (
                <button className="btn" onClick={() => humanClaim('pon')}>Pung</button>
              )}
              {myClaims.filter((c) => c.type === 'chi').slice(0, 2).map((c, i) => (
                <button key={i} className="btn" onClick={() => humanClaim('chi', c.withKinds)}>
                  Chi {c.withKinds?.map((k) => kind(k).n).join('·')}
                </button>
              ))}
              <button className="btn btn--ghost" onClick={humanPass}>Pass</button>
            </div>
            <i className="claimbar__bar" style={{ transform: `scaleX(${Math.max(0, claimLeft / CLAIM_MS)})` }} />
          </div>
        )}

        <div className="dock__top">
          <div
            className="dock__you"
            role="button"
            tabIndex={0}
            aria-label="Your table — open your hand and discards"
            onClick={() => setSheetSeat(mySeat)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSheetSeat(mySeat);
              }
            }}
          >
            <div className="seat__badge" style={{ width: 30, height: 30, borderColor: 'var(--seat-0)' }}>
              <CatFace cat={seats[mySeat]?.cat} live={false} />
            </div>
            <div className="seat__body">
              <span className="seat__name">{seats[mySeat]?.name ?? 'You'}</span>
              <span className="seat__meta">
                <span className="wind-disc" style={{ ['--seat' as string]: 'var(--seat-0)' }}>{WIND_GLYPH[myWind]}</span>
                <span key={scores[mySeat]} className="seat__score score-pop">{money(scores[mySeat])}</span>
                <span>· {handWins[mySeat]}/{target}</span>
              </span>
            </div>
          </div>

          <div className="dock__spacer" />

          {waits.length === 0 && (
            <span className="away" title="tiles between this hand and ready">
              {chipText}
            </span>
          )}

          {waits.length > 0 && (
            <>
              <span className="ready">
                <IconSparkle size={11} /> ready
              </span>
              <div className="waits" aria-label={`waiting on ${waits.length} tiles`}>
                {waits.slice(0, 4).map((k) => (
                  <img key={k} className="wait-tile" src={spriteUrl(k)} alt={kind(k).label} />
                ))}
              </div>
            </>
          )}

          <FanMeter value={myFan} onOpen={() => setFanOpen(true)} />
        </div>

        <div className="row" style={{ minHeight: 22 }}>
          <Melds melds={game.seats[mySeat].melds} />
          <div className="grow" />
          <div className="segmented" role="group" aria-label="Sort hand">
            {(['manual', 'suit', 'rank', 'sets', 'smart'] as const).map((m) => (
              <button
                key={m}
                className={sortMode === m ? 'is-on' : ''}
                onClick={() => setSort(m)}
                aria-label={m === 'smart' ? 'Smart: by suit, with sets and runs grouped' : undefined}
              >
                {m === 'manual' ? 'Mine' : m === 'suit' ? 'Suit' : m === 'rank' ? 'Rank' : m === 'sets' ? 'Sets' : 'Smart'}
              </button>
            ))}
          </div>
        </div>

        <div
          className="dock__hand"
          ref={handRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {sorted.map(({ k, i }, order) => {
            const dragging = drag && drag.i === i && drag.moved;
            return (
              <Tile
                key={`${k}-${i}`}
                k={k}
                /* earlier tiles sit on top so the tucked edge is always the left one */
                style={{
                  zIndex: dragging ? 90 : 60 - order,
                  transform: dragging ? `translate(${drag!.dx}px, ${drag!.dy - 4}px) scale(1.05)` : undefined,
                }}
                raised={selected === i}
                className={`tile--ranked ${dragging ? 'tile--dragging' : ''}${keep.includes(k) ? ' tile--kept' : ''}`}
                dim={!myTurn}
                onPointerDown={(e) => onPointerDown(e, i)}
                /* a keyboard "click" has detail 0 and never fires pointerup, so
                   it is the only path that needs handling here — without it the
                   rack was announced as buttons that did nothing when pressed */
                onClick={(e) => {
                  if (e.detail === 0 && Date.now() - lastPointerAt.current > 500) selectTile(i);
                }}
              />
            );
          })}
          {drawn && (
            <Tile
              k={drawn.k}
              /* the drawn tile is pulled out of `sorted`, so it needs the mark class
                 spelled out here or a just-drawn copy of a kept kind looks unlocked */
              className={`tile--held tile--ranked${keep.includes(drawn.k) ? ' tile--kept' : ''}`}
              style={{ zIndex: 61 }}
              drawn
              raised={selected === drawn.i}
              onPointerDown={(e) => onPointerDown(e, drawn!.i)}
              onClick={(e) => {
                if (e.detail === 0 && Date.now() - lastPointerAt.current > 500) selectTile(drawn.i);
              }}
            />
          )}
          {myTurn && !drawn && sorted.length === 0 && <span className="seat__meta">…</span>}
        </div>

        <div className="dock__foot">
          <CatPaw
            cat={seats[mySeat]?.cat}
            className="paw"
            pose={paw === 'rest' && myTurn ? 'raise' : paw}
          />
          <div className="grow">
            {myTurn ? (
              <div className="row" style={{ gap: 6 }}>
                {canWin && (
                  <button className="btn btn--primary" onClick={humanHu}>Declare win</button>
                )}
                {kongs.slice(0, 1).map((k) => (
                  <button key={k} className="btn" onClick={() => humanKong(k)}>
                    Kong {kind(k).n}
                  </button>
                ))}
                {focusKinds.length > 0 && (
                  <button
                    type="button"
                    key={`strip-${keepNudge}`}
                    className={`shape-tiles${groupKept ? ' is-kept' : ''}`}
                    onClick={() => toggleKeep(focusKinds)}
                    aria-pressed={groupKept}
                    aria-label={
                      groupKept
                        ? 'Unmark these tiles'
                        : `Mark ${focusLine ?? 'this tile'} safe from being thrown${
                            /* keeping is by tile KIND, so a second copy elsewhere in
                               the hand is protected too — the rack shows it, a screen
                               reader needs it said */
                            (focusBlock?.tiles ?? []).some(
                              (k2) => display.filter((h) => h === k2).length > 1,
                            )
                              ? ' — every copy of those tiles'
                              : ''
                          }`
                    }
                    title={groupKept ? 'Unmark — allow discarding' : 'Mark safe — cannot be discarded (all copies)'}
                  >
                    {focusBlock ? (
                      focusBlock.tiles.slice(0, 4).map((k2, n) => <img key={n} className="wait-tile" src={spriteUrl(k2)} alt="" />)
                    ) : (
                      <img className="wait-tile" src={spriteUrl(focusKind!)} alt="" />
                    )}
                    <IconLock size={12} className="shape-tiles__lock" />
                    <span className="shape-tiles__label">safe</span>
                  </button>
                )}
                {/* The shape line used to REPLACE the instruction: raise a tile and
                    you were told "a pair", never that tapping again throws it. The
                    line now carries the action and nothing else — the block's tiles
                    are already in the chip beside it, and a 105px line cannot hold
                    both without clipping the one word that matters. */}
                <span className={`seat__meta shape-line${raisedKept ? ' is-kept' : ''}`}>
                  {selected === null
                    ? 'Tap a tile to raise it'
                    : raisedKept
                      /* keeps the word "safe" in the line — the chip says it too,
                         but this is the sentence the player is reading */
                      ? 'safe · tap to unmark'
                      : 'tap again to throw'}
                </span>
              </div>
            ) : waiting ? (
              <span className="seat__meta">A tile is yours to call.</span>
            ) : ended ? (
              <button className="btn btn--ghost" style={{ height: 40 }} onClick={openResult}>
                <IconTrophy size={12} /> {matchOver ? 'Final result' : 'Hand result'}
              </button>
            ) : (
              <span className="seat__meta">
                {game.phase === 'claim' ? 'Waiting on calls…' : `${seats[game.turn]?.name ?? 'Someone'} is thinking…`}
              </span>
            )}
          </div>
          <Flowers flowers={game.seats[mySeat].flowers} />
          {/* pausing a finished hand would be a dead control: nothing is running */}
          {mode !== 'online' && !ended && (
            <button
              className="icon-btn"
              aria-label={userPaused ? 'Resume the table' : 'Pause the table'}
              aria-pressed={userPaused}
              onClick={togglePause}
            >
              {userPaused ? <IconPlay /> : <IconPause />}
            </button>
          )}
          <button
            className="icon-btn"
            aria-label="Table log"
            aria-haspopup="dialog"
            onClick={() => setLogOpen(true)}
          >
            <IconLog />
          </button>
        </div>
      </div>

      {leaveAsk && (
        <LeaveDialog
          online={mode === 'online'}
          handNo={handNo}
          onStay={() => setLeaveAsk(false)}
          onLeave={() => {
            setLeaveAsk(false);
            leave();
          }}
        />
      )}

      {washing && <Wash seats={seats} />}
      {fanOpen && (
        <FanSheet lines={fanLines} fan={myFan} minFan={game.minFan} onClose={() => setFanOpen(false)} />
      )}
      {resultOpen && <ResultOverlay />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Hud({
  handNo,
  target,
  muted,
  onMute,
  onLeave,
  wind,
  wall,
}: {
  handNo: number;
  target: number;
  muted: boolean;
  onMute: () => void;
  onLeave: () => void;
  wind: number;
  wall: number;
}) {
  return (
    <header className="hud">
      <div className="hud__mark">
        <span className="hud__title">Kitten Hill</span>
        <span className="hud__sub">mahjong · 麻雀</span>
      </div>
      {/* "Hand 1 to 2" read as an action ("advance to hand 2") and as a range of
          hands. The match is first-to-N, so say that. */}
      <span className="chip">
        <b>Hand {handNo}</b>
        <span className="hud__to">· first to {target}</span>
      </span>
      <span className="chip chip--ghost">{WIND_GLYPH[wind]} round</span>
      <button className="icon-btn" aria-label={muted ? 'Unmute' : 'Mute'} onClick={onMute}>
        {muted ? <IconMute /> : <IconSound />}
      </button>
      <button className="icon-btn" aria-label="Leave table" onClick={onLeave}>
        <IconClose />
      </button>
      <span className="sr-only" style={{ display: 'none' }}>{wall}</span>
    </header>
  );
}

type SeatPos = 'west' | 'north' | 'east';

/**
 * The way out of the table, asked properly.
 *
 * The HUD's X sits in the thumb corner and used to leave on the first tap: one
 * stray press mid-hand threw the match away with no undo and no copy saying so.
 * This states the consequence for the CURRENT state, puts the safe choice first
 * and focuses it, and closes on Escape or a backdrop press.
 */
function LeaveDialog({
  online,
  handNo,
  onStay,
  onLeave,
}: {
  online: boolean;
  handNo: number;
  onStay: () => void;
  onLeave: () => void;
}) {
  const dialog = useDialog(onStay);
  return (
    <div
      className="modal-scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onStay();
      }}
    >
      <div className="card leave" ref={dialog} role="dialog" aria-modal="true" aria-label="Leave the table?">
        <h2 className="card-label">Leave the table</h2>
        <p className="leave__body">
          {online
            ? 'Your seat is released and the other cats play on without you. You can rejoin only with the room code.'
            : `Hand ${handNo} is still running. Your cat keeps its record, but this match is abandoned.`}
        </p>
        <div className="row leave__cta">
          <button className="btn btn--primary grow" style={{ height: 44 }} onClick={onStay}>
            Keep playing
          </button>
          <button className="btn btn--danger" style={{ height: 44 }} onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One opponent, one card — the three of them are identical by design. Placement is the only
 * difference, and the paw reaches toward the middle of the table so the group reads as mirrored.
 */
function OpponentCard({
  seat,
  side,
  dealer,
  game,
  meta,
  scores,
  wins,
  pose,
  callout,
  onOpen,
}: {
  seat: number;
  side: SeatPos;
  dealer: number;
  game: NonNullable<ReturnType<typeof useStore.getState>['game']>;
  meta?: ReturnType<typeof useStore.getState>['seats'][number];
  scores: number[];
  wins: number[];
  pose: 'rest' | 'raise' | 'tap' | 'slam';
  callout: string | null;
  onOpen: () => void;
}) {
  if (!meta) return <div />;
  const wind = seatWind(seat, dealer);
  const active = game.phase === 'discard' && game.turn === seat;
  const pending = game.pendingSeats.includes(seat) && !game.claimResponses[seat];
  const tiles = game.seats[seat];

  return (
    <div
      className={`seat opp opp--${side} seat--${seat} ${active ? 'is-active' : ''} ${pending ? 'is-claiming' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${meta.name} — open their table`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {callout && <span className="callout">{callout}</span>}

      <span className="opp__open" aria-hidden="true">
        <IconExpand size={14} />
      </span>

      <div className="opp__head">
        <div className="seat__badge opp__badge">
          <CatFace cat={meta.cat} live={active} />
        </div>
        {active && (
          <span className="thinking">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>

      <span className="seat__name opp__name">{meta.name}</span>

      <span className="seat__meta opp__meta">
        <span className="wind-disc" style={{ ['--seat' as string]: `var(--seat-${seat})` }}>
          {WIND_GLYPH[wind]}
        </span>
        <span key={scores[seat]} className="seat__score score-pop">
          {money(scores[seat])}
        </span>
        <span className="opp__wins">{wins[seat]}/{useStore.getState().target}</span>
      </span>

      <div className="opp__hold" aria-hidden="true">
        {tiles.melds.flatMap((m, mi) =>
          m.tiles.map((k, ki) => (
            <img key={`m${mi}-${ki}`} className="opp__meld" src={spriteUrl(k)} alt="" />
          )),
        )}
        {Array.from({ length: tiles.hand.length }).map((_, i) => (
          <span key={`h${i}`} className="opp__back" />
        ))}
      </div>

      <CatPaw cat={meta.cat} className="seat__paw opp__paw" pose={pose} />
    </div>
  );
}

function River({
  seat,
  game,
  pending,
}: {
  seat: number;
  game: NonNullable<ReturnType<typeof useStore.getState>['game']>;
  pending: { k: number; from: number } | null;
}) {
  const mySeatNow = useStore((st) => st.mySeat);
  const position = ['s', 'e', 'n', 'w'][rel(seat, mySeatNow)] as 's' | 'e' | 'n' | 'w';
  const tiles = game.seats[seat].discards;
  const wind = seatWind(seat, game.dealer);
  const tag = (
    <span className={`river__tag river__tag--${position}`} style={{ ['--seat' as string]: `var(--seat-${seat})` }}>
      {WIND_GLYPH[wind]}
    </span>
  );
  if (!tiles.length) {
    return (
      <div className={`river river--${position} is-empty`}>
        {tag}
      </div>
    );
  }
  const shown = tiles.slice(-18);
  const from = {
    s: ['0', '180px'],
    n: ['0', '-180px'],
    e: ['180px', '0'],
    w: ['-180px', '0'],
  }[position];
  return (
    <div className={`river river--${position}`}>
      {tag}
      {shown.map((k, i) => (
        <Tile
          key={`${k}-${i}-${tiles.length}`}
          k={k}
          staticSize
          className={[
            i === shown.length - 1 ? 'tile--last' : '',
            pending && pending.from === seat && i === shown.length - 1 ? 'tile--claimable' : '',
          ].filter(Boolean).join(' ')}
          title={kind(k).label}
        />
      ))}
      <style>{`.river--${position} .tile--last { --from-x: ${from[0]}; --from-y: ${from[1]}; }`}</style>
    </div>
  );
}

/**
 * Why the hand is worth what the meter says.
 *
 * The score is a doubling of named patterns, and the only explanation lived in a
 * `title` — invisible on a phone. This states each line, whether it is banked or
 * one tile off, and what the table needs to let you declare.
 */
function FanSheet({
  lines,
  fan,
  minFan,
  onClose,
}: {
  lines: FanLine[];
  fan: number;
  minFan: number;
  onClose: () => void;
}) {
  const ref = useDialog(onClose);
  const have = Math.round(fan);
  return (
    <div
      className="modal-scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card fansheet" ref={ref} role="dialog" aria-modal="true" aria-label="What this hand scores">
        <div className="row row--between">
          <h2 className="card-label">What this hand scores</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <IconClose size={14} />
          </button>
        </div>
        {lines.length === 0 ? (
          <p className="fansheet__lead">
            Nothing is doubling yet. A single suit, a dragon pung or your own wind each add one.
          </p>
        ) : (
          <>
            <p className="fansheet__lead">
              Fan {have} · worth ×{Math.pow(2, have)} today.
            </p>
            <ul className="fanlist">
              {lines.map((l, i) => (
                <li key={`${l.label}-${i}`} className={l.ready ? 'is-ready' : ''}>
                  <span className="fanlist__mark" aria-hidden="true">
                    {l.ready ? '◆' : '◇'}
                  </span>
                  <span className="grow">{l.label}</span>
                  {/* the double it is worth when the line completes: a half-finished
                      dragon gives +1 of the estimate, not "0.45 doubles" */}
                  <span className="fanlist__val">+{l.value >= 1 ? l.value : 1}</span>
                </li>
              ))}
            </ul>
            {/* A ◇ row is not worth nothing: a dragon pair already counts part of
                a double toward the meter, which is why Fan 2 can be true while only
                one row is completed. Saying "one tile away" hid that and made the
                arithmetic wrong — so the legend says what the dots mean. */}
            <p className="fanlist__key">◆ counts in full · ◇ counts part-way</p>
          </>
        )}
        <p className="fansheet__foot">
          {minFan > 0
            ? have >= minFan
              ? `Table minimum is ${minFan} doubles — you clear it.`
              : `Table minimum is ${minFan} doubles — ${minFan - have} to go.`
            : 'Any completed hand can be declared.'}
        </p>
      </div>
    </div>
  );
}

function FanMeter({ value, onOpen }: { value: number; onOpen: () => void }) {
  const have = Math.max(0, Math.min(4, Math.round(value)));
  return (
    <button
      type="button"
      className="fanmeter"
      onClick={onOpen}
      aria-label={`Fan ${have}, worth x${Math.pow(2, have)} — show what this hand is scoring`}
      title="Doubles this shape is heading for — tap to see which"
    >
      <span style={{ letterSpacing: '.14em' }}>fan</span>
      <span className="fanmeter__pips">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`fanmeter__pip ${i < have ? 'is-on' : ''}`} />
        ))}
      </span>
      <span style={{ color: have > 0 ? 'var(--gold)' : undefined, fontVariantNumeric: 'tabular-nums' }}>
        ×{Math.pow(2, have)}
      </span>
    </button>
  );
}

export { spriteUrl, claimOptions };
