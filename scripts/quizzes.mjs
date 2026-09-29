// Shared helpers for the manifest, validate and import scripts.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuiz } from '../js/core.js';

export const QUIZ_DIR = fileURLToPath(new URL('../quizzes/', import.meta.url));
export const MANIFEST_FILE = 'manifest.json';
// Hand-written: which subjects exist, and the order of their units (sub-subjects).
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

const byTitle = (a, b) => collator.compare(a.title, b.title) || a.id.localeCompare(b.id);

/**
 * The home page tree, in catalog order: subjects → units → quizzes (by title).
 * Units without quizzes are kept so the page can show them as coming soon.
 */
export function buildManifest(quizzes, catalog) {
  return {
    subjects: catalog.subjects.map((s) => {
      const own = quizzes.filter((q) => q.subject === s.name);
      return {
        name: s.name,
        units: (s.units ?? []).map((unit) => ({
          name: unit,
          quizzes: own.filter((q) => q.unit === unit).map(entry).sort(byTitle),
        })),
        quizzes: own.filter((q) => q.unit === undefined).map(entry).sort(byTitle),
      };
    }),
  };
}

export function countQuizzes(manifest) {
  return manifest.subjects.reduce(
    (n, s) => n + s.quizzes.length + s.units.reduce((m, u) => m + u.quizzes.length, 0),
    0,
  );
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
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

/** Loads catalog + quizzes, reporting every problem. Returns null when anything is invalid. */
export async function loadAll(dir = QUIZ_DIR) {
  const { catalog, errors } = await loadCatalog(dir);
  let failures = reportErrors([{ file: CATALOG_FILE, errors }]);
  if (failures > 0) return { failures, catalog: null, entries: [] };
  const entries = await loadQuizzes(dir, catalog);
  failures += reportErrors(entries);
  return { failures, catalog, entries };
}
