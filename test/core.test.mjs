import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MASTERY_STREAK,
  REQUEUE_MAX,
  REQUEUE_MIN,
  answer,
  createSession,
  currentQuestion,
  isComplete,
  isSessionCompatible,
  presentOptions,
  progressInfo,
  recordResult,
  requeue,
  shuffle,
  skip,
  summarize,
  validateQuiz,
} from '../js/core.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/sample-quiz.json', import.meta.url), 'utf8'));
const clone = (v) => structuredClone(v);

// Deterministic PRNG (mulberry32) so failures are reproducible.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fixed = (value) => () => value;

const correctOf = (state) => currentQuestion(state, fixture).correct;
const wrongOf = (state) => (correctOf(state) + 1) % 4;

// ---------- shuffle / options ----------

test('shuffle is a permutation and does not mutate its input', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffle(input, seeded(1));
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...out].sort(), [...input].sort());
});

test('presentOptions keeps authored indexes and marks exactly one correct', () => {
  const q = fixture.questions[2];
  const opts = presentOptions(q, seeded(7));
  assert.equal(opts.length, 4);
  assert.deepEqual(opts.map((o) => o.index).sort(), [0, 1, 2, 3]);
  assert.equal(opts.filter((o) => o.correct).length, 1);
  assert.equal(opts.find((o) => o.correct).index, q.correct);
  for (const o of opts) assert.equal(o.text, q.options[o.index].text);
});

test('presentOptions reshuffles across displays', () => {
  const rng = seeded(3);
  const orders = new Set();
  for (let i = 0; i < 20; i++) orders.add(presentOptions(fixture.questions[0], rng).map((o) => o.index).join());
  assert.ok(orders.size > 1);
});

// ---------- requeue ----------

test('requeue never puts a question immediately next when others remain', () => {
  const rng = seeded(11);
  for (let len = 1; len <= 8; len++) {
    const queue = Array.from({ length: len }, (_, i) => `x${i}`);
    for (let i = 0; i < 200; i++) {
      const pos = requeue(queue, 'q', rng).indexOf('q');
      assert.ok(pos >= 1, `len ${len}: landed at ${pos}`);
      assert.ok(pos >= REQUEUE_MIN - 1 && pos <= REQUEUE_MAX - 1 || pos === len, `len ${len}: pos ${pos}`);
    }
  }
});

test('requeue covers the whole 2-5 range on a long queue', () => {
  const queue = Array.from({ length: 10 }, (_, i) => `x${i}`);
  const rng = seeded(5);
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(requeue(queue, 'q', rng).indexOf('q') + 1);
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
});

test('requeue on a short queue appends to the end', () => {
  assert.deepEqual(requeue(['a'], 'q', fixed(0.99)), ['a', 'q']);
  assert.deepEqual(requeue(['a', 'b'], 'q', fixed(0.99)), ['a', 'b', 'q']);
});

test('requeue on an empty queue is the only case it comes straight back', () => {
  assert.deepEqual(requeue([], 'q', seeded(1)), ['q']);
});

// ---------- session flow ----------

test('createSession queues every question once', () => {
  const s = createSession(fixture, seeded(1));
  assert.deepEqual([...s.queue].sort(), fixture.questions.map((q) => q.id).sort());
  assert.deepEqual(progressInfo(s), { mastered: 0, total: 6, queueSize: 6 });
  assert.ok(isSessionCompatible(s, fixture));
});

test('correct on first try masters the question', () => {
  const s0 = createSession(fixture, seeded(1));
  const id = s0.queue[0];
  const { state, correct } = answer(s0, fixture, correctOf(s0), seeded(2));
  assert.equal(correct, true);
  assert.equal(state.progress[id].mastered, true);
  assert.equal(state.progress[id].firstTry, 'correct');
  assert.ok(!state.queue.includes(id));
  assert.equal(state.queue.length, 5);
});

test('answer does not mutate the previous state', () => {
  const s0 = createSession(fixture, seeded(1));
  const before = clone(s0);
  answer(s0, fixture, wrongOf(s0), seeded(2));
  assert.deepEqual(s0, before);
});

test(`a missed question needs ${MASTERY_STREAK} correct answers in a row`, () => {
  const rng = seeded(4);
  let s = createSession(fixture, rng);
  const id = s.queue[0];

  s = answer(s, fixture, wrongOf(s), rng).state;
  assert.equal(s.progress[id].firstTry, 'wrong');
  assert.ok(s.queue.includes(id));
  assert.notEqual(s.queue[0], id);

  const answerTarget = (outcome) => {
    // Answer other questions correctly until the target comes back.
    while (s.queue[0] !== id) s = answer(s, fixture, correctOf(s), rng).state;
    s = answer(s, fixture, outcome === 'right' ? correctOf(s) : wrongOf(s), rng).state;
  };

  answerTarget('right');
  assert.equal(s.progress[id].mastered, false, 'one correct is not enough after a miss');
  assert.ok(s.queue.includes(id));

  answerTarget('wrong');
  assert.equal(s.progress[id].streak, 0, 'a miss resets the streak');

  answerTarget('right');
  assert.equal(s.progress[id].mastered, false);
  answerTarget('right');
  assert.equal(s.progress[id].mastered, true);
  assert.equal(s.progress[id].misses, 2);
  assert.ok(!s.queue.includes(id));
});

test('skip counts as a miss and requeues', () => {
  const s0 = createSession(fixture, seeded(1));
  const id = s0.queue[0];
  const { state, correct } = skip(s0, fixture, seeded(2));
  assert.equal(correct, false);
  assert.equal(state.progress[id].firstTry, 'skipped');
  assert.equal(state.progress[id].misses, 1);
  assert.ok(state.queue.indexOf(id) >= 1);
});

