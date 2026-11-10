// Shared helpers for the manifest, validate and import scripts.
import { open, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuiz } from '../js/core.js';
import { validateDeck } from '../js/cards-core.js';
import { MAX_VIDEO_BYTES, isMp4, vttErrors, validateVideo } from '../js/video-core.js';
import { CATALOG_FILE, MANIFEST_FILE, placementErrors, validateCatalog } from '../js/catalog.js';

export * from '../js/catalog.js';

export const QUIZ_DIR = fileURLToPath(new URL('../quizzes/', import.meta.url));
export const DECK_DIR = fileURLToPath(new URL('../flashcards/', import.meta.url));
export const VIDEO_DIR = fileURLToPath(new URL('../videos/', import.meta.url));

export async function loadCatalog(dir = QUIZ_DIR) {
  try {
    const catalog = JSON.parse(await readFile(path.join(dir, CATALOG_FILE), 'utf8'));
    return { catalog, errors: validateCatalog(catalog) };
  } catch (err) {
    return { catalog: null, errors: [`cannot read: ${err.message}`] };
  }
}

/** Reads and validates every quiz file. Each entry has { file, quiz, errors }. */
export async function loadQuizzes(dir = QUIZ_DIR, catalog = null) {
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.json') && f !== MANIFEST_FILE && f !== CATALOG_FILE)
    .sort();

  const entries = [];
  for (const file of files) {
    let quiz = null;
    let errors;
    try {
      quiz = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      errors = validateQuiz(quiz);
      if (errors.length === 0 && file !== `${quiz.id}.json`) {
        errors.push(`file name must be "${quiz.id}.json" to match quiz.id`);
      }
      if (errors.length === 0 && catalog) errors.push(...placementErrors(quiz, catalog));
    } catch (err) {
      errors = [`cannot parse JSON: ${err.message}`];
    }
    entries.push({ file, quiz, errors });
  }
  return entries;
}

/** Reads and validates every flashcard deck. A missing folder simply means there are no decks yet. */
export async function loadDecks(dir = DECK_DIR, catalog = null) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const entries = [];
  for (const file of files) {
    let deck = null;
    let errors;
    try {
      deck = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      errors = validateDeck(deck);
      if (errors.length === 0 && file !== `${deck.id}.json`) {
        errors.push(`file name must be "${deck.id}.json" to match deck.id`);
      }
      if (errors.length === 0 && catalog) errors.push(...placementErrors(deck, catalog));
    } catch (err) {
      errors = [`cannot parse JSON: ${err.message}`];
    }
    entries.push({ file: `flashcards/${file}`, deck, errors });
  }
  return entries;
}

/**
 * Reads and validates every video: its metadata, and the media files it points at (an mp4 that starts with
 * the mp4 signature and is not oversized; a WebVTT file when captions are declared). Media files without
 * metadata are reported too, so nothing is published by accident. A missing folder means no videos yet.
 */
export async function loadVideos(dir = VIDEO_DIR, catalog = null) {
  let files;
  try {
    files = (await readdir(dir)).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const ids = new Set(files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));
  const entries = [];

  for (const file of files.filter((f) => f.endsWith('.json'))) {
    let video = null;
    let errors;
    try {
      video = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      errors = validateVideo(video);
      if (errors.length === 0 && file !== `${video.id}.json`) {
        errors.push(`file name must be "${video.id}.json" to match video.id`);
      }
      if (errors.length === 0 && catalog) errors.push(...placementErrors(video, catalog));
      if (errors.length === 0) errors.push(...(await mediaErrors(dir, video)));
    } catch (err) {
      errors = [`cannot parse JSON: ${err.message}`];
    }
    entries.push({ file: `videos/${file}`, video, errors });
  }

  for (const file of files) {
    const m = /^(.+)\.(mp4|vtt)$/.exec(file);
    if (m && !ids.has(m[1])) entries.push({ file: `videos/${file}`, video: null, errors: [`no ${m[1]}.json describes this file`] });
    if (!m && !file.endsWith('.json')) entries.push({ file: `videos/${file}`, video: null, errors: ['only .json, .mp4 and .vtt belong in videos/'] });
  }
  return entries;
}

async function mediaErrors(dir, video) {
  const errors = [];
  const mp4 = path.join(dir, video.file);
  try {
    const { size } = await stat(mp4);
    if (size > MAX_VIDEO_BYTES) errors.push(`${video.file} is larger than ${MAX_VIDEO_BYTES / 1024 / 1024} MB`);
    const handle = await open(mp4, 'r');
    try {
      const head = new Uint8Array(12);
      await handle.read(head, 0, 12, 0);
      if (!isMp4(head)) errors.push(`${video.file} is not an mp4 file`);
    } finally {
      await handle.close();
    }
  } catch (err) {
    errors.push(err.code === 'ENOENT' ? `${video.file} is missing` : `cannot read ${video.file}: ${err.message}`);
  }
  if (video.captions !== undefined) {
    try {
      for (const e of vttErrors(await readFile(path.join(dir, video.captions), 'utf8'))) errors.push(`${video.captions}: ${e}`);
    } catch (err) {
      errors.push(err.code === 'ENOENT' ? `${video.captions} is missing` : `cannot read ${video.captions}: ${err.message}`);
    }
  }
  return errors;
}

export function reportErrors(entries) {
  let count = 0;
  for (const { file, errors } of entries) {
    for (const error of errors) {
      console.error(`${file}: ${error}`);
      count += 1;
    }
  }
  return count;
}

/**
 * Loads catalog, quizzes, decks and videos, reporting every problem. Decks and videos are read from their real
 * folders only for the real quizzes folder (or when a folder is given), so fixture-based tests never pick up real ones.
 */
export async function loadAll(
  dir = QUIZ_DIR,
  deckDir = dir === QUIZ_DIR ? DECK_DIR : null,
  videoDir = dir === QUIZ_DIR ? VIDEO_DIR : null,
) {
  const { catalog, errors } = await loadCatalog(dir);
  let failures = reportErrors([{ file: CATALOG_FILE, errors }]);
  if (failures > 0) return { failures, catalog: null, entries: [], deckEntries: [], videoEntries: [] };
  const entries = await loadQuizzes(dir, catalog);
  failures += reportErrors(entries);
  const deckEntries = deckDir ? await loadDecks(deckDir, catalog) : [];
  failures += reportErrors(deckEntries);
  const videoEntries = videoDir ? await loadVideos(videoDir, catalog) : [];
  failures += reportErrors(videoEntries);
  return { failures, catalog, entries, deckEntries, videoEntries };
}
