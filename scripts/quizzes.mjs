// Shared helpers for the manifest, validate and import scripts.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuiz } from '../js/core.js';
import { validateDeck } from '../js/cards-core.js';
import { CATALOG_FILE, MANIFEST_FILE, placementErrors, validateCatalog } from '../js/catalog.js';

export * from '../js/catalog.js';

export const QUIZ_DIR = fileURLToPath(new URL('../quizzes/', import.meta.url));
export const DECK_DIR = fileURLToPath(new URL('../flashcards/', import.meta.url));

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
 * Loads catalog, quizzes and decks, reporting every problem. Decks are read from flashcards/ only for the
 * real quizzes folder (or when `deckDir` is given), so fixture-based tests never pick up real decks.
 */
export async function loadAll(dir = QUIZ_DIR, deckDir = dir === QUIZ_DIR ? DECK_DIR : null) {
  const { catalog, errors } = await loadCatalog(dir);
  let failures = reportErrors([{ file: CATALOG_FILE, errors }]);
  if (failures > 0) return { failures, catalog: null, entries: [], deckEntries: [] };
  const entries = await loadQuizzes(dir, catalog);
  failures += reportErrors(entries);
  const deckEntries = deckDir ? await loadDecks(deckDir, catalog) : [];
  failures += reportErrors(deckEntries);
  return { failures, catalog, entries, deckEntries };
}
