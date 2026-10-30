import React from "react";
import { useStore, HUMAN, seatWind } from "../store";
import { CatFace } from "../cat";
import { fortuneFor } from "../fortunes";
import { kind, spriteUrl } from "../../engine/tiles";
import { IconTrophy } from "../components/Icons";
import { useDialog } from "../useDialog";
import { competitionRanks } from "../rank";

const WIND_GLYPH = ["東", "南", "西", "北"];
const CONFETTI_COLORS = [
  "#e8bf74",
  "#38ab93",
  "#e2725b",
  "#6fb8d8",
  "#f8f0e1",
  "#a97fc4",
];

export function ResultOverlay() {
  const {
    game,
    seats,
    scores,
    handWins,
    target,
    matchOver,
    nextHand,
    rematch,
    closeResult,
    leave,
    handNo,
    dealer,
    mySeat,
  } = useStore();
  if (!game) return null;

  const win = game.win;
  const youWon = win?.seat === mySeat;
  const standings = scores
    .map((score, seat) => ({ seat, score, wins: handWins[seat] }))
    .sort((a, b) => b.score - a.score || b.wins - a.wins);

  const ranked = competitionRanks(standings);

  const champion = matchOver ? handWins.findIndex((w) => w >= target) : -1;
  const fortune = win
    ? fortuneFor(win.tile, game.seed + game.handNumber)
    : null;
  const celebrate = matchOver ? champion === mySeat : youWon;

  const headline = matchOver
    ? champion === mySeat
      ? "You take the hill"
      : `${seats[champion]?.name ?? "A cat"} takes the hill`
    : win
      ? youWon
        ? "You win the hand"
        : `${seats[win.seat]?.name ?? "A cat"} wins`
      : "The wall runs dry";

  const subject = win ? win.seat : -1;
  // medals rank the table, so a draw where nobody scored must not hand out
  // gold/silver/bronze next to four identical zeroes
  const tiedTable = standings.every(
    (s) => s.score === standings[0].score && s.wins === standings[0].wins,
  );
  const dialog = useDialog(closeResult);

  return (
    <div className="modal-scrim">
      <div
        className="card"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={win ? `${seats[win.seat]?.name ?? "A cat"} wins the hand` : "The wall runs dry"}
        style={{
          width: "100%",
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span className="result__sub" style={{ textAlign: "center" }}>
          {matchOver ? "Match complete" : `Hand ${handNo} · first to ${target}`}
        </span>

        {/* ---- who won ---- */}
        <div className="result__banner">
          {celebrate && <Confetti />}
          <div className="result__cat">
            {subject >= 0 ? (
              <>
                <CatFace cat={seats[subject]?.cat} />
                {(celebrate || matchOver) && (
                  <span className="result__crown">
                    <IconTrophy size={26} />
                  </span>
                )}
              </>
            ) : (
              // a drawn hand has no winner's cat, and this slot used to hold a
              // 40px middot at 0.35 opacity — a lone grey dot in the middle of
              // the banner. Three face-down tiles say "the wall ran out".
              <span className="result__nowin" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
          <h2 className="result__title" style={{ fontSize: 24 }}>
            {headline}
          </h2>
          {win ? (
            <div className="result__points">
              +{win.score.points}
              <small>
                {win.score.fan} fan ·{" "}
                {win.selfDraw
                  ? "self drawn"
                  : `off ${seats[win.from ?? 0]?.name}`}
              </small>
            </div>
          ) : (
            <div
              className="result__points"
              style={{ fontSize: 22, color: "var(--cream)" }}
            >
              No winner
              <small>nobody completed a hand</small>
            </div>
          )}
          {win && (
            <div className="winhand" aria-label="Winning hand">
              {(() => {
                const shown = game.seats[win.seat].hand
                  .slice()
                  .sort((a, b) => a - b);
                const winningAt = shown.lastIndexOf(win.tile);
                return shown.map((k, i) => (
                  <img
                    key={`${k}-${i}`}
                    className={`winhand__tile ${i === winningAt ? "is-winning" : ""}`}
                    src={spriteUrl(k)}
                    alt={kind(k).label}
                  />
                ));
              })()}
            </div>
          )}
        </div>

        {/* ---- the ledger ---- */}
        {win && (
          <div>
            <h2 className="card-label">How it scored</h2>
            <div className="ledger">
              <div className="ledger__row">
                <span>Base points</span>
                <b>{win.score.miniPoints} pts</b>
              </div>
              {win.score.doubles.map((d, i) => (
                <div className="ledger__row" key={i}>
                  <span>{d.label}</span>
                  <b>×2{d.value > 1 ? ` (${d.value})` : ""}</b>
                </div>
              ))}
              {win.score.doubles.length === 0 && (
                <div className="ledger__row">
                  <span>No doubles — a chicken hand</span>
                  <b>×1</b>
                </div>
              )}
              <div className="ledger__row ledger__row--total">
                <span>Paid by the table</span>
                <b>{win.score.points} pts</b>
              </div>
            </div>
          </div>
        )}

        {/* ---- standings ---- */}
        <div>
          <h2 className="card-label">The table</h2>
          <div className="standings">
            {ranked.map((s) => (
              <div
                key={s.seat}
                className={`standing seat--${s.seat} ${s.seat === subject ? "is-winner" : ""}`}
              >
                {/* Rank is competition rank, so two cats on the same score share a
                    place and the next one skips — and a table where nobody is ahead
                    of anybody shows "=" rather than inventing a podium. */}
                <span
                  className={`medal ${!tiedTable && s.rank <= 3 ? `medal--${s.rank}` : ""}${tiedTable ? " medal--tie" : ""}`}
                  aria-hidden="true"
                >
                  {tiedTable ? "=" : s.rank}
                </span>
                <div className="standing__badge">
                  <CatFace cat={seats[s.seat]?.cat} live={false} />
                </div>
                <div className="standing__name">
                  {seats[s.seat]?.name ?? "Cat"}
                  <span className="standing__tag">
                    {WIND_GLYPH[seatWind(s.seat, dealer)]} · {s.wins}W
                  </span>
                </div>
                <span className="standing__score">
                  {s.score > 0 ? `+${s.score}` : s.score}
                </span>
              </div>
            ))}
          </div>
        </div>

        {fortune && win && (
          <div className="fortune">
            <div className="fortune__label">Fortune of the winning tile</div>
            <h3 className="fortune__title">{fortune.title}</h3>
            <p className="fortune__body">{fortune.body}</p>
          </div>
        )}

        {/* three ways out, on one row: the card used to offer only "stay" and
            "leave", so a finished match left the player on a dead table */}
        <div className="row result__cta" style={{ gap: 8 }}>
          <button
            className="btn btn--primary grow"
            style={{ height: 44, fontSize: 14 }}
            onClick={matchOver ? rematch : nextHand}
          >
            {matchOver ? "Play again" : "Next hand"}
          </button>
          <button
            className="btn btn--ghost"
            style={{ height: 44, padding: "0 12px", fontSize: 12.5 }}
            onClick={closeResult}
          >
            Table
          </button>
          <button
            className="btn btn--ghost"
            style={{ height: 44, padding: "0 12px", fontSize: 12.5 }}
            onClick={leave}
          >
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}

function Confetti() {
  const bits = React.useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => ({
        left: `${(i * 37 + 11) % 100}%`,
        delay: `${(i % 7) * 0.14}s`,
        duration: `${1.9 + ((i * 13) % 10) / 10}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: `${(i * 47) % 360}deg`,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i
          key={i}
          style={{
            left: b.left,
            background: b.color,
            animationDelay: b.delay,
            animationDuration: b.duration,
            transform: `rotate(${b.rotate})`,
          }}
        />
      ))}
    </div>
  );
}
