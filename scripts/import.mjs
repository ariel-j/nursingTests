// Imports a quiz written in the authoring format into quizzes/<id>.json.
//
//   npm run import -- <source.json> [--id heart-2] [--title "מבחן 2"]
//                     [--subject "אנטומיה ופיזיולוגיה"] [--unit "הלב"] [--description "…"]
//
// Flags override the quiz-level fields in the source. Run "npm run manifest" afterwards.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateQuiz } from '../js/core.js';
import { fromAuthoringFormat } from './import-format.mjs';
import { QUIZ_DIR, loadCatalog, placementErrors } from './quizzes.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    title: { type: 'string' },
    subject: { type: 'string' },
    unit: { type: 'string' },
    description: { type: 'string' },
  },
});

if (positionals.length !== 1) {
  console.error('usage: npm run import -- <source.json> [--id …] [--title …] [--subject …] [--unit …]');
  process.exit(2);
}

const fail = (lines) => {
  for (const line of lines) console.error(line);
  console.error('\nNothing written.');
  process.exit(1);
};

let quiz;
try {
  quiz = fromAuthoringFormat(JSON.parse(await readFile(positionals[0], 'utf8')), values);
} catch (err) {
  fail([err.message]);
}

const { catalog, errors: catalogErrors } = await loadCatalog();
if (catalogErrors.length > 0) fail(catalogErrors.map((e) => `subjects.json: ${e}`));
const errors = validateQuiz(quiz);
if (errors.length === 0) errors.push(...placementErrors(quiz, catalog));
if (errors.length > 0) fail(errors);

const target = path.join(QUIZ_DIR, `${quiz.id}.json`);
await writeFile(target, `${JSON.stringify(quiz, null, 2)}\n`);
console.log(`Wrote quizzes/${quiz.id}.json (${quiz.questions.length} questions). Next: npm run manifest && npm run validate`);
