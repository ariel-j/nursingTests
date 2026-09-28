// Shared helpers for the manifest and validate scripts.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuiz } from '../js/core.js';

export const QUIZ_DIR = fileURLToPath(new URL('../quizzes/', import.meta.url));
export const MANIFEST_FILE = 'manifest.json';

/** Reads and validates every quiz file. Each entry has { file, quiz, errors }. */
export async function loadQuizzes(dir = QUIZ_DIR) {
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.json') && f !== MANIFEST_FILE)
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
    } catch (err) {
      errors = [`cannot parse JSON: ${err.message}`];
    }
    entries.push({ file, quiz, errors });
  }
  return entries;
}

// Numeric-aware Hebrew order, so "מבחן 2" sorts before "מבחן 10".
const collator = new Intl.Collator('he', { numeric: true });

/** Manifest entries grouped by subject (subjects A–Z, then quizzes by title within each). */
export function buildManifest(quizzes) {
  return {
    quizzes: quizzes
      .map((q) => ({
        id: q.id,
        subject: q.subject,
        title: q.title,
        description: q.description ?? '',
        questionCount: q.questions.length,
        topicCount: new Set(q.questions.map((question) => question.topic)).size,
      }))
      .sort((a, b) => collator.compare(a.subject, b.subject)
        || collator.compare(a.title, b.title)
        || a.id.localeCompare(b.id)),
  };
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
