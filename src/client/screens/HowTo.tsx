import React from 'react';
import { useStore } from '../store';
import { Tile } from '../components/Tile';

/* Kind indices: d/b/c 1-9 are 0-26, East/South/West/North 27-30,
   Red/Green/White dragons 31-33, flowers 34-37, seasons 38-41. */
const D = (n: number) => n - 1;            // dot n
const B = (n: number) => 9 + n - 1;        // bamboo n
const C = (n: number) => 18 + n - 1;       // characters n
const EAST = 27;
const RED = 31;
const GREEN = 32;

/** A run of face-up tiles at reference size. */
function Strip({ tiles, size = 26 }: { tiles: number[]; size?: number }) {
  return (
    <span className="howto__strip">
      {tiles.map((k, i) => (
        <Tile key={`${k}-${i}`} k={k} staticSize style={{ width: size }} />
      ))}
    </span>
  );
}

/** One illustrated group: the tiles, what it is called, why it counts. */
function Group({ tiles, label, note }: { tiles: number[]; label: string; note: string }) {
  return (
    <div className="howto__group">
      <Strip tiles={tiles} />
      <span className="howto__group-label">{label}</span>
      <span className="howto__group-note">{note}</span>
    </div>
  );
}

interface Section {
  title: string;
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    title: 'The tiles',
    body: (
      <>
        <p>
          Three suits numbered 1 to 9 — dots, bamboo, characters — plus four winds and three dragons.
          Four copies of every kind, 136 in all, so whatever a cat throws there is a good chance you
          hold its partner.
        </p>
        <div className="howto__fig">
          <Strip tiles={[D(1), D(5), D(9), B(3), C(7), EAST, RED]} />
        </div>
        <p className="howto__aside">
          Dots · bamboo · characters · winds · dragons. The eight flowers are never part of a hand.
        </p>
      </>
    ),
  },
  {
    title: 'The goal',
    body: (
      <>
        <p>
          Four sets and one pair — fourteen tiles. You hold thirteen, and the fourteenth finishes you:
          draw it, or take it from a discard.
        </p>
        <div className="howto__fig">
          <Strip tiles={[D(1), D(2), D(3), B(4), B(5), B(6), C(7), C(8), C(9), RED, RED, RED, EAST, EAST]} size={19} />
        </div>
        <p className="howto__aside">Four sets · one pair</p>
        <p>
          Any complete hand can be declared by default — a scrappy win still wins. Options can set a
          table minimum of 1 to 3 fan, and then a hand must be worth at least that to be called.
          If the wall runs out first, the hand is a draw and nobody wins it.
        </p>
        <p>
          A match is a single hand, or first to 2 or 3 wins; you pick that on the menu.
        </p>
      </>
    ),
  },
  {
    title: 'What a hand is made of',
    body: (
      <>
        <div className="howto__groups">
          <Group tiles={[B(4), B(5), B(6)]} label="Run" note="three in a row, one suit" />
          <Group tiles={[RED, RED, RED]} label="Pung" note="three of a kind" />
        </div>
        <div className="howto__groups">
          <Group tiles={[D(5), D(5), D(5), D(5)]} label="Kong" note="four of a kind" />
          <Group tiles={[EAST, EAST]} label="Pair" note="one pair, and only one" />
        </div>
        <p>
          A kong is still worth one set, so you draw a replacement tile and keep playing. You can
          kong from a discard, from four in your own rack, or by adding the fourth tile to a pung you
          already laid down.
        </p>
      </>
    ),
  },
  {
    title: 'Your turn',
    body: (
      <>
        <p>
          Draw a tile, then throw one away. <b>Tap a tile to raise it, tap it again to throw it</b> —
          the raised tile names the set it would belong to and says how close the hand is to
          finished.
        </p>
        <ul className="howto__list">
          <li>Drag a tile sideways, or up a row, to arrange the rack however you read it best.</li>
          <li>Only you see your rack. Thrown tiles go face up into the river in front of you.</li>
          <li>The count in the middle of the table is how many tiles are left to draw.</li>
        </ul>
      </>
    ),
  },
  {
    title: 'Calling a discard',
    body: (
      <>
        <p>
          When a cat throws a tile that suits you, a bar appears over the table with the calls you
          can make. Take one, or pass. The offer is timed — leave it alone and it passes for you.
        </p>
        <ul className="howto__list">
          <li>
            <b>Mahjong</b> — that tile completes your hand. Nothing beats it.
          </li>
          <li>
            <b>Pung or kong</b> — you already hold two or three of it.
          </li>
          <li>
            <b>Chi</b> — a run through it. Only the cat who plays just before you may chi, and only
            from the tile they throw.
          </li>
        </ul>
        <p className="howto__aside">
          Priority runs mahjong, then kong or pung, then chi. A claimed tile is laid face up beside
          your rack, and every cat can see it.
        </p>
      </>
    ),
  },
  {
    title: 'Flowers',
    body: (
      <>
        <p>
          Eight tiles are bonus tiles: four flowers and four seasons. One arrives instead of a
          playing tile now and then. It never sits in your rack — it is set aside and you replace it
          from the back of the wall.
        </p>
        <div className="howto__fig">
          <Strip tiles={[34, 35, 36, 37]} />
        </div>
        <p className="howto__aside">
          The four flowers. Four seasons work the same way. They cost you nothing: drawing the pair
          that matches your seat is a fan. Collect all four of either and it is three.
        </p>
      </>
    ),
  },
  {
    title: 'What a hand is worth',
    body: (
      <>
        <p>
          A hand's worth is counted in fan — one fan per double, and a plain hand is 0 fan. A dragon
          pung makes it 1; your own seat wind, a hand in a single suit, or the pair of flowers that
          matches your seat each add another.
        </p>
        <ul className="howto__list">
          <li>Nothing changes hands. No points, no payouts, no running total to watch.</li>
          <li>The match is decided by hands won — first to 2 or 3, or a single hand.</li>
          <li>
            The dock's <b>fan</b> line shows what the shape in your hand is heading for. Tap it for
            the line-by-line breakdown.
          </li>
        </ul>
        <div className="howto__stats">
          <div>
            <span>0</span>
            <small>fan for a plain hand</small>
          </div>
          <div>
            <span>+1</span>
            <small>per double</small>
          </div>
          <div>
            <span>wins</span>
            <small>decide the match</small>
          </div>
        </div>
      </>
    ),
  },
  {
    title: 'Advanced: a minimum to win',
    body: (
      <>
        <p>
          Options → <b>Minimum fan to win</b> puts a minimum on the table: 1, 2 or 3 fan. A hand
          worth fewer fan than that cannot be declared, so a ready hand on 1 fan is not a win at a
          2-fan table.
        </p>
        <ul className="howto__list">
          <li>
            The default is <b>None</b> — any complete hand can be declared, which is how the game
            ships.
          </li>
          <li>
            The cats play to the same minimum: they chase the doubles a gated table needs instead of
            locking a hand they could never call.
          </li>
          <li>Expect more drawn hands. At 3 fan most hands run out of wall before anyone qualifies.</li>
        </ul>
        <p className="howto__aside">Applies to the next match you start — online included.</p>
      </>
    ),
  },
  {
    title: 'The strip under your rack',
    body: (
      <>
        <p>
          Everything you need mid-hand sits in one line under your tiles. Nothing there is
          decoration.
        </p>
        <ul className="howto__list">
          <li>
            <b>4 away</b> or <b>→ ready</b> — how many tiles from a finished hand, and what the tile
            you raised would leave you needing.
          </li>
          <li>
            <b>fan 2</b> — what the hand is worth right now. Tap it for the line-by-line
            breakdown.
          </li>
          <li>
            <b>safe</b> — marks a tile, and every copy of it, so a stray tap cannot throw it.
          </li>
          <li>
            <b>My order · By suit · Hand shape</b> — the sort row. Your own order is the default,
            and it comes back when you leave the other views.
          </li>
        </ul>
      </>
    ),
  },
];

/** The full rules, in reading order. A player reaches this from the menu foot. */
export function HowTo() {
  const close = useStore((s) => s.closeHowTo);
  const scroller = React.useRef<HTMLDivElement | null>(null);

  return (
    <div className="screen screen--howto">
      <div className="row row--between howto__head">
        <button className="btn btn--ghost btn--sm" onClick={close}>
          ‹ Back
        </button>
        <span className="hud__sub">How to play</span>
      </div>

      <div className="grow howto__scroll" ref={scroller}>
        <p className="howto__lead">
          Four cats, one wall, no teams. Build four sets and a pair before anyone else does.
        </p>
        {SECTIONS.map((s, i) => (
          <section className="card howto__card" key={s.title} aria-labelledby={`howto-${i}`}>
            <h2 className="howto__title" id={`howto-${i}`}>
              <span className="howto__num" aria-hidden="true">
                {i + 1}
              </span>
              {s.title}
            </h2>
            {s.body}
          </section>
        ))}
        <p className="howto__foot-note">That is the whole game. The rest is reading the table.</p>
      </div>

      <div className="howto__footer">
        <button className="btn btn--primary howto__done" onClick={close}>
          Got it
        </button>
      </div>
    </div>
  );
}
