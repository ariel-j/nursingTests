import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_ATTEMPTS,
  addAttempt,
  analyzeHistory,
  answer,
  buildAttempt,
  buildStatsExport,
  createSession,
  emptyHistory,
  mergeHistories,
  newAttemptId,
  parseStatsExport,
  sanitizeHistory,
  skip,
} from '../js/core.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/sample-quiz.json', import.meta.url), 'utf8'));

// Two topics with six questions each; only ids and topics matter to the analysis.
const quiz = {
  id: 'demo',
  questions: [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, topic: 'A' })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, topic: 'B' })),
  ],
};

let counter = 0;
/** An attempt over the given questions; `missed` lists ids missed on first try. */
function attempt(ids, missed = [], mode = 'topics') {
  counter += 1;
  const results = Object.fromEntries(ids.map((id) => [id, missed.includes(id) ? 1 : 0]));
  return { id: `t${counter}`, date: new Date(Date.UTC(2026, 0, counter)).toISOString(), mode, results };
}
const history = (...attempts) => attempts.reduce(addAttempt, emptyHistory());
const idsOf = (prefix) => Array.from({ length: 6 }, (_, i) => `${prefix}${i}`);
const topic = (analysis, name) => analysis.topics.find((t) => t.topic === name);

test('buildAttempt records misses per covered question', () => {
  let state = createSession(fixture, () => 0.5);
  const first = state.queue[0];
  state = skip(state, fixture, () => 0.5).state;
  while (state.queue.length > 0) {
    const q = fixture.questions.find((x) => x.id === state.queue[0]);
    state = answer(state, fixture, q.correct, () => 0.5).state;
  }
  const rec = buildAttempt(state, fixture, { id: 'x1', date: '2026-01-01T00:00:00.000Z' });
  assert.equal(rec.mode, 'full');
  assert.equal(rec.results[first], 1);
  assert.equal(Object.keys(rec.results).length, fixture.questions.length);
  assert.deepEqual(sanitizeHistory(history(rec)).attempts, [rec]);
});

test('newAttemptId is unique per rng draw and passes validation', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const a = newAttemptId(now, () => 0.1);
  const b = newAttemptId(now, () => 0.2);
  assert.notEqual(a, b);
  assert.match(a, /^[a-z0-9-]{1,40}$/);
});

test('addAttempt ignores duplicates and malformed attempts', () => {
  const a = attempt(idsOf('a'));
  const once = history(a);
  assert.equal(addAttempt(once, a).attempts.length, 1);
  assert.equal(addAttempt(once, { ...a, id: 'BAD ID' }).attempts.length, 1);
  assert.equal(addAttempt(once, { ...a, id: 'n1', results: { q: -1 } }).attempts.length, 1);
  assert.equal(addAttempt(once, { ...a, id: 'n2', mode: 'weird' }).attempts.length, 1);
  assert.equal(addAttempt(once, { ...a, id: 'n3', date: 'yesterday' }).attempts.length, 1);
});

test('history keeps only the newest MAX_ATTEMPTS', () => {
  let h = emptyHistory();
  for (let i = 0; i < MAX_ATTEMPTS + 5; i++) h = addAttempt(h, attempt(['a0']));
  assert.equal(h.attempts.length, MAX_ATTEMPTS);
  assert.equal(h.attempts.at(-1).id, `t${counter}`);
});

test('mergeHistories is a union by id: commutative and idempotent', () => {
  const [x, y, z] = [attempt(['a0']), attempt(['a1']), attempt(['a2'])];
  const h1 = history(x, y);
  const h2 = history(y, z);
  const ab = mergeHistories(h1, h2);
  assert.deepEqual(ab, mergeHistories(h2, h1));
  assert.deepEqual(ab, mergeHistories(ab, h1));
  assert.deepEqual(ab.attempts.map((a) => a.id), [x.id, y.id, z.id]);
});

test('sanitizeHistory tolerates garbage', () => {
  for (const raw of [null, 5, 'x', [], {}, { version: 99, attempts: [] }, { version: 1, attempts: 'no' }]) {
    assert.deepEqual(sanitizeHistory(raw), emptyHistory());
  }
});

test('stats export round-trips and rejects foreign files', () => {
  const h = history(attempt(idsOf('a')));
  const file = buildStatsExport({ demo: h, 'Not Valid': h, empty: emptyHistory() }, new Date('2026-02-01T00:00:00Z'));
  const parsed = parseStatsExport(JSON.parse(JSON.stringify(file)));
  assert.deepEqual(Object.keys(parsed), ['demo']);
  assert.deepEqual(parsed.demo, h);
  assert.equal(parseStatsExport({ kind: 'other', version: 1, quizzes: {} }), null);
  assert.equal(parseStatsExport(null), null);
});

