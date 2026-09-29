import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  buildManifest,
  countQuizzes,
  loadQuizzes,
  placementErrors,
  validateCatalog,
} from '../scripts/quizzes.mjs';
import { fromAuthoringFormat } from '../scripts/import-format.mjs';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

const catalog = {
  subjects: [
    { name: 'אנטומיה', units: ['הלב', 'הנשימה'] },
    { name: 'פרמקולוגיה' },
  ],
};
const q = (id, subject, title, topics, unit) => ({
  id, subject, unit, title, questions: topics.map((topic) => ({ topic })),
});

test('loadQuizzes validates files and checks the file name matches the id', async () => {
  const entries = await loadQuizzes(FIXTURES);
  assert.deepEqual(entries.map((e) => [e.file, e.errors]), [['sample-quiz.json', []]]);
});

test('validateCatalog rejects malformed catalogs', () => {
  assert.deepEqual(validateCatalog(catalog), []);
  assert.deepEqual(validateCatalog({}), ['"subjects" must be a non-empty array']);
  assert.ok(validateCatalog({ subjects: [{ name: 'א' }, { name: 'א' }] }).some((e) => /duplicate subject/.test(e)));
  assert.ok(validateCatalog({ subjects: [{ name: 'א', units: ['x', 'x'] }] }).some((e) => /duplicate unit/.test(e)));
  assert.ok(validateCatalog({ subjects: [{ name: '' }] }).some((e) => /name/.test(e)));
});

test('placementErrors checks a quiz against the catalog', () => {
  assert.deepEqual(placementErrors(q('a', 'אנטומיה', 'מבחן 1', ['t'], 'הלב'), catalog), []);
  assert.deepEqual(placementErrors(q('a', 'פרמקולוגיה', 'מבחן 1', ['t']), catalog), []);
  assert.ok(placementErrors(q('a', 'לא קיים', 'מבחן 1', ['t'], 'הלב'), catalog)[0].includes('not in'));
  assert.ok(placementErrors(q('a', 'אנטומיה', 'מבחן 1', ['t']), catalog)[0].includes('required'));
  assert.ok(placementErrors(q('a', 'אנטומיה', 'מבחן 1', ['t'], 'הכבד'), catalog)[0].includes('not listed'));
  assert.ok(placementErrors(q('a', 'פרמקולוגיה', 'מבחן 1', ['t'], 'הלב'), catalog)[0].includes('no units'));
});

test('buildManifest builds a subject→unit tree in catalog order, titles numeric-aware', () => {
  const manifest = buildManifest([
    q('heart10', 'אנטומיה', 'מבחן 10', ['א'], 'הלב'),
    q('pharm1', 'פרמקולוגיה', 'מבחן 1', ['א', 'ב']),
    q('heart2', 'אנטומיה', 'מבחן 2', ['א', 'ב', 'א'], 'הלב'),
  ], catalog);

  assert.deepEqual(manifest.subjects.map((s) => s.name), ['אנטומיה', 'פרמקולוגיה']);
  const heart = manifest.subjects[0].units.find((u) => u.name === 'הלב');
  assert.deepEqual(heart.quizzes.map((e) => e.id), ['heart2', 'heart10']); // 2 before 10
  assert.deepEqual(heart.quizzes[0], {
    id: 'heart2', title: 'מבחן 2', description: '', questionCount: 3, topicCount: 2,
  });
  assert.deepEqual(manifest.subjects[0].units.find((u) => u.name === 'הנשימה').quizzes, []); // empty unit kept
  assert.deepEqual(manifest.subjects[1].quizzes.map((e) => e.id), ['pharm1']); // subject with no units
  assert.equal(countQuizzes(manifest), 3);
});

test('fromAuthoringFormat converts options and maps wrong explanations to notes', () => {
  const source = {
    id: 'src', subject: 'S', title: 'T',
    questions: [{
      id: 'x1', topic: 'טופ', question: 'שאלה?',
      options: ['נכון', 'שגוי א', 'שגוי ב', 'שגוי ג'],
      correctIndex: 0,
      explanation: 'כי כך',
      wrongExplanations: ['למה א שגוי', 'למה ב שגוי', 'למה ג שגוי'],
    }],
  };
  const quiz = fromAuthoringFormat(source, { subject: 'אנטומיה', unit: 'הלב', title: 'מבחן 2' });
  assert.equal(quiz.subject, 'אנטומיה');
  assert.equal(quiz.unit, 'הלב');
  assert.equal(quiz.title, 'מבחן 2'); // override wins
  assert.equal(quiz.id, 'src'); // kept from source
  assert.deepEqual(quiz.questions[0].options, [
    { text: 'נכון' },
    { text: 'שגוי א', note: 'למה א שגוי' },
    { text: 'שגוי ב', note: 'למה ב שגוי' },
    { text: 'שגוי ג', note: 'למה ג שגוי' },
  ]);
  assert.equal(quiz.questions[0].correct, 0);
});

test('fromAuthoringFormat handles a non-zero correctIndex', () => {
  const quiz = fromAuthoringFormat({
    questions: [{
      id: 'x', topic: 't', question: 'q',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 2,
      explanation: 'e',
      wrongExplanations: ['why a', 'why b', 'why d'],
    }],
  });
  assert.equal(quiz.questions[0].correct, 2);
  assert.equal(quiz.questions[0].options[2].note, undefined); // the correct one has no note
  assert.deepEqual(quiz.questions[0].options.map((o) => o.note), ['why a', 'why b', undefined, 'why d']);
});

test('fromAuthoringFormat rejects a bad wrongExplanations count', () => {
  assert.throws(() => fromAuthoringFormat({
    questions: [{ id: 'x', topic: 't', question: 'q', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'e', wrongExplanations: ['only one'] }],
  }), /one entry per wrong option/);
});

test('fromAuthoringFormat accepts stem/answer/notes with option-aligned notes', () => {
  const quiz = fromAuthoringFormat({
    questions: [{
      id: 'x', topic: 't', stem: 'q',
      options: ['a', 'b', 'c', 'd'],
      answer: 1,
      explanation: 'e',
      notes: ['why a', null, 'why c', 'why d'],
    }],
  });
  assert.deepEqual(quiz.questions[0], {
    id: 'x', topic: 't', question: 'q',
    options: [{ text: 'a', note: 'why a' }, { text: 'b' }, { text: 'c', note: 'why c' }, { text: 'd', note: 'why d' }],
    correct: 1,
    explanation: 'e',
  });
});

test('fromAuthoringFormat accepts stem/answer without notes', () => {
  const quiz = fromAuthoringFormat({
    questions: [{ id: 'x', topic: 't', stem: 'q', options: ['a', 'b', 'c', 'd'], answer: 2, explanation: 'e' }],
  });
  assert.deepEqual(quiz.questions[0].options, [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }]);
  assert.equal(quiz.questions[0].correct, 2);
});

test('fromAuthoringFormat rejects notes that do not line up with the options', () => {
  assert.throws(() => fromAuthoringFormat({
    questions: [{ id: 'x', topic: 't', stem: 'q', options: ['a', 'b', 'c', 'd'], answer: 0, explanation: 'e', notes: [null, 'b'] }],
  }), /one entry per option/);
});
