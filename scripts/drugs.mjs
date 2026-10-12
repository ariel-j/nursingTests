// Checks for the catalog's tool links and each subject's drug cards (data/<subject-id>/drugs.json):
// the deck itself, and that the quiz built from it passes the quiz validator.
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuiz } from '../js/core.js';
import { buildDrugQuiz, drugDeckUrl, validateDrugDeck } from '../js/drugs-core.js';

export const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url));

/** Problems with one drug deck, including the quiz generated from it. */
export function drugDeckErrors(deck, subjectId) {
  const errors = validateDrugDeck(deck);
  if (errors.length > 0) return errors;
  for (const examOnly of [false, true]) {
    const quiz = buildDrugQuiz(deck, { id: `drugs-${subjectId}`, subject: 'x', examOnly });
    if (examOnly && quiz.questions.length === 0) continue;
    errors.push(...validateQuiz(quiz).map((e) => `generated quiz${examOnly ? ' (exam only)' : ''}: ${e}`));
  }
  return errors;
}

export async function checkDrugs(catalog, dir = ROOT_DIR) {
  const errors = [];
  const ids = new Set(catalog.subjects.map((s) => s.id));
  for (const s of catalog.subjects) {
    for (const tool of s.tools ?? []) {
      const file = tool.href.split('?')[0];
      try {
        await access(path.join(dir, file));
      } catch {
        errors.push(`quizzes/subjects.json: ${s.id} tool "${tool.title}" links to missing ${file}`);
      }
    }
  }
  let folders = [];
  try {
    folders = (await readdir(path.join(dir, 'data'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return errors; // no data folder: no drug cards anywhere
  }
  for (const id of folders) {
    const file = drugDeckUrl(id);
    if (!ids.has(id)) {
      errors.push(`data/${id}: not a subject id in quizzes/subjects.json`);
      continue;
    }
    let deck;
    try {
      deck = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    } catch (err) {
      errors.push(`${file}: ${err.code === 'ENOENT' ? 'missing' : `cannot parse: ${err.message}`}`);
      continue;
    }
    for (const e of drugDeckErrors(deck, id)) errors.push(`${file}: ${e}`);
  }
  return errors;
}
