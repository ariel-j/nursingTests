import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPTION_LETTERS, allocateByTopic, buildPrintExam } from '../js/core.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/sample-quiz.json', import.meta.url), 'utf8'));
const clone = (v) => structuredClone(v);

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

// ---------- allocateByTopic ----------

test('allocateByTopic splits proportionally and sums to the count', () => {
  const sizes = [{ topic: 'a', count: 50 }, { topic: 'b', count: 30 }, { topic: 'c', count: 20 }];
  assert.deepEqual([...allocateByTopic(sizes, 10)], [['a', 5], ['b', 3], ['c', 2]]);
  for (let n = 0; n <= 100; n++) {
    const split = allocateByTopic(sizes, n);
    assert.equal([...split.values()].reduce((s, v) => s + v, 0), n);
    for (const { topic, count } of sizes) assert.ok(split.get(topic) <= count);
  }
});

test('allocateByTopic gives remainders to the largest fractions, ties to the first topic', () => {
  const sizes = [{ topic: 'a', count: 1 }, { topic: 'b', count: 1 }, { topic: 'c', count: 1 }];
  assert.deepEqual([...allocateByTopic(sizes, 2)], [['a', 1], ['b', 1], ['c', 0]]);
  const uneven = [{ topic: 'a', count: 2 }, { topic: 'b', count: 7 }];
  // Exact shares 0.67 and 2.33: the remainder goes to a.
  assert.deepEqual([...allocateByTopic(uneven, 3)], [['a', 1], ['b', 2]]);
});

test('allocateByTopic clamps the count to what is available', () => {
  const sizes = [{ topic: 'a', count: 2 }, { topic: 'b', count: 3 }];
  assert.deepEqual([...allocateByTopic(sizes, 99)], [['a', 2], ['b', 3]]);
  assert.deepEqual([...allocateByTopic(sizes, -4)], [['a', 0], ['b', 0]]);
  assert.deepEqual([...allocateByTopic([], 5)], []);
});

// ---------- buildPrintExam ----------

test('buildPrintExam defaults to every topic and caps at the quiz size', () => {
  const exam = buildPrintExam(fixture, {}, seeded(1));
  assert.equal(exam.length, fixture.questions.length);
  assert.deepEqual(exam.map((q) => q.number), exam.map((_, i) => i + 1));
  assert.deepEqual(new Set(exam.map((q) => q.id)).size, exam.length);
});

test('buildPrintExam samples only chosen topics, spread across them', () => {
  const topics = [...new Set(fixture.questions.map((q) => q.topic))];
  const exam = buildPrintExam(fixture, { topics: topics.slice(0, 2), count: 2 }, seeded(2));
  assert.equal(exam.length, 2);
  assert.deepEqual(new Set(exam.map((q) => q.topic)), new Set(topics.slice(0, 2)));
});

test('buildPrintExam letters the shuffled options and keys the correct one', () => {
  for (let seed = 0; seed < 20; seed++) {
    for (const q of buildPrintExam(fixture, {}, seeded(seed))) {
      const source = fixture.questions.find((s) => s.id === q.id);
      assert.deepEqual(q.options.map((o) => o.letter), OPTION_LETTERS);
      assert.deepEqual(q.options.map((o) => o.text).sort(), source.options.map((o) => o.text).sort());
      assert.equal(q.correctText, source.options[source.correct].text);
      assert.equal(q.options[OPTION_LETTERS.indexOf(q.correctLetter)].text, q.correctText);
      assert.equal(q.explanation, source.explanation);
    }
  }
});

test('buildPrintExam by-topic groups topics in order and keeps authored order inside', () => {
  const exam = buildPrintExam(fixture, { order: 'by-topic' }, seeded(3));
  assert.deepEqual(exam.map((q) => q.id), fixture.questions.map((q) => q.id).filter((id) =>
    exam.some((q) => q.id === id)));
  const topicOrder = [...new Set(fixture.questions.map((q) => q.topic))];
  const seen = exam.map((q) => topicOrder.indexOf(q.topic));
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
});

test('buildPrintExam is reproducible with the same rng and does not mutate the quiz', () => {
  const before = clone(fixture);
  assert.deepEqual(buildPrintExam(fixture, { count: 4 }, seeded(9)), buildPrintExam(fixture, { count: 4 }, seeded(9)));
  assert.deepEqual(fixture, before);
});

test('buildPrintExam rejects an unknown order', () => {
  assert.throws(() => buildPrintExam(fixture, { order: 'alphabetical' }), /unknown print order/);
});
