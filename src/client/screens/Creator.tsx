import React from 'react';
import {
  ACCESSORIES,
  COLLARS,
  CatAppearance,
  CatFace,
  EYE_COLORS,
  EYE_STYLES,
  EyeStyle,
  FUR_COLORS,
  HAIRS,
  HairId,
  PATTERNS,
  PATTERN_COLORS,
  PatternId,
  defaultCat,
} from '../cat';
import { personalityFromStats } from '../stats';
import { useStore } from '../store';
import { sfx } from '../audio';

const CAT_NAMES = [
  'Biscuit', 'Marmalade', 'Toast', 'Pebble', 'Nori', 'Clementine', 'Miso', 'Hazel',
  'Pumpkin', 'Sable', 'Pickle', 'Waffle', 'Clove', 'Fig', 'Mochi', 'Taro', 'Olive', 'Poppy',
];

export function Creator() {
  const { profile, saveProfile, go, stats } = useStore();
  const [cat, setCat] = React.useState<CatAppearance>(profile?.cat ?? defaultCat(Math.floor(Math.random() * 999)));
  const [name, setName] = React.useState(profile?.name ?? CAT_NAMES[Math.floor(Math.random() * CAT_NAMES.length)]);
  /** a name the player typed is theirs: "Surprise me" must not overwrite it */
  const [nameTouched, setNameTouched] = React.useState(false);
  /** remembered so the collar toggle can put the colour back */
  const [lastCollar, setLastCollar] = React.useState<string>(profile?.cat?.collar ?? COLLARS[0] ?? '#2f8f7f');

  const patch = (p: Partial<CatAppearance>) => {
    sfx.ui();
    setCat((c) => ({ ...c, ...p }));
  };

  const randomise = () => {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    sfx.ui();
    setCat({
      fur: pick(FUR_COLORS),
      patternColor: pick(PATTERN_COLORS),
      pattern: pick(PATTERNS).id,
      eyes: pick(EYE_COLORS),
      eyeStyle: pick(EYE_STYLES).id,
      size: 0.9 + Math.random() * 0.2,
      weight: 0.75 + Math.random() * 0.5,
      earSize: 0.85 + Math.random() * 0.3,
      collar: pick(COLLARS),
      accessory: pick(ACCESSORIES).id,
      hair: pick(HAIRS).id,
      seed: Math.floor(Math.random() * 9999),
    });
    // a generated name is a placeholder; a typed one is a decision
    if (!nameTouched) setName(pick(CAT_NAMES));
  };

  const save = () => {
    sfx.claim();
    // the play-style is measured at the table, never chosen here — the profile
    // carries whatever the stats say today so a shared code starts honest
    saveProfile({ name: name.trim() || 'Cat', cat, personality: personalityFromStats(stats) });
  };

  return (
    <div className="screen screen--creator">
      <div className="row row--between creator__head">
        <button className="btn btn--ghost btn--sm" onClick={() => go('menu')}>‹ Back</button>
        <span className="hud__sub">Your cat</span>
        <button className="btn btn--ghost btn--sm" onClick={randomise}>Surprise me</button>
      </div>

      <div className="creator__stage">
        <CatFace cat={cat} className="catface" />
      </div>

      <label className="creator__name">
        <span>Name</span>
        <input
          value={name}
          maxLength={14}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
          placeholder="Name your cat"
          aria-label="Cat name"
        />
      </label>

      <div className="grow creator__scroll">
        <div className="card creator">
          <h2>Coat</h2>
          <div className="swatches">
            {FUR_COLORS.map((c) => (
              <button
                key={c}
                className={`swatch ${cat.fur === c ? 'is-on' : ''}`}
                style={{ background: c }}
                aria-label={`fur ${c}`}
                aria-pressed={cat.fur === c}
                onClick={() => patch({ fur: c })}
              />
            ))}
          </div>

          <div className="creator__field">
            <h3>Pattern</h3>
            <div className="pills">
              {PATTERNS.map((p) => (
                <button
                  key={p.id}
                  className={`pill ${cat.pattern === p.id ? 'is-on' : ''}`}
                  aria-pressed={cat.pattern === p.id}
                  onClick={() => patch({ pattern: p.id as PatternId })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="creator__field">
            <h3>Hair</h3>
            <div className="pills">
              {HAIRS.map((h) => (
                <button
                  key={h.id}
                  className={`pill ${(cat.hair ?? 'none') === h.id ? 'is-on' : ''}`}
                  aria-pressed={(cat.hair ?? 'none') === h.id}
                  onClick={() => patch({ hair: h.id as HairId })}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          {/* a solid coat has no second colour to pick */}
          {cat.pattern !== 'solid' && (
            <div className="creator__field">
              <h3>Pattern colour</h3>
              <div className="swatches">
                {PATTERN_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${cat.patternColor === c ? 'is-on' : ''}`}
                    style={{ background: c }}
                    aria-label={`pattern ${c}`}
                    aria-pressed={cat.patternColor === c}
                    onClick={() => patch({ patternColor: c })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card creator">
          <h2>Eyes</h2>
          <div className="swatches">
            {EYE_COLORS.map((c) => (
              <button
                key={c}
                className={`swatch ${cat.eyes === c ? 'is-on' : ''}`}
                style={{ background: c }}
                aria-label={`eyes ${c}`}
                aria-pressed={cat.eyes === c}
                onClick={() => patch({ eyes: c })}
              />
            ))}
          </div>
          <div className="creator__field">
            <h3>Shape</h3>
            <div className="pills">
              {EYE_STYLES.map((e) => (
                <button
                  key={e.id}
                  className={`pill ${cat.eyeStyle === e.id ? 'is-on' : ''}`}
                  aria-pressed={cat.eyeStyle === e.id}
                  onClick={() => patch({ eyeStyle: e.id as EyeStyle })}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card creator">
          <h2>Build</h2>
          <Slider
            label="Size"
            value={cat.size}
            min={0.85}
            max={1.15}
            word={cat.size < 0.95 ? 'Small' : cat.size > 1.05 ? 'Big' : 'Medium'}
            onChange={(v) => patch({ size: v })}
          />
          <Slider
            label="Chonk"
            value={cat.weight}
            min={0.7}
            max={1.3}
            word={cat.weight < 0.92 ? 'Slim' : cat.weight > 1.08 ? 'Round' : 'Average'}
            onChange={(v) => patch({ weight: v })}
          />
          <Slider
            label="Ears"
            value={cat.earSize}
            min={0.8}
            max={1.2}
            word={cat.earSize < 0.95 ? 'Tucked' : cat.earSize > 1.05 ? 'Tall' : 'Normal'}
            onChange={(v) => patch({ earSize: v })}
          />
        </div>

        <div className="card creator">
          <div className="row row--between">
            <h2>Collar</h2>
            <div className="segmented" role="group" aria-label="Collar">
              <button
                className={cat.collar ? '' : 'is-on'}
                aria-pressed={!cat.collar}
                onClick={() => {
                  if (cat.collar) setLastCollar(cat.collar);
                  patch({ collar: null });
                }}
              >
                Off
              </button>
              <button
                className={cat.collar ? 'is-on' : ''}
                aria-pressed={!!cat.collar}
                onClick={() => patch({ collar: cat.collar ?? lastCollar })}
              >
                On
              </button>
            </div>
          </div>

          {cat.collar ? (
            <div className="swatches">
              {COLLARS.filter(Boolean).map((c) => (
                <button
                  key={c}
                  className={`swatch ${cat.collar === c ? 'is-on' : ''}`}
                  style={{ background: c! }}
                  aria-label={`collar ${c}`}
                  aria-pressed={cat.collar === c}
                  onClick={() => {
                    setLastCollar(c!);
                    patch({ collar: c });
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="creator__hint">Bare neck. Charms still show.</p>
          )}

          <div className="creator__field">
            <h3>Charm</h3>
            <div className="pills">
              {ACCESSORIES.map((a) => (
                <button
                  key={a.id}
                  className={`pill ${cat.accessory === a.id ? 'is-on' : ''}`}
                  aria-pressed={cat.accessory === a.id}
                  onClick={() => patch({ accessory: a.id })}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: 4 }} />
      </div>

      <div className="creator__footer">
        <button className="btn btn--primary creator__save" onClick={save}>
          Save cat
        </button>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  word,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  word: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider">
      <label>
        {label}
        <span className="slider__word">{word}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
