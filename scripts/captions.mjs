// Automatic Hebrew captions for media/ videos. scripts/transcribe.py (faster-whisper) turns each
// video into words with times and confidence; this file turns those words into a .vtt next to the
// video and a review list of the words most likely misheard. The Pages deploy workflow runs
// both before building the media manifest, so an uploaded video is published with captions.
//   node scripts/captions.mjs pending          → JSON list of videos (under media/) with no .vtt
//   node scripts/captions.mjs build <dir>      → a .vtt per <dir>/*.json, review report on stdout
// The cue and report builders are pure, so the tests feed them word lists.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_DIR, scanMedia } from './media.mjs';

const QUIZZES_DIR = fileURLToPath(new URL('../quizzes/', import.meta.url));
const SUMMARIES_DIR = fileURLToPath(new URL('../summaries/', import.meta.url));
const VIDEO = /\.(mp4|webm)$/i;
// Two lines of up to 42 characters, on screen 1-7 seconds: the usual subtitle limits.
export const LINE_CHARS = 42;
export const MAX_SECONDS = 7;
export const MIN_SECONDS = 1;
// A pause this long starts a new cue; a sentence end does once the cue has this many characters.
export const PAUSE_SECONDS = 0.8;
const SENTENCE_CHARS = 20;
// One-letter prefixes (and/the/in/to/from/that/as) and their common pairs, stripped when looking a
// word up: "והדופמין" is known when "דופמין" is.
const PREFIXES = ['וכש', 'ומה', 'ושה', 'וה', 'וב', 'ול', 'ומ', 'וש', 'וכ', 'שה', 'שב', 'של', 'שמ', 'מה', 'בה', 'לה', 'כש', 'כה', 'ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ'];

const RLM = '‏'; // a line that starts with a Latin word ("ACE ...") still reads right to left

/** Videos under media/ (paths relative to it) that have no .vtt of the same name. */
export function pendingVideos(paths) {
  const all = new Set(paths);
  return paths.filter((p) => VIDEO.test(p) && !all.has(p.replace(VIDEO, '.vtt')));
}

/**
 * Glues the pieces Whisper splits a word into back together: a piece with no leading space continues
 * the word before it ("ג" + "'נרליים", "ה" + "-chill"). Keeps the first start and the last end.
 */
export function mergeWords(words) {
  const out = [];
  for (const w of words) {
    const prev = out.at(-1);
    if (prev && !/^\s/.test(w.word)) out[out.length - 1] = { ...prev, end: w.end, word: prev.word + w.word };
    else out.push({ ...w });
  }
  return out;
}

/**
 * Cues from transcribed words ({ start, end, word } in seconds, a word starts with a space unless it
 * continues the one before).
 * A cue ends before a word that would push it past two lines or MAX_SECONDS, at a pause, or after a
 * sentence end once it is long enough. Returns { start, end, lines } with at most two lines.
 */
export function wordsToCues(words) {
  const cues = [];
  let cur = [];
  const text = (ws) => ws.map((w) => w.word.trim()).filter(Boolean).join(' ');
  const flush = () => {
    if (cur.length > 0 && text(cur)) cues.push({ start: cur[0].start, end: cur.at(-1).end, lines: splitLines(text(cur)) });
    cur = [];
  };
  for (const w of mergeWords(words)) {
    if (cur.length > 0) {
      const tooLong = text([...cur, w]).length > LINE_CHARS * 2;
      const tooSlow = w.end - cur[0].start > MAX_SECONDS;
      const pause = w.start - cur.at(-1).end >= PAUSE_SECONDS;
      const sentence = /[.?!:]$/.test(cur.at(-1).word.trim()) && text(cur).length >= SENTENCE_CHARS;
      if (tooLong || tooSlow || pause || sentence) flush();
    }
    cur.push(w);
  }
  flush();
  // Short cues stay up at least MIN_SECONDS, without running into the next one.
  return cues.map((c, i) => {
    const next = cues[i + 1]?.start ?? Infinity;
    return { ...c, end: Math.max(c.end, Math.min(c.start + MIN_SECONDS, next)) };
  });
}

