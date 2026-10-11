// Guarded localStorage wrapper. Storage can be missing, full, or blocked (private mode,
// disabled site data), so every access is wrapped and falls back quietly.

const PREFIX = 'anatomy-quizzes:v1:';

export const keys = {
  session: (quizId) => `session:${quizId}`,
  results: (quizId) => `results:${quizId}`,
  history: (quizId) => `history:${quizId}`,
};

// Global (not per quiz) preferences.
export const prefs = {
  autoAdvance: 'pref:auto-advance',
};

export function load(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // nothing to clean up if storage is unavailable
  }
}

/** Keys (without the prefix) that start with `start`, e.g. every `history:` entry. */
export function listKeys(start) {
  const found = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key !== null && key.startsWith(PREFIX + start)) found.push(key.slice(PREFIX.length));
    }
  } catch {
    // unavailable storage simply has no keys
  }
  return found;
}
