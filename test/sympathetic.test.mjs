import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseRich, isBalanced, RECEPTORS, FLASHCARDS, studyProgress, toggleDone,
} from '../js/sympathetic-data.js';

const html = await readFile(new URL('../summaries/sympathetic.html', import.meta.url), 'utf8');
// The page's text with tags dropped, so facts can be looked up whatever markup surrounds them.
const pageText = html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&gt;/g, '>');
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

test('the explorer has the six receptors, each with a G protein that matches its tone', () => {
  assert.deepEqual(RECEPTORS.map((r) => r.key), ['alpha1', 'alpha2', 'beta1', 'beta2', 'beta3', 'd1']);
  const tone = { Gq: 'amber', Gi: 'rose', Gs: 'blue' };
  for (const r of RECEPTORS) assert.equal(r.tone, tone[r.g], `${r.key}: ${r.g} should be ${tone[r.g]}`);
  assert.deepEqual(RECEPTORS.filter((r) => r.g !== 'Gs').map((r) => r.symbol), ['α1', 'α2']);
});

test('the key exam facts are in the receptor data', () => {
  const by = (key) => RECEPTORS.find((r) => r.key === key);
  assert.match(by('alpha1').agonists, /Phenylephrine/);
  assert.match(by('alpha2').agonists, /Clonidine/);
  assert.match(by('alpha2').pearl, /Rebound Hypertension/);
  assert.match(by('beta1').antagonists, /Atenolol/);
  assert.match(by('beta2').antagonists, /Propranolol/);
  assert.match(by('beta2').effects.join(' '), /Bronchodilation/);
});

test('buttons in the page and receptors in the data match', async () => {
  const keys = [...html.matchAll(/data-receptor="([a-z0-9]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, RECEPTORS.map((r) => r.key));
});

test('what the explorer shows is also in the static text (the page works without scripts, and in all.html)', () => {
  for (const r of RECEPTORS) {
    // Drug names: every Latin name in the agonist / antagonist lists.
    for (const name of plain(`${r.agonists} ${r.antagonists}`).match(/[A-Z][A-Za-z]{3,}/g) ?? []) {
      assert.ok(pageText.includes(name), `${r.key}: ${name} is not in the static text`);
    }
    for (const effect of r.effects) {
      for (const term of plain(effect).match(/[A-Z][A-Za-z]{4,}/g) ?? []) {
        assert.ok(pageText.includes(term), `${r.key}: "${term}" (from "${plain(effect)}") is not in the static text`);
      }
    }
  }
});

test('there are 10 unique recall flashcards, each with a question, an answer and a repeat badge', () => {
  assert.equal(FLASHCARDS.length, 10);
  assert.equal(new Set(FLASHCARDS.map((c) => c.q)).size, FLASHCARDS.length);
  for (const c of FLASHCARDS) {
    assert.ok(c.q.trim() && c.a.trim());
    assert.match(c.repeats, /^נשאל בשחזורים( ×\d)?$/);
  }
});

test('the page: one point per exam flashcard topic, ids and anchors line up, chapter count is right', () => {
  const ids = [...html.matchAll(/<section id="(sy-sec-\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, Array.from({ length: 10 }, (_, i) => `sy-sec-${i + 1}`));
  assert.match(html, /הכל \(10 פרקים\)/);
  assert.match(html, /id="sy-count"[^>]*>0 מתוך 10 פרקים/);
  for (const [, id] of html.matchAll(/href="#(sy-[a-z0-9-]+)"/g)) assert.ok(html.includes(`id="${id}"`), `no #${id}`);
  assert.match(html, /id="flash-progress"[^>]*>0 מתוך 10/);
  assert.equal((html.match(/class="pcard point sc is-exam"/g) ?? []).length, 10);
});

test('the cause → effect section has 10 rows, each with a cause, an arrow and an effect', () => {
  const section = html.slice(html.indexOf('id="sy-chains"'), html.indexOf('id="sy-sec-10"'));
  assert.equal((section.match(/class="rel sc/g) ?? []).length, 10);
  assert.equal((section.match(/class="rel-cause"|class="rel-cause">/g) ?? []).length, 10);
  assert.equal((section.match(/class="rel-effect"/g) ?? []).length, 10);
});

test('studyProgress counts only chapters that exist, once each, and survives bad saved data', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(studyProgress(['a', 'c'], ids), { done: ['a', 'c'], count: 2, total: 4, percent: 50 });
  assert.deepEqual(studyProgress(['a', 'a', 'gone'], ids), { done: ['a'], count: 1, total: 4, percent: 25 });
  assert.deepEqual(studyProgress(ids, ids).percent, 100);
  for (const bad of [null, undefined, 'a', 7, { a: 1 }]) assert.deepEqual(studyProgress(bad, ids), { done: [], count: 0, total: 4, percent: 0 });
  assert.equal(studyProgress(['a'], []).percent, 0);
});

test('toggleDone adds and removes a mark and keeps the page order', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(toggleDone(['c'], 'a', true, ids), ['a', 'c']);
  assert.deepEqual(toggleDone(['a', 'c'], 'a', false, ids), ['c']);
  assert.deepEqual(toggleDone(['a'], 'a', true, ids), ['a']);
  assert.deepEqual(toggleDone([], 'a', false, ids), []);
});