test('no history: every topic is unknown', () => {
  const a = analyzeHistory(emptyHistory(), quiz);
  assert.equal(a.attempts, 0);
  assert.deepEqual(a.topics.map((t) => t.level), ['unknown', 'unknown']);
  assert.deepEqual(a.weakQuestions, []);
});

test('too little evidence stays unknown', () => {
  const a = analyzeHistory(history(attempt(['a0', 'a1'], ['a0', 'a1'])), quiz);
  assert.equal(topic(a, 'A').level, 'unknown');
});

test('a topic with mostly misses is weak, a clean one is solid', () => {
  const all = [...idsOf('a'), ...idsOf('b')];
  const a = analyzeHistory(history(attempt(all, idsOf('a').slice(0, 4))), quiz);
  assert.equal(topic(a, 'A').level, 'weak');
  assert.equal(topic(a, 'B').level, 'solid');
  assert.equal(topic(a, 'B').score, 1);
});

test('a weak topic recovers over time and is flagged as recovered', () => {
  const all = [...idsOf('a'), ...idsOf('b')];
  let h = history(attempt(all, idsOf('a')));
  assert.equal(topic(analyzeHistory(h, quiz), 'A').level, 'weak');
  h = addAttempt(h, attempt(idsOf('a')));
  h = addAttempt(h, attempt(idsOf('a')));
  h = addAttempt(h, attempt(idsOf('a')));
  const a = topic(analyzeHistory(h, quiz), 'A');
  assert.notEqual(a.level, 'weak');
  assert.equal(a.recovered, true);
  assert.equal(a.trend, 'up');
});

test('a solid topic that starts failing drops and trends down', () => {
  let h = history(attempt(idsOf('a')), attempt(idsOf('a')), attempt(idsOf('a')));
  assert.equal(topic(analyzeHistory(h, quiz), 'A').level, 'solid');
  h = addAttempt(h, attempt(idsOf('a'), idsOf('a')));
  h = addAttempt(h, attempt(idsOf('a'), idsOf('a')));
  const a = topic(analyzeHistory(h, quiz), 'A');
  assert.equal(a.level, 'weak');
  assert.equal(a.trend, 'down');
  assert.equal(a.recovered, false);
});

test('practising another topic does not change this topic trend', () => {
  const all = [...idsOf('a'), ...idsOf('b')];
  const before = topic(analyzeHistory(history(attempt(all, idsOf('a'))), quiz), 'A');
  const after = topic(analyzeHistory(history(attempt(all, idsOf('a')), attempt(idsOf('b'))), quiz), 'A');
  assert.equal(before.trend, null);
  assert.equal(after.trend, null);
  assert.equal(after.level, 'weak');
});

test('retrying a few hard questions does not outweigh the rest of the topic', () => {
  const h = history(
    attempt(idsOf('a'), ['a0', 'a1']),
    attempt(['a0', 'a1'], [], 'retry'),
    attempt(['a0', 'a1'], [], 'retry'),
  );
  assert.equal(topic(analyzeHistory(h, quiz), 'A').level, 'solid');
});

test('questions removed from the quiz are ignored', () => {
  const h = history(attempt([...idsOf('a'), 'gone'], ['gone']));
  const a = analyzeHistory(h, quiz);
  assert.equal(topic(a, 'A').seen, 6);
  assert.equal(topic(a, 'A').level, 'solid');
});

test('weakQuestions lists questions missed in most of their recent attempts', () => {
  const h = history(
    attempt(['a0', 'a1']),
    attempt(['a0', 'a1'], ['a0', 'a1']),
    attempt(['a0', 'a1'], ['a0']),
  );
  const a = analyzeHistory(h, quiz);
  assert.deepEqual(a.weakQuestions.map((q) => q.id), ['a0']);
  assert.equal(a.weakQuestions[0].failures, 2);
});

test('a question answered correctly twice since a miss is no longer weak', () => {
  const h = history(
    attempt(['a0'], ['a0']),
    attempt(['a0'], ['a0']),
    attempt(['a0']),
    attempt(['a0']),
  );
  assert.deepEqual(analyzeHistory(h, quiz).weakQuestions, []);
});
