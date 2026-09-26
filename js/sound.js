import { load, save } from './store.js';

let enabled = load('csg:sound', true);
let ctx = null;

export const soundOn = () => enabled;

export function setSound(on) {
  enabled = on;
  save('csg:sound', on);
}

function audio() {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
    return null;
  }
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    ctx = new AC();
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
    return null;
  }
  return ctx;
}

function tone({ freq, to, dur, type = 'sine', gain = 0.05, delay = 0 }) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

const play =
  (fn) =>
  (...args) => {
    if (!enabled || document.hidden) return;
    try {
      fn(...args);
    } catch {}
  };

export const sfx = {
  tap: play(() => tone({ freq: 1100, to: 700, dur: 0.045, gain: 0.03 })),
  copy: play(() => {
    tone({ freq: 880, dur: 0.07, type: 'triangle', gain: 0.05 });
    tone({ freq: 1320, dur: 0.12, type: 'triangle', gain: 0.05, delay: 0.06 });
  }),
  lock: play((on) =>
    tone({
      freq: on ? 520 : 390,
      to: on ? 360 : 560,
      dur: 0.08,
      type: 'square',
      gain: 0.018,
    }),
  ),
  shuffle: play(() => {
    [0, 1, 2, 3, 4].forEach((i) => {
      tone({
        freq: 480 * 2 ** ((i * 3) / 12),
        dur: 0.07,
        type: 'triangle',
        gain: 0.035,
        delay: i * 0.03,
      });
    });
  }),
  error: play(() =>
    tone({ freq: 240, to: 160, dur: 0.22, type: 'square', gain: 0.02 }),
  ),
};
