// Sound, vibration and confetti for the memory game. All of it is optional: sound and vibration are
// off until the player turns them on, and nothing animates when motion is stopped.
import { el, motionAllowed } from './memory-dom.js';

let enabled = false;
let audio = null;

export function setEffects(on) {
  enabled = on;
}

function context() {
  if (!audio) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      audio = new Ctor();
    } catch {
      return null;
    }
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}

function tone(ctx, freq, at, length, type = 'sine', volume = 0.12) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

// Notes of a major scale in Hz, so combos climb the scale.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

const SOUNDS = {
  flip: (ctx) => tone(ctx, 330, 0, 0.06, 'triangle', 0.07),
  match: (ctx, n = 1) => {
    const base = SCALE[Math.min(n, SCALE.length) - 1];
    tone(ctx, base, 0, 0.14, 'triangle');
    tone(ctx, base * 1.5, 0.09, 0.22, 'triangle');
  },
  miss: (ctx) => {
    tone(ctx, 196, 0, 0.18, 'sawtooth', 0.06);
    tone(ctx, 147, 0.1, 0.24, 'sawtooth', 0.06);
  },
  star: (ctx, n = 1) => tone(ctx, SCALE[Math.min(n, 3) + 1], 0, 0.3, 'triangle', 0.14),
  win: (ctx) => SCALE.slice(0, 5).forEach((f, i) => tone(ctx, f, i * 0.1, 0.35, 'triangle')),
  level: (ctx) => [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(ctx, f, i * 0.11, 0.4, 'square', 0.07)),
};

export function sound(name, arg) {
  if (!enabled) return;
  const ctx = context();
  if (ctx) SOUNDS[name](ctx, arg);
}

export function vibrate(pattern) {
  if (enabled && navigator.vibrate) navigator.vibrate(pattern);
}

const COLORS = ['#c0263a', '#f2b134', '#2b59c3', '#1d9b61', '#e8618c', '#7a4fd1'];

/** One burst of confetti over the page; removes itself when done. */
export function confetti(amount = 140) {
  if (!motionAllowed()) return;
  const canvas = el('canvas', 'confetti');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.append(canvas);
  const g = canvas.getContext('2d');
  if (!g) {
    canvas.remove();
    return;
  }
  const pieces = Array.from({ length: amount }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.3,
    y: canvas.height * 0.45,
    vx: (Math.random() - 0.5) * 14,
    vy: -6 - Math.random() * 10,
    size: 6 + Math.random() * 6,
    angle: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.globalAlpha = Math.max(0, 1 - t / 3200);
    for (const p of pieces) {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.angle);
      g.fillStyle = p.color;
      g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      g.restore();
    }
    if (t < 3200) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