test('a random run always terminates with everything mastered', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const rng = seeded(seed);
    let s = createSession(fixture, rng);
    let steps = 0;
    let lastId = null;
    while (!isComplete(s)) {
      const id = s.queue[0];
      // Never shown twice in a row unless it is the only question left.
      if (id === lastId) assert.equal(s.queue.length, 1);
      const roll = rng();
      const r = roll < 0.25 ? skip(s, fixture, rng)
        : answer(s, fixture, roll < 0.5 ? wrongOf(s) : correctOf(s), rng);
      s = r.state;
      lastId = id;
      assert.ok(isSessionCompatible(s, fixture));
      assert.ok(++steps < 5000, 'run did not terminate');
    }
    const info = progressInfo(s);
    assert.equal(info.mastered, info.total);
    assert.equal(info.queueSize, 0);
  }
});

test('answering a completed session throws', () => {
  const rng = seeded(1);
  let s = createSession(fixture, rng);
  while (!isComplete(s)) s = answer(s, fixture, correctOf(s), rng).state;
  assert.throws(() => answer(s, fixture, 0, rng));
  assert.throws(() => skip(s, fixture, rng));
});

// ---------- saved-session compatibility ----------

test('isSessionCompatible rejects sessions that no longer match the quiz', () => {
  const s = createSession(fixture, seeded(1));
  assert.equal(isSessionCompatible(null, fixture), false);
  assert.equal(isSessionCompatible({ ...s, version: 999 }, fixture), false);
  assert.equal(isSessionCompatible({ ...s, quizId: 'other' }, fixture), false);

  const added = clone(fixture);
  added.questions.push({ ...clone(fixture.questions[0]), id: 'q-new' });
  assert.equal(isSessionCompatible(s, added), false);

  const dupQueue = clone(s);
  dupQueue.queue.push(dupQueue.queue[0]);
  assert.equal(isSessionCompatible(dupQueue, fixture), false);

  const lost = clone(s);
  lost.queue.pop();
  assert.equal(isSessionCompatible(lost, fixture), false, 'unmastered question missing from queue');
});

test('a session survives a JSON round trip (storage)', () => {
  const rng = seeded(9);
  let s = createSession(fixture, rng);
  s = answer(s, fixture, wrongOf(s), rng).state;
  const restored = JSON.parse(JSON.stringify(s));
  assert.ok(isSessionCompatible(restored, fixture));
  assert.deepEqual(restored, s);
});

// ---------- summary ----------

test('summarize reports first-try score, retried questions and weak topics', () => {
  const rng = seeded(2);
  let s = createSession(fixture, rng);
  // Miss q1 and q2 (topic A) and q3 (topic B) on first sight; everything else right.
  const missOnce = new Set(['q1', 'q2', 'q3']);
  const missed = new Set();
  while (!isComplete(s)) {
    const id = s.queue[0];
    const miss = missOnce.has(id) && !missed.has(id);
    if (miss) missed.add(id);
    s = answer(s, fixture, miss ? wrongOf(s) : correctOf(s), rng).state;
  }
  const sum = summarize(s, fixture);
  assert.equal(sum.total, 6);
  assert.equal(sum.firstTryCorrect, 3);
  assert.equal(sum.firstTryPercent, 50);
  assert.deepEqual(sum.retried.map((r) => r.id).sort(), ['q1', 'q2', 'q3']);
  assert.deepEqual(sum.weakTopics.map((t) => [t.topic, t.missed, t.total]), [
    ['נושא א', 2, 2],
    ['נושא ב', 1, 2],
  ]);
});

test('recordResult tracks attempts and best score', () => {
  let h = recordResult(null, { firstTryPercent: 60 }, 'd1');
  assert.deepEqual(h, { attempts: 1, bestPercent: 60, last: { percent: 60, date: 'd1' } });
  h = recordResult(h, { firstTryPercent: 40 }, 'd2');
  assert.equal(h.attempts, 2);
  assert.equal(h.bestPercent, 60);
  assert.equal(h.last.percent, 40);
});

// ---------- validation ----------

test('the fixture is valid', () => {
  assert.deepEqual(validateQuiz(fixture), []);
});

test('validateQuiz catches common authoring mistakes', () => {
  const cases = [
    [(q) => { q.id = 'Bad ID'; }, /quiz\.id/],
    [(q) => { q.title = ''; }, /title/],
    [(q) => { q.questions = []; }, /non-empty array/],
    [(q) => { q.questions[0].options.pop(); }, /exactly 4/],
    [(q) => { q.questions[0].correct = 4; }, /correct must be/],
    [(q) => { q.questions[0].correct = '1'; }, /correct must be/],
    [(q) => { q.questions[1].id = 'q1'; }, /duplicate question id/],
    [(q) => { q.questions[0].options[1].text = q.questions[0].options[0].text; }, /duplicate option text/],
    [(q) => { delete q.questions[0].topic; }, /topic/],
    [(q) => { delete q.questions[0].explanation; }, /explanation/],
    [(q) => { q.questions[0].explenation = 'typo'; }, /unknown field "explenation"/],
    [(q) => { q.questions[0].options[0].note = 5; }, /note must be a string/],
  ];
  for (const [mutate, pattern] of cases) {
    const quiz = clone(fixture);
    mutate(quiz);
    const errors = validateQuiz(quiz);
    assert.ok(errors.some((e) => pattern.test(e)), `expected ${pattern}, got ${JSON.stringify(errors)}`);
  }
  assert.deepEqual(validateQuiz([]), ['quiz must be a JSON object']);
});

test('option notes are optional', () => {
  const quiz = clone(fixture);
  delete quiz.questions[0].options[0].note;
  assert.deepEqual(validateQuiz(quiz), []);
});
