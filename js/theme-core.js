// Pure logic for the light / dark switch. No DOM, no storage: imported by theme.js and the tests.
// "auto" follows the device setting; "light" and "dark" override it.

export const THEME_MODES = ['auto', 'light', 'dark'];
export const DEFAULT_THEME = 'auto';
export const THEME_KEY = 'theme';

export const THEME_LABELS = { auto: 'אוטומטי', light: 'בהיר', dark: 'כהה' };

/** A saved value as a valid mode; anything unknown (old data, tampering) falls back to auto. */
export function normalizeTheme(value) {
  return THEME_MODES.includes(value) ? value : DEFAULT_THEME;
}

/** The mode after one press of the cycle button: auto → light → dark → auto. */
export function nextTheme(mode) {
  const i = THEME_MODES.indexOf(normalizeTheme(mode));
  return THEME_MODES[(i + 1) % THEME_MODES.length];
}

/** Value of <html data-theme>, or null for auto (no attribute, the CSS follows the device). */
export function themeAttribute(mode) {
  const m = normalizeTheme(mode);
  return m === 'auto' ? null : m;
}
