import { topicOf } from './cards-core.js';

// Pure catalog / manifest logic, shared by the Node scripts and the admin panel.
export const MANIFEST_FILE = 'manifest.json';
export const CATALOG_FILE = 'subjects.json';

const isText = (v) => typeof v === 'string' && v.trim() !== '';

/** Problems with the catalog: [{ name, units?: [unit names] }] under "subjects". */
export function validateCatalog(catalog) {
  const errors = [];
  if (!catalog || !Array.isArray(catalog.subjects) || catalog.subjects.length === 0) {
    return ['"subjects" must be a non-empty array'];
  }
  const names = new Set();
  catalog.subjects.forEach((s, i) => {
    const where = `subjects[${i}]`;
    if (!s || !isText(s.name)) {
      errors.push(`${where}: name must be a non-empty string`);
      return;
    }
    if (names.has(s.name)) errors.push(`${where}: duplicate subject "${s.name}"`);
    names.add(s.name);
    if (s.units === undefined) return;
    if (!Array.isArray(s.units) || !s.units.every(isText)) {
      errors.push(`${where}: units must be an array of non-empty strings`);
    } else if (new Set(s.units).size !== s.units.length) {
      errors.push(`${where}: duplicate unit name`);
    }
  });
  return errors;
}

/** Where a quiz belongs in the catalog; problems if its subject/unit are not declared there. */
export function placementErrors(quiz, catalog) {
  const subject = catalog.subjects.find((s) => s.name === quiz.subject);
  if (!subject) return [`subject "${quiz.subject}" is not in ${CATALOG_FILE}`];
  const units = subject.units ?? [];
  if (units.length === 0) {
    return quiz.unit === undefined ? [] : [`subject "${quiz.subject}" has no units, remove "unit"`];
  }
  if (quiz.unit === undefined) return [`subject "${quiz.subject}" has units, so "unit" is required`];
  return units.includes(quiz.unit) ? [] : [`unit "${quiz.unit}" is not listed under "${quiz.subject}" in ${CATALOG_FILE}`];
}

// Numeric-aware Hebrew order, so "מבחן 2" sorts before "מבחן 10".
const collator = new Intl.Collator('he', { numeric: true });

function entry(q) {
  return {
    id: q.id,
    title: q.title,
    description: q.description ?? '',
    questionCount: q.questions.length,
    topicCount: new Set(q.questions.map((question) => question.topic)).size,
  };
}

function deckEntry(d) {
  return {
    id: d.id,
    title: d.title,
    description: d.description ?? '',
    cardCount: d.cards.length,
    topicCount: new Set(d.cards.map(topicOf)).size,
  };
}

function videoEntry(v) {
  return {
    id: v.id,
    title: v.title,
    description: v.description ?? '',
    ...(v.durationSec === undefined ? {} : { durationSec: v.durationSec }),
    hasCaptions: v.captions !== undefined,
  };
}

const byTitle = (a, b) => collator.compare(a.title, b.title) || a.id.localeCompare(b.id);

/**
 * The home page tree, in catalog order: subjects → units → quizzes, flashcard decks and videos (each by title).
 * Units without any are kept so the page can show them as coming soon.
 */
export function buildManifest(quizzes, catalog, decks = [], videos = []) {
  const pick = (items, subject, unit, make) =>
    items.filter((x) => x.subject === subject && x.unit === unit).map(make).sort(byTitle);
  return {
    subjects: catalog.subjects.map((s) => ({
      name: s.name,
      units: (s.units ?? []).map((unit) => ({
        name: unit,
        quizzes: pick(quizzes, s.name, unit, entry),
        flashcards: pick(decks, s.name, unit, deckEntry),
        videos: pick(videos, s.name, unit, videoEntry),
      })),
      quizzes: pick(quizzes, s.name, undefined, entry),
      flashcards: pick(decks, s.name, undefined, deckEntry),
      videos: pick(videos, s.name, undefined, videoEntry),
    })),
  };
}

export function countQuizzes(manifest) {
  return manifest.subjects.reduce(
    (n, s) => n + s.quizzes.length + s.units.reduce((m, u) => m + u.quizzes.length, 0),
    0,
  );
}

export function countDecks(manifest) {
  return manifest.subjects.reduce(
    (n, s) => n + (s.flashcards?.length ?? 0) + s.units.reduce((m, u) => m + (u.flashcards?.length ?? 0), 0),
    0,
  );
}

export function countVideos(manifest) {
  return manifest.subjects.reduce(
    (n, s) => n + (s.videos?.length ?? 0) + s.units.reduce((m, u) => m + (u.videos?.length ?? 0), 0),
    0,
  );
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

