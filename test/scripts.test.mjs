import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildManifest, loadQuizzes } from '../scripts/quizzes.mjs';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

test('loadQuizzes validates files and checks the file name matches the id', async () => {
  const entries = await loadQuizzes(FIXTURES);
  assert.deepEqual(entries.map((e) => [e.file, e.errors]), [['sample-quiz.json', []]]);
});

test('buildManifest groups by subject and sorts titles numerically', () => {
  const q = (id, subject, title, topics) => ({
    id,
    subject,
    title,
    questions: topics.map((topic) => ({ topic })),
  });
  const manifest = buildManifest([
    q('b10', 'אנטומיה', 'מבחן 10', ['א']),
    q('p1', 'פרמקולוגיה', 'מבחן 1', ['א', 'ב']),
    q('b2', 'אנטומיה', 'מבחן 2', ['א', 'ב', 'א']),
  ]);
  assert.deepEqual(manifest.quizzes.map((e) => e.id), ['b2', 'b10', 'p1']);
  assert.deepEqual(manifest.quizzes[0], {
    id: 'b2', subject: 'אנטומיה', title: 'מבחן 2', description: '', questionCount: 3, topicCount: 2,
  });
});
