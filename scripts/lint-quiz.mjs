// Lists every question whose correct option can be spotted without knowing the material
// (questionTells in quiz-lint.mjs), with its options, so the distractors can be rewritten.
// Usage: npm run lint-quiz -- quizzes/<id>.json [...]   (no arguments: every quiz)
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { questionTells } from './quiz-lint.mjs';

const QUIZ_DIR = path.resolve(import.meta.dirname, '..', 'quizzes');
const SKIP = new Set(['manifest.json', 'subjects.json']);

let files = process.argv.slice(2);
if (files.length === 0) {
  files = (await readdir(QUIZ_DIR)).filter((f) => f.endsWith('.json') && !SKIP.has(f)).map((f) => path.join(QUIZ_DIR, f));
}

let total = 0;
for (const file of files) {
  const quiz = JSON.parse(await readFile(file, 'utf8'));
  for (const q of quiz.questions ?? []) {
    const tells = questionTells(q);
    if (tells.length === 0) continue;
    total += 1;
    console.log(`\n${path.basename(file)} ${q.id}: ${tells.join('; ')}\n  ${q.question}`);
    q.options.forEach((o, i) => console.log(`  ${i === q.correct ? '✔' : ' '} [${o.text.length}] ${o.text}`));
  }
}
console.log(`\n${total} question${total === 1 ? '' : 's'} with tells`);
