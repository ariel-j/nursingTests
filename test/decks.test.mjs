import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, countDecks, countQuizzes, loadAll, loadDecks } from '../scripts/quizzes.mjs';

const FIXTURE_DECKS = fileURLToPath(new URL('./fixtures/decks/', import.meta.url));
const catalog = { subjects: [{ name: 'אנטומיה', units: ['הלב', 'הנשימה'] }, { name: 'פרמקולוגיה' }] };
const deck = (id, subject, title, cards, unit) => ({ id, subject, unit, title, cards: cards.map((topic, i) => ({ id: `c${i}`, front: 'f', back: 'b', ...(topic ? { topic } : {}) })) });
const quiz = (id, subject, title, unit) => ({ id, subject, unit, title, questions: [{ topic: 'x' }] });

test('buildManifest adds decks next to quizzes at subject and unit level, titles numeric-aware', () => {
  const m = buildManifest(
    [quiz('q1', 'אנטומיה', 'מבחן 1', 'הלב')],
    catalog,
    [
      deck('d10', 'אנטומיה', 'חפיסה 10', ['א', 'ב'], 'הלב'),
      deck('d2', 'אנטומיה', 'חפיסה 2', ['א', 'א', undefined], 'הלב'),
      deck('dp', 'פרמקולוגיה', 'כללי', ['א']),
    ],
  );
  const heart = m.subjects[0].units[0];
  assert.deepEqual(heart.flashcards.map((d) => d.id), ['d2', 'd10']);
  assert.deepEqual(heart.flashcards[0], { id: 'd2', title: 'חפיסה 2', description: '', cardCount: 3, topicCount: 2 }, 'a card without a topic counts as one topic');
  assert.deepEqual(heart.quizzes.map((q) => q.id), ['q1']);
  assert.deepEqual(m.subjects[0].units[1].flashcards, [], 'empty unit keeps an empty list');
  assert.deepEqual(m.subjects[1].flashcards.map((d) => d.id), ['dp'], 'deck directly on a unit-less subject');
  assert.deepEqual(m.subjects[0].flashcards, []);
  assert.equal(countDecks(m), 3);
  assert.equal(countQuizzes(m), 1);
});

test('buildManifest without decks still has empty flashcards lists (stable shape)', () => {
  const m = buildManifest([], catalog);
  assert.deepEqual(m.subjects[0].units.map((u) => u.flashcards), [[], []]);
  assert.deepEqual(m.subjects[1].flashcards, []);
  assert.equal(countDecks(m), 0);
  assert.equal(countDecks({ subjects: [{ units: [{}] }] }), 0, 'tolerates an old manifest');
});

test('loadDecks validates files, file name and placement; a missing folder is fine', async () => {
  assert.deepEqual(await loadDecks(path.join(FIXTURE_DECKS, 'nope')), []);
  const placed = { subjects: [{ name: 'נושא לבדיקות' }] };
  const ok = await loadDecks(FIXTURE_DECKS, placed);
  assert.deepEqual(ok.map((e) => [e.file, e.errors]), [['flashcards/sample-deck.json', []]]);
  const bad = await loadDecks(FIXTURE_DECKS, { subjects: [{ name: 'אחר' }] });
  assert.ok(bad[0].errors.some((e) => /not in/.test(e)));

  const dir = await mkdtemp(path.join(tmpdir(), 'decks-'));
  try {
    await writeFile(path.join(dir, 'wrong-name.json'), JSON.stringify(deck('other-id', 'נושא לבדיקות', 'כותרת', ['א'])));
    await writeFile(path.join(dir, 'broken.json'), '{ not json');
    await writeFile(path.join(dir, 'invalid.json'), JSON.stringify({ id: 'invalid', subject: 's', title: 't', cards: [] }));
    await writeFile(path.join(dir, 'ignored.txt'), 'x');
    const entries = await loadDecks(dir, placed);
    const by = Object.fromEntries(entries.map((e) => [e.file, e.errors]));
    assert.deepEqual(Object.keys(by).sort(), ['flashcards/broken.json', 'flashcards/invalid.json', 'flashcards/wrong-name.json']);
    assert.ok(by['flashcards/wrong-name.json'].some((e) => /file name must be/.test(e)));
    assert.ok(by['flashcards/broken.json'].some((e) => /cannot parse/.test(e)));
    assert.ok(by['flashcards/invalid.json'].some((e) => /non-empty array/.test(e)));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('loadAll reads decks only from the real folder or an explicit one (fixtures never see real decks)', async () => {
  const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
  const dir = await mkdtemp(path.join(tmpdir(), 'all-'));
  try {
    await mkdir(path.join(dir, 'q'));
    await writeFile(path.join(dir, 'q', 'subjects.json'), JSON.stringify({ subjects: [{ name: 'נושא לבדיקות' }] }));
    const without = await loadAll(path.join(dir, 'q'));
    assert.deepEqual(without.deckEntries, [], 'custom quiz folder -> no implicit decks');
    const withDecks = await loadAll(path.join(dir, 'q'), FIXTURE_DECKS);
    assert.equal(withDecks.deckEntries.length, 1);
    assert.equal(withDecks.failures, 0);
    void fixtures;
  } finally {
    await rm(dir, { recursive: true });
  }
});
