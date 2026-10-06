import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DECKS } from '../js/pharma-cards-data.js';

const PAGES = ['pharma-git', 'pharma-respiratory', 'pharma-immunosuppression'];
const read = (id) => readFile(new URL(`../summaries/${id}.html`, import.meta.url), 'utf8');

test('each summary has a full deck of unique, plain-text flashcards', () => {
  assert.deepEqual(Object.keys(DECKS).sort(), [...PAGES].sort());
  for (const id of PAGES) {
    const cards = DECKS[id];
    assert.equal(cards.length, 12, id);
    assert.equal(new Set(cards.map((c) => c.q)).size, cards.length, `${id}: duplicate question`);
    for (const c of cards) {
      assert.ok(c.q.trim() && c.a.trim(), `${id}: empty card`);
      assert.ok(!/[<>*`]/.test(c.q + c.a), `${id}: flashcards are plain text (no markup) in "${c.q}"`);
      if (c.repeats !== undefined) assert.match(c.repeats, /^נשאל בשחזורים( ×\d)?$/);
    }
  }
});

test('each page carries the deck section, its counters and the widget files', async () => {
  for (const id of PAGES) {
    const html = await read(id);
    assert.ok(html.includes(`<section id="${id}-practice" class="lab deck no-print" data-interactive`), `${id}: deck section`);
    assert.match(html, /id="flash-progress"[^>]*>0 מתוך 12/, id);
    assert.match(html, /id="card-num">1 \/ 12</, id);
    assert.ok(html.includes('src="../js/pharma-cards.js"') && html.includes('href="../css/summary-widgets.css"'), `${id}: files`);
  }
});