/** One line, or two split at the space nearest the middle (a single long word stays whole). */
export function splitLines(text) {
  if (text.length <= LINE_CHARS) return [text];
  const mid = text.length / 2;
  let best = -1;
  for (let i = text.indexOf(' '); i !== -1; i = text.indexOf(' ', i + 1)) {
    if (best === -1 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
  }
  return best === -1 ? [text] : [text.slice(0, best), text.slice(best + 1)];
}

/** HH:MM:SS.mmm */
export function timestamp(seconds) {
  const ms = Math.round(seconds * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

const escapeVtt = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toVtt(cues) {
  const body = cues.map((c) => `${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.lines.map((l) => RLM + escapeVtt(l)).join('\n')}`);
  return `WEBVTT\n\n${body.join('\n\n')}\n`;
}

const bare = (w) => w.replace(/[^\u05D0-\u05EAa-zA-Z]/g, '');

/** Every word (letters only) in the given Hebrew texts: the quizzes and summaries. */
export function buildVocabulary(texts) {
  const vocab = new Set();
  for (const t of texts) for (const w of t.split(/[\s"'(),.;:!?/\-–׳״]+/)) if (bare(w)) vocab.add(bare(w));
  return vocab;
}

/** A word is known when it, or it without a prefix, is in the vocabulary. */
export function isKnown(word, vocab) {
  const w = bare(word);
  return !w || vocab.has(w) || PREFIXES.some((p) => w.startsWith(p) && vocab.has(w.slice(p.length)));
}

/**
 * Words to check by ear as { time, word, context }: those that appear nowhere in the quizzes or
 * summaries. The model's own confidence is no guide, it is just as sure of "טעים" for "תאים".
 */
export function reviewWords(transcribed, vocab) {
  const out = [];
  const words = mergeWords(transcribed);
  words.forEach((w, i) => {
    if (isKnown(w.word, vocab)) return;
    const context = words.slice(Math.max(0, i - 3), i + 4).map((x) => x.word.trim()).join(' ');
    out.push({ time: timestamp(w.start).slice(3, 8), word: w.word.trim(), context });
  });
  return out;
}

/** Markdown for the review issue: per video, its unsure words with the time to find them. */
export function reviewReport(videos, vocab) {
  const lines = [
    'כתוביות נוצרו אוטומטית לסרטונים האלה ופורסמו. כדאי לעבור על המילים שלא מופיעות באף בוחן או סיכום, שם נמצאות רוב הטעויות (מונחים ושמות תרופות), ולתקן ישירות בקובץ ה-`.vtt`. לא כל מילה ברשימה שגויה, ולא כל טעות ברשימה.',
    '',
  ];
  for (const { video, words } of videos) {
    const unsure = reviewWords(words, vocab);
    lines.push(`### \`${video.replace(/\.[^.]+$/, '.vtt')}\``, '');
    if (unsure.length === 0) lines.push('אין מילים לבדיקה.', '');
    else lines.push('| זמן | מילה | הקשר |', '| --- | --- | --- |', ...unsure.map((u) => `| ${u.time} | ${u.word} | ${u.context.replace(/\|/g, '\\|')} |`), '');
  }
  return lines.join('\n');
}

/** The vocabulary of every quiz and summary in the repo. */
export async function loadVocabulary() {
  const texts = [];
  for (const dir of [QUIZZES_DIR, SUMMARIES_DIR]) {
    for (const name of await readdir(dir)) {
      if (!/\.(json|html)$/.test(name)) continue;
      const text = await readFile(path.join(dir, name), 'utf8');
      texts.push(name.endsWith('.html') ? text.replace(/<[^>]*>/g, ' ') : text);
    }
  }
  return buildVocabulary(texts);
}

async function main([command, dir]) {
  if (command === 'pending') {
    console.log(JSON.stringify(pendingVideos((await scanMedia()).map((f) => f.path))));
    return;
  }
  if (command === 'build' && dir) {
    // Each JSON is { video: path under media/, words: [...] }, written by scripts/transcribe.py.
    const videos = [];
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.json')).sort()) {
      const { video, words } = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
      await writeFile(path.join(MEDIA_DIR, video.replace(VIDEO, '.vtt')), toVtt(wordsToCues(words)));
      console.error(`media/${video.replace(VIDEO, '.vtt')}: ${words.length} words`);
      videos.push({ video: `media/${video}`, words });
    }
    // A GitHub issue body holds 65536 characters.
    const report = reviewReport(videos, await loadVocabulary());
    console.log(report.length > 60000 ? `${report.slice(0, report.lastIndexOf('\n', 60000))}\n\n(הרשימה קוצרה)` : report);
    return;
  }
  console.error('usage: node scripts/captions.mjs pending | build <words-dir>');
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
