// Export / import of the learner's statistics as a JSON file, for backup and moving between devices.

import { buildStatsExport, isValidQuizId, mergeHistories, parseStatsExport, sanitizeHistory } from './core.js';
import { keys, listKeys, load, save } from './storage.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const HISTORY_PREFIX = keys.history('');

const exportButton = document.getElementById('export-stats');
const importButton = document.getElementById('import-button');
const importInput = document.getElementById('import-stats');
const statusEl = document.getElementById('data-status');

function allHistories() {
  const histories = {};
  for (const key of listKeys(HISTORY_PREFIX)) {
    const quizId = key.slice(HISTORY_PREFIX.length);
    if (!isValidQuizId(quizId)) continue;
    const history = sanitizeHistory(load(key));
    if (history.attempts.length > 0) histories[quizId] = history;
  }
  return histories;
}

function exportStats() {
  const histories = allHistories();
  if (Object.keys(histories).length === 0) {
    statusEl.textContent = 'אין עדיין סטטיסטיקה לייצוא. היא נשמרת בסיום כל תרגול.';
    return;
  }
  const now = new Date();
  const blob = new Blob([JSON.stringify(buildStatsExport(histories, now), null, 1)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `nursing-tests-stats-${now.toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  statusEl.textContent = `יוצאו נתונים של ${Object.keys(histories).length} בחנים.`;
}

async function importStats() {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    statusEl.textContent = 'הקובץ גדול מדי.';
    return;
  }

  let imported = null;
  try {
    imported = parseStatsExport(JSON.parse(await file.text()));
  } catch {
    // falls through to the error message
  }
  if (imported === null) {
    statusEl.textContent = 'הקובץ אינו קובץ סטטיסטיקה של האתר.';
    return;
  }

  let added = 0;
  let failed = false;
  for (const [quizId, incoming] of Object.entries(imported)) {
    const current = sanitizeHistory(load(keys.history(quizId)));
    const merged = mergeHistories(current, incoming);
    added += merged.attempts.length - current.attempts.length;
    if (!save(keys.history(quizId), merged)) failed = true;
  }
  statusEl.textContent = failed
    ? 'לא הצלחנו לשמור את כל הנתונים (ייתכן שאחסון הדפדפן מלא או חסום).'
    : `הייבוא הסתיים: נוספו ${added} סבבים ב־${Object.keys(imported).length} בחנים.`;
}

exportButton.addEventListener('click', exportStats);
importButton.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', importStats);
