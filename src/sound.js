/**
 * Procedural SFX via Web Audio API (no asset files).
 * Mute preference persists in localStorage.
 */

const STORAGE_KEY = 'avatar-chess-mute-v1';

let ctx = null;
let master = null;
let muted = loadMuted();

function loadMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistMuted() {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(ctx.destination);
  return ctx;
}

/** Call from any user gesture so browsers allow audio. */
export function unlockAudio() {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
}

export function isMuted() {
  return muted;
}

export function setMuted(next) {
  muted = !!next;
  persistMuted();
  unlockAudio();
  if (master) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(muted ? 0 : 0.55, now, 0.03);
  }
  return muted;
}

export function toggleMute() {
  return setMuted(!muted);
}

function tone({
  type = 'sine',
  freq = 440,
  freqEnd = null,
  duration = 0.12,
  gain = 0.2,
  delay = 0,
  attack = 0.008,
  release = 0.06,
}) {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  if (c.state === 'suspended') c.resume().catch(() => {});

  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, duration - release));
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noiseBurst({ duration = 0.08, gain = 0.12, delay = 0, filterFreq = 1800 }) {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  if (c.state === 'suspended') c.resume().catch(() => {});

  const n = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, n, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);

  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

export const sfx = {
  ui() {
    tone({ type: 'triangle', freq: 720, freqEnd: 540, duration: 0.07, gain: 0.08 });
  },
  select() {
    tone({ type: 'sine', freq: 520, freqEnd: 680, duration: 0.08, gain: 0.1 });
  },
  move() {
    tone({ type: 'triangle', freq: 280, freqEnd: 190, duration: 0.16, gain: 0.14 });
    tone({ type: 'sine', freq: 420, freqEnd: 300, duration: 0.12, gain: 0.06, delay: 0.02 });
  },
  capture() {
    noiseBurst({ duration: 0.1, gain: 0.16, filterFreq: 900 });
    tone({ type: 'square', freq: 220, freqEnd: 90, duration: 0.18, gain: 0.1, delay: 0.01 });
    tone({ type: 'sine', freq: 540, freqEnd: 180, duration: 0.14, gain: 0.08, delay: 0.04 });
  },
  eliminate() {
    noiseBurst({ duration: 0.18, gain: 0.2, filterFreq: 700 });
    tone({ type: 'sawtooth', freq: 160, freqEnd: 55, duration: 0.32, gain: 0.12 });
    tone({ type: 'triangle', freq: 660, freqEnd: 220, duration: 0.28, gain: 0.09, delay: 0.05 });
    tone({ type: 'sine', freq: 880, freqEnd: 440, duration: 0.35, gain: 0.07, delay: 0.12 });
  },
  tick() {
    tone({ type: 'square', freq: 880, duration: 0.04, gain: 0.05 });
  },
  achieve() {
    tone({ type: 'triangle', freq: 523, duration: 0.14, gain: 0.1 });
    tone({ type: 'sine', freq: 659, duration: 0.16, gain: 0.08, delay: 0.08 });
    tone({ type: 'triangle', freq: 784, duration: 0.22, gain: 0.1, delay: 0.16 });
  },
  powerSwitch() {
    // Soft arcane swell
    tone({ type: 'sine', freq: 180, freqEnd: 360, duration: 0.35, gain: 0.1 });
    tone({ type: 'triangle', freq: 360, freqEnd: 720, duration: 0.4, gain: 0.08, delay: 0.05 });
    tone({ type: 'sine', freq: 540, freqEnd: 270, duration: 0.45, gain: 0.07, delay: 0.18 });
    noiseBurst({ duration: 0.22, gain: 0.06, delay: 0.12, filterFreq: 2400 });
  },
  morph() {
    tone({ type: 'sine', freq: 300, freqEnd: 480, duration: 0.2, gain: 0.09 });
    tone({ type: 'triangle', freq: 480, freqEnd: 360, duration: 0.18, gain: 0.06, delay: 0.06 });
  },
  win() {
    const notes = [392, 494, 587, 784, 988];
    notes.forEach((f, i) => {
      tone({ type: 'triangle', freq: f, duration: 0.32, gain: 0.13, delay: i * 0.11 });
      tone({ type: 'sine', freq: f * 2, duration: 0.26, gain: 0.05, delay: i * 0.11 + 0.02 });
    });
    noiseBurst({ duration: 0.25, gain: 0.08, delay: 0.35, filterFreq: 2200 });
  },
};
