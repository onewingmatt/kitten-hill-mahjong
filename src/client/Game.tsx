import React from 'react';
import { useStore, HUMAN, seatWind, humanClaims, humanKongs, humanCanWin, handView } from './store';
import { Tile, TileBack, Melds, Flowers } from './components/Tile';
import { CatFace, CatPaw } from './cat';
import { estimateFan } from '../engine/bots/fan-estimate';
import { countsOf } from '../engine/shanten';
import { afterEachDiscard, blockByKind, decompose, describe as describeShape, distanceToReady } from '../engine/shape';
import { kind, spriteUrl } from '../engine/tiles';
import { ResultOverlay } from './screens/Result';
import { Coach } from './screens/Coach';
import { PlayerSheet } from './screens/PlayerSheet';
import { Wash } from './screens/Wash';
import { claimOptions, currentWaits } from '../engine/game';
import { LogSheet } from './screens/LogSheet';
import { sfx } from './audio';
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
    coachSeen,
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

  if (!game) return null;

  const myHand = game.seats[mySeat].hand;
  const myTurn = game.phase === 'discard' && game.turn === mySeat;
  const ended = game.phase === 'ended';
  const myWind = seatWind(mySeat, dealer);
  const myFan = estimateFan(countsOf(myHand), game.seats[mySeat].melds, myWind, game.roundWind);
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

  const onPointerDown = (e: React.PointerEvent, i: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
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
        onLeave={leave}
        wind={myWind}
        wall={game.wall.length}
      />

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
            <div className="wall__count">{game.wall.length}</div>
            <div className="wall__label">left</div>
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

          <FanMeter value={myFan} />
        </div>

        <div className="row" style={{ minHeight: 22 }}>
          <Melds melds={game.seats[mySeat].melds} />
          <div className="grow" />
          <div className="segmented" role="group" aria-label="Sort hand">
            {(['manual', 'suit', 'rank', 'sets'] as const).map((m) => (
              <button key={m} className={sortMode === m ? 'is-on' : ''} onClick={() => setSort(m)}>
                {m === 'manual' ? 'Mine' : m === 'suit' ? 'Suit' : m === 'rank' ? 'Rank' : 'Sets'}
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
              />
            );
          })}
          {drawn && (
            <Tile
              k={drawn.k}
              className="tile--held tile--ranked"
              style={{ zIndex: 61 }}
              drawn
              raised={selected === drawn.i}
              onPointerDown={(e) => onPointerDown(e, drawn!.i)}
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
                    aria-label={groupKept ? 'Unmark these tiles' : 'Mark these tiles safe'}
                    title={groupKept ? 'Unmark — allow discarding' : 'Mark safe — cannot be discarded'}
                  >
                    {focusBlock ? (
                      focusBlock.tiles.slice(0, 4).map((k2, n) => <img key={n} className="wait-tile" src={spriteUrl(k2)} alt="" />)
                    ) : (
                      <img className="wait-tile" src={spriteUrl(focusKind!)} alt="" />
                    )}
                    <IconLock size={12} className="shape-tiles__lock" />
                  </button>
                )}
                <span className={`seat__meta shape-line${raisedKept ? ' is-kept' : ''}`}>
                  {selected === null
                    ? 'Tap a tile to raise it'
                    : raisedKept
                      ? 'safe · tap again to unmark'
                      : focusLine ?? 'tap again to discard'}
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

      {washing && <Wash seats={seats} />}
      {coachSeen ? null : <Coach />}
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
      <span className="chip">
        <b>Hand {handNo}</b>
        <span style={{ opacity: 0.5 }}>to {target}</span>
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
        <IconExpand size={11} />
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

function FanMeter({ value }: { value: number }) {
  const have = Math.max(0, Math.min(4, Math.round(value)));
  return (
    <div className="fanmeter" title="Doubles this shape is heading for — each one doubles the hand value">
      <span style={{ letterSpacing: '.14em' }}>fan</span>
      <span className="fanmeter__pips">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`fanmeter__pip ${i < have ? 'is-on' : ''}`} />
        ))}
      </span>
      <span style={{ color: have > 0 ? 'var(--gold)' : undefined, fontVariantNumeric: 'tabular-nums' }}>
        ×{Math.pow(2, have)}
      </span>
    </div>
  );
}

export { spriteUrl, claimOptions };
