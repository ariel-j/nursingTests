import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildManifest, loadQuizzes } from '../scripts/quizzes.mjs';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

test('loadQuizzes validates files and checks the file name matches the id', async () => {
  const entries = await loadQuizzes(FIXTURES);
  assert.deepEqual(entries.map((e) => [e.file, e.errors]), [['sample-quiz.json', []]]);
});

test('buildManifest lists quizzes sorted by id with question counts', () => {
  const q = (id, n) => ({ id, title: id.toUpperCase(), questions: Array(n).fill({}) });
  assert.deepEqual(buildManifest([q('b', 2), q('a', 3)]), {
    quizzes: [
      { id: 'a', title: 'A', description: '', questionCount: 3 },
      { id: 'b', title: 'B', description: '', questionCount: 2 },
    ],
  });
});
