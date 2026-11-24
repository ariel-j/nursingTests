// Light / dark switch: applies the saved mode to <html data-theme> and tells the UIs (the site bar
// button, the accessibility panel) when it changes. "auto" removes the attribute so the CSS follows
// the device. css/style.css and the other sheets already carry the light and dark token sets.
import { load, save } from './storage.js';
import { THEME_KEY, normalizeTheme, themeAttribute } from './theme-core.js';

export const THEME_EVENT = 'themechange';

let mode = normalizeTheme(load(THEME_KEY));

function apply() {
  const attr = themeAttribute(mode);
  if (attr) document.documentElement.setAttribute('data-theme', attr);
  else document.documentElement.removeAttribute('data-theme');
}

apply();

export const getTheme = () => mode;

export function setTheme(next) {
  mode = normalizeTheme(next);
  apply();
  save(THEME_KEY, mode);
  document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: mode }));
}

/** Calls `fn(mode)` now and on every change (from this page's UIs or another tab). */
export function onTheme(fn) {
  fn(mode);
  document.addEventListener(THEME_EVENT, (e) => fn(e.detail));
}

// Another tab changed it: follow.
window.addEventListener('storage', (e) => {
  if (e.key !== 'anatomy-quizzes:v1:' + THEME_KEY) return;
  let next = 'auto';
  try { next = normalizeTheme(JSON.parse(e.newValue)); } catch { /* removed or unreadable: auto */ }
  mode = next;
  apply();
  document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: mode }));
});
