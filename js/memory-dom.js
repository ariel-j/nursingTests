// Small DOM helpers for the memory game. Content is always set with textContent, never innerHTML.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Latin drug names inside Hebrew text: isolate them and keep them left-to-right. */
export function drugName(name, tag = 'bdi') {
  const node = el(tag, 'drug-name', name);
  node.lang = 'en';
  node.dir = 'ltr';
  return node;
}

export function clear(node) {
  node.replaceChildren();
}

/** Today as a local 'YYYY-MM-DD' string. */
export function todayString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Keeps signs and multiplication marks (+150, ×2) in order inside right-to-left text. */
export const ltr = (text) => `\u2066${text}\u2069`;

export const formatNumber = (n) => Math.round(n).toLocaleString('he-IL');

export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Same rules the stylesheet uses to stop motion: the site toolbar and the OS setting. */
export function motionAllowed() {
  return document.documentElement.dataset.motion !== 'off'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Counts a number up inside `node` (or sets it at once when motion is off). */
export function countUp(node, to, ms = 900, from = 0) {
  if (!motionAllowed() || to === from) {
    node.textContent = formatNumber(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    node.textContent = formatNumber(from + (to - from) * (1 - (1 - t) ** 3));
    if (t < 1 && node.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
