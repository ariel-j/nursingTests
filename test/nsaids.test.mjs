import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseRich, isBalanced, EXPLORER, FLASHCARDS } from '../js/nsaids-data.js';

const html = await readFile(new URL('../summaries/nsaids.html', import.meta.url), 'utf8');
// The page's text with tags dropped, so facts can be looked up whatever markup surrounds them.
const pageText = html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<');
const plain = (source) => parseRich(source).map((s) => s.text ?? ' ').join('');

const strings = (item) => [
  ['title', item.title], ['tag', item.tag], ['lead', item.lead.text], ['pearl', item.pearl],
  ...item.boxes.map((b, i) => [`boxes[${i}]`, b.text]),
];

test('every marked-up string of the explorer is balanced and has no HTML', () => {
  for (const item of EXPLORER) {
    for (const [where, text] of strings(item)) {
      assert.ok(text.trim() !== '', `${item.key}.${where} is empty`);
      assert.ok(isBalanced(text), `${item.key}.${where} has an unclosed ** or backtick`);
      assert.ok(!/[<>]|&[a-z]+;/.test(text), `${item.key}.${where} contains HTML (text is rendered with textContent)`);
    }
  }
});

test('the explorer has the four pathway components, one tone each', () => {
  assert.deepEqual(EXPLORER.map((i) => i.key), ['pla2', 'cox1', 'cox2', 'lox']);
  assert.equal(new Set(EXPLORER.map((i) => i.tone)).size, EXPLORER.length);
  for (const item of EXPLORER) assert.equal(item.boxes.length, 3, `${item.key} has three boxes`);
});

test('the key exam facts are in the explorer data', () => {
  const by = (key) => EXPLORER.find((i) => i.key === key);
  assert.match(by('pla2').boxes[1].text, /סטרואידים/);
  assert.match(by('cox1').pearl, /7–10 ימים/);
  assert.match(by('cox2').boxes[1].text, /Celecoxib/);
  assert.match(by('lox').boxes[1].text, /Montelukast/);
});

test('buttons in the page and explorer items in the data match', () => {
  const keys = [...html.matchAll(/data-receptor="([a-z0-9_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, EXPLORER.map((i) => i.key));
});

test('what the explorer shows is also in the static text (the page works without scripts, and in all.html)', () => {
  for (const item of EXPLORER) {
    for (const [where, text] of strings(item)) {
      assert.ok(pageText.includes(plain(text).replace(/\.$/, '')), `${item.key}.${where}: "${plain(text)}" is not in the static text`);
    }
  }
});

test('there are 10 unique recall flashcards, each with a question, an answer and a repeat badge', () => {
  assert.equal(FLASHCARDS.length, 10);
  assert.equal(new Set(FLASHCARDS.map((c) => c.q)).size, FLASHCARDS.length);
  for (const c of FLASHCARDS) {
    assert.ok(c.q.trim() && c.a.trim());
    assert.match(c.repeats, /^נשאל בשחזורים( ×\d)?$/);
    assert.ok(!/[<>*]/.test(c.q + c.a), 'flashcards are plain text');
  }
});

test('the page: chapters, anchors and counters line up', () => {
  const ids = [...html.matchAll(/<section id="(ns-sec-\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, Array.from({ length: 10 }, (_, i) => `ns-sec-${i + 1}`));
  assert.match(html, /הכל \(10 פרקים\)/);
  assert.match(html, /id="ns-count"[^>]*>0 מתוך 10 פרקים/);
  for (const [, id] of html.matchAll(/href="#(ns-[a-z0-9-]+)"/g)) assert.ok(html.includes(`id="${id}"`), `no #${id}`);
  assert.match(html, /id="flash-progress"[^>]*>0 מתוך 10/);
});

test('the intro and the glossary are there, and the glossary covers the core terms', () => {
  assert.match(html, /<section class="intro"/);
  const glossary = html.slice(html.indexOf('id="ns-glossary"'), html.indexOf('id="ns-receptors"'));
  const rows = glossary.match(/<dl class="def sc">/g) ?? [];
  assert.ok(rows.length >= 40, `only ${rows.length} glossary rows`);
  for (const term of ['Prostaglandin', 'COX-1', 'Nociceptor', 'NAPQI', 'Ductus arteriosus', 'Reye']) {
    assert.ok(glossary.includes(term), `glossary is missing ${term}`);
  }
});

test('the checklist has the 12 high-yield points', () => {
  assert.match(html, /12 נקודות/);
  assert.equal((html.match(/class="pcard point sc is-exam"/g) ?? []).length, 12);
});

test('the cause → effect section has 10 rows, each with a cause, an arrow and an effect', () => {
  const section = html.slice(html.indexOf('id="ns-chains"'), html.indexOf('id="ns-sec-10"'));
  assert.equal((section.match(/class="rel sc/g) ?? []).length, 10);
  assert.equal((section.match(/class="rel-cause"/g) ?? []).length, 10);
  assert.equal((section.match(/class="rel-effect"/g) ?? []).length, 10);
});

test('the safety facts stay in the static text', () => {
  for (const fact of ['Reye', 'Celecoxib', 'N-Acetylcysteine', 'NAPQI', 'Ductus arteriosus', 'Montelukast', 'טיניטוס', '7–10 ימים']) {
    assert.ok(pageText.includes(fact), `missing: ${fact}`);
  }
});
