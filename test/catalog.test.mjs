import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findSubject,
  isValidSubjectId,
  subjectOfQuiz,
  subjectPaths,
  subjectQuizzes,
  subjectStats,
  unitAnchor,
} from '../js/catalog.js';
import { SUMMARIES, summariesFor } from '../js/summary-list.js';

const quiz = (id, questionCount) => ({ id, title: id, description: '', questionCount, topicCount: 1 });
const manifest = {
  subjects: [
    {
      id: 'anatomy',
      name: 'אנטומיה',
      units: [
        { name: 'הלב', quizzes: [quiz('heart-1', 10), quiz('heart-2', 5)] },
        { name: 'הנשימה', quizzes: [] },
        { name: 'הכליה', quizzes: [quiz('kidney-1', 7)] },
      ],
      quizzes: [quiz('final-1', 3)],
    },
    { id: 'pharmacology', name: 'פרמקולוגיה', units: [], quizzes: [] },
  ],
};
const [anatomy, pharma] = manifest.subjects;

test('findSubject finds by id, and by name for older links', () => {
  assert.equal(findSubject(manifest, 'pharmacology'), pharma);
  assert.equal(findSubject(manifest, 'אנטומיה'), anatomy);
  assert.equal(findSubject(manifest, 'missing'), null);
  assert.equal(findSubject(manifest, null), null);
  assert.equal(findSubject(manifest, ''), null);
  assert.equal(findSubject(null, 'anatomy'), null);
});

test('subjectQuizzes lists unit-less quizzes first, then units in order', () => {
  assert.deepEqual(subjectQuizzes(anatomy).map((q) => q.id), ['final-1', 'heart-1', 'heart-2', 'kidney-1']);
  assert.deepEqual(subjectQuizzes(pharma), []);
});

test('subjectOfQuiz finds the subject that holds a quiz id', () => {
  assert.equal(subjectOfQuiz(manifest, 'kidney-1'), anatomy);
  assert.equal(subjectOfQuiz(manifest, 'nope'), null);
});

test('subjectStats counts quizzes and groups; mixing needs two groups', () => {
  assert.deepEqual(subjectStats(anatomy), { quizCount: 4, questionCount: 25, groupCount: 3, canMix: true });
  assert.deepEqual(subjectStats(pharma), { quizCount: 0, questionCount: 0, groupCount: 0, canMix: false });
  const oneUnit = { units: [{ name: 'u', quizzes: [quiz('a', 1), quiz('b', 1)] }], quizzes: [] };
  assert.equal(subjectStats(oneUnit).canMix, false);
});

test('subjectPaths and unitAnchor build the subject links', () => {
  assert.deepEqual(subjectPaths('pharmacology'), {
    home: './?subject=pharmacology',
    practice: 'quiz.html?subject=pharmacology',
    print: 'print.html?subject=pharmacology',
    summaries: 'summaries/?subject=pharmacology',
    media: 'media.html?subject=pharmacology',
  });
  assert.equal(unitAnchor(0), 'unit-1');
});

test('isValidSubjectId accepts URL-safe slugs only', () => {
  assert.ok(isValidSubjectId('pharmacology'));
  assert.ok(isValidSubjectId('anatomy-2'));
  for (const bad of ['', 'Pharma', 'a b', 'a--b', '-a', 'פרמקולוגיה', undefined]) assert.ok(!isValidSubjectId(bad), bad);
});

test('summariesFor keeps list order and only that subject', () => {
  assert.deepEqual(summariesFor('anatomy').map((s) => s.id), SUMMARIES.filter((s) => s.subject === 'anatomy').map((s) => s.id));
  assert.deepEqual(summariesFor('nothing'), []);
});
