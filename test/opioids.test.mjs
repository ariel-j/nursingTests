import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseRich, isBalanced, RECEPTORS, FLASHCARDS } from '../js/opioids-data.js';

const html = await readFile(new URL('../summaries/opioids.html', import.meta.url), 'utf8');
// The page's text with tags dropped, so facts can be looked up whatever markup surrounds them.
const pageText = html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<');
const plain = (source) => parseRich(source).map((s) => s.text ?? ' ').join('');

test('every marked-up string of the receptor explorer is balanced and has no HTML', () => {
  for (const r of RECEPTORS) {
    const strings = { title: r.title, pathway: r.pathway, organs: r.organs, agonists: r.agonists, antagonists: r.antagonists, pearl: r.pearl };
    r.effects.forEach((e, i) => { strings[`effects[${i}]`] = e; });
    for (const [where, text] of Object.entries(strings)) {
      assert.ok(text.trim() !== '', `${r.key}.${where} is empty`);
      assert.ok(isBalanced(text), `${r.key}.${where} has an unclosed ** or backtick`);
      assert.ok(!/[<>]|&[a-z]+;/.test(text), `${r.key}.${where} contains HTML (text is rendered with textContent)`);
    }
  }
});

test('the explorer has the four receptors, all coupled to an inhibitory G protein', () => {
  assert.deepEqual(RECEPTORS.map((r) => r.key), ['mu', 'kappa', 'delta', 'peripheral_mu']);
  for (const r of RECEPTORS) assert.match(r.g, /^Gi/, `${r.key} should be Gi`);
  assert.equal(new Set(RECEPTORS.map((r) => r.tone)).size, RECEPTORS.length, 'one tone per receptor');
});

test('the key exam facts are in the receptor data', () => {
  const by = (key) => RECEPTORS.find((r) => r.key === key);
  assert.match(by('mu').antagonists, /Naloxone/);
  assert.match(by('mu').pearl, /Miosis/);
  assert.match(by('kappa').pearl, /דיספוריה/);
  assert.match(by('peripheral_mu').antagonists, /Methylnaltrexone/);
  assert.match(by('peripheral_mu').agonists, /Loperamide/);
});

test('buttons in the page and receptors in the data match', () => {
  const keys = [...html.matchAll(/data-receptor="([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, RECEPTORS.map((r) => r.key));
});

test('what the explorer shows is also in the static text (the page works without scripts, and in all.html)', () => {
  for (const r of RECEPTORS) {
    for (const name of plain(`${r.agonists} ${r.antagonists}`).match(/[A-Z][A-Za-z]{3,}/g) ?? []) {
      assert.ok(pageText.includes(name), `${r.key}: ${name} is not in the static text`);
    }
    for (const effect of r.effects) {
      for (const term of plain(effect).match(/[A-Z][A-Za-z]{4,}/g) ?? []) {
        assert.ok(pageText.includes(term), `${r.key}: "${term}" (from "${plain(effect)}") is not in the static text`);
      }
    }
    for (const text of [r.title, r.pathway, r.organs, r.pearl, ...r.effects]) {
      assert.ok(pageText.includes(plain(text).replace(/\.$/, '')), `${r.key}: "${plain(text)}" is not in the static text`);
    }
  }
});

test('there are 10 unique recall flashcards, each with a question, an answer and a repeat badge', () => {
  assert.equal(FLASHCARDS.length, 10);
  assert.equal(new Set(FLASHCARDS.map((c) => c.q)).size, FLASHCARDS.length);
  for (const c of FLASHCARDS) {
    assert.ok(c.q.trim() && c.a.trim());
    assert.match(c.repeats, /^נשאל בשחזורים( ×\d)?$/);
    assert.ok(!/[<>]/.test(c.q + c.a), 'flashcards are plain text');
  }
});

test('the page: chapters, anchors and counters line up', () => {
  const ids = [...html.matchAll(/<section id="(op-sec-\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, Array.from({ length: 11 }, (_, i) => `op-sec-${i + 1}`));
  assert.match(html, /הכל \(11 פרקים\)/);
  assert.match(html, /id="op-count"[^>]*>0 מתוך 11 פרקים/);
  for (const [, id] of html.matchAll(/href="#(op-[a-z0-9-]+)"/g)) assert.ok(html.includes(`id="${id}"`), `no #${id}`);
  assert.match(html, /id="flash-progress"[^>]*>0 מתוך 10/);
});

test('the checklist has the 13 high-yield points', () => {
  assert.match(html, /13 נקודות זהב/);
  assert.equal((html.match(/class="pcard point sc is-exam"/g) ?? []).length, 13);
});

test('the cause → effect section has 10 rows, each with a cause, an arrow and an effect', () => {
  const section = html.slice(html.indexOf('id="op-chains"'), html.indexOf('id="op-sec-11"'));
  assert.equal((section.match(/class="rel sc/g) ?? []).length, 10);
  assert.equal((section.match(/class="rel-cause"|class="rel-cause">/g) ?? []).length, 10);
  assert.equal((section.match(/class="rel-effect"/g) ?? []).length, 10);
});

test('the safety facts stay in the static text', () => {
  for (const fact of ['אישוני סיכה', 'Naloxone', 'אסור לרסק טבליות', 'Re-sedation', 'Acute Precipitated Withdrawal', 'אסור לחלוטין ליילודים', 'Normeperidine']) {
    assert.ok(pageText.includes(fact), `missing: ${fact}`);
  }
});
