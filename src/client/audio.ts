/**
 * Tiny synthesised sound kit — tile clacks, papery draws, a chime for calls and
 * a rising phrase for a win. Everything is generated, nothing is downloaded, and
 * it stays silent until the first user gesture (browser autoplay rules).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.34;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setMuted(v: boolean): void {
  muted = v;
  if (master && ctx) master.gain.setTargetAtTime(v ? 0 : 0.34, ctx.currentTime, 0.02);
}

export function unlockAudio(): void {
  ensure();
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  return buf;
}

function clack(freq: number, gain: number, dur: number, type: OscillatorType = 'triangle'): void {
  const ac = ensure();
  if (!ac || muted || !master) return;
  const t = ac.currentTime;

  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);

  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, Math.min(0.06, dur));
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq * 4;
  bp.Q.value = 1.4;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(gain * 0.5, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.8);
  src.connect(bp).connect(ng).connect(master);
  src.start(t);
}

function tone(freq: number, when: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
  const ac = ensure();
  if (!ac || muted || !master) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

export const sfx = {
  select: () => clack(520, 0.05, 0.05, 'square'),
  discard: () => clack(300, 0.14, 0.09),
  draw: () => clack(180, 0.07, 0.12, 'sine'),
  claim: () => {
    tone(660, 0, 0.16, 0.1, 'triangle');
    tone(990, 0.05, 0.2, 0.07, 'sine');
  },
  pass: () => clack(220, 0.05, 0.06, 'sine'),
  kong: () => {
    tone(440, 0, 0.2, 0.1, 'triangle');
    tone(587, 0.06, 0.24, 0.08, 'triangle');
  },
  win: () => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => tone(n, i * 0.09, 0.5, 0.09, 'sine'));
    notes.forEach((n, i) => tone(n * 2, i * 0.09 + 0.02, 0.3, 0.03, 'triangle'));
  },
  lose: () => {
    tone(392, 0, 0.3, 0.08, 'sine');
    tone(311, 0.12, 0.4, 0.07, 'sine');
  },
  ui: () => clack(880, 0.04, 0.04, 'sine'),
  /** the wash: a scatter of tile clacks over two seconds */
  wash: () => {
    for (let i = 0; i < 16; i++) {
      window.setTimeout(() => {
        clack(130 + Math.random() * 190, 0.05, 0.035 + Math.random() * 0.045);
      }, i * 105 + Math.random() * 45);
    }
  },
};
