// Rules for what the admin panel may upload and where it may write. Pure: no DOM, no network.
//
// File names from the user are never used as paths. A target path is always built from a validated
// id and a fixed directory, then checked against the allowlist below before anything is committed.

export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_HTML_BYTES = 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

// File names the site or the generator owns; no upload may take them as an id.
export const RESERVED_IDS = new Set(['index', 'all', 'list', 'manifest', 'subjects']);

export const isValidId = (id) =>
  typeof id === 'string' && id.length <= 64 && ID_RE.test(id) && !RESERVED_IDS.has(id);

// Every path the panel may write, and nothing else.
const WRITABLE = [
  /^quizzes\/(?:subjects|manifest)\.json$/,
  /^quizzes\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/,
  /^summaries\/list\.json$/,
  /^summaries\/[a-z0-9]+(?:-[a-z0-9]+)*\.html$/,
  /^css\/summary\.css$/,
];

export function isWritablePath(p) {
  if (typeof p !== 'string' || p.includes('..') || p.includes('\\') || p.startsWith('/')) return false;
  if (!WRITABLE.some((re) => re.test(p))) return false;
  // Generated files are allowed by name; any other file must carry a non-reserved id.
  const generated = ['quizzes/subjects.json', 'quizzes/manifest.json', 'summaries/list.json', 'css/summary.css'];
  if (generated.includes(p)) return true;
  return isValidId(p.split('/')[1].replace(/\.(?:json|html)$/, ''));
}

export const quizPath = (id) => `quizzes/${id}.json`;
export const summaryPath = (id) => `summaries/${id}.html`;

const ext = (name) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';

const startsWithText = (bytes, text) => text.split('').every((c, i) => bytes[i] === c.charCodeAt(0));

/**
 * Checks a chosen file by extension AND content. `bytes` is a Uint8Array (at least the first 64 bytes).
 * Returns { kind: 'json' | 'html' | null, errors: [Hebrew messages] }.
 */
export function checkUpload({ name, size, bytes }) {
  const errors = [];
  if (/[\\/]|\.\./.test(name)) errors.push('שם קובץ לא תקין');
  const e = ext(name);
  let kind = null;
  if (e === 'json') kind = 'json';
  else if (e === 'html' || e === 'htm') kind = 'html';
  else errors.push('סוג קובץ לא מורשה (מותר: JSON, HTML)');

  const head = bytes.subarray(0, 64);
  if (head.includes(0)) errors.push('הקובץ מכיל בתים בינאריים');
  if (kind === 'json') {
    if (size > MAX_JSON_BYTES) errors.push('קובץ JSON גדול מדי');
    const first = String.fromCharCode(...head).replace(/^ï»¿/, '').trimStart()[0];
    if (first !== '{' && first !== '[') errors.push('התוכן אינו JSON');
  }
  if (kind === 'html') {
    if (size > MAX_HTML_BYTES) errors.push('קובץ HTML גדול מדי');
    if (!/^\s*<(?:!doctype|html)/i.test(String.fromCharCode(...head))) errors.push('התוכן אינו דף HTML');
  }
  return { kind, errors };
}

/** mp4 check for Phase 3: size cap and the `ftyp` box at offset 4. */
export function checkVideo({ name, size, bytes }) {
  const errors = [];
  if (ext(name) !== 'mp4') errors.push('מותר רק mp4');
  if (size > MAX_VIDEO_BYTES) errors.push('הסרטון גדול מ-100MB');
  if (!startsWithText(bytes.subarray(4, 8), 'ftyp')) errors.push('התוכן אינו mp4');
  return errors;
}

// The per-summary accent line in summary.css. Only a validated id and a clamped integer hue ever reach it.
const accentRe = (id) => new RegExp(`^\\[data-system="${id}"\\][^\\n]*\\n?`, 'm');
const clampHue = (hue) => Math.max(0, Math.min(359, Math.trunc(Number(hue)) || 0));
const accentLine = (id, h) =>
  `[data-system="${id}"] { --a: hsl(${h} 55% 30%); --a-soft: hsl(${h} 40% 92%); --a-ink: hsl(${h} 55% 22%); ` +
  `--a-d: hsl(${h} 65% 70%); --a-soft-d: hsl(${h} 35% 15%); --a-ink-d: hsl(${h} 65% 80%); }\n`;
const ACCENT_MARKER = '\n[data-system] { --accent: var(--a);';

function insertAccent(css, id, hue) {
  const at = css.indexOf(ACCENT_MARKER);
  if (at === -1) throw new Error('summary.css has an unexpected layout');
  return `${css.slice(0, at)}\n${accentLine(id, clampHue(hue)).trimEnd()}${css.slice(at)}`;
}

/** Adds the accent line when it is not there yet; an existing line is kept as it is. */
export function withSummaryAccent(css, id, hue = 200) {
  if (!isValidId(id)) throw new Error('bad summary id');
  if (css.includes(`[data-system="${id}"]`)) return css;
  return insertAccent(css, id, hue);
}

/** Sets the accent hue: replaces the id's line, or adds it when missing. */
export function setSummaryAccent(css, id, hue) {
  if (!isValidId(id)) throw new Error('bad summary id');
  const re = accentRe(id);
  if (!re.test(css)) return insertAccent(css, id, hue);
  return css.replace(re, accentLine(id, clampHue(hue)));
}

/** Removes the id's accent line (nothing else); unchanged when it has none. */
export function withoutSummaryAccent(css, id) {
  if (!isValidId(id)) throw new Error('bad summary id');
  return css.replace(accentRe(id), '');
}

/** The hue of an accent written by the panel; null for hand-written (hex) accents or none. */
export function readSummaryHue(css, id) {
  if (!isValidId(id)) return null;
  const line = accentRe(id).exec(css)?.[0];
  const m = line && /--a: hsl\((\d{1,3}) /.exec(line);
  return m ? Number(m[1]) : null;
}
