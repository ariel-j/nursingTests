import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseRich, isBalanced, ORGAN_MODES, SYNAPSE_STEPS, NMJ, FLASHCARDS,
} from '../js/parasympathetic-data.js';

/** Every marked-up string in the widget data, with where it lives. */
function allStrings() {
  const out = [];
  for (const [mode, list] of Object.entries(ORGAN_MODES)) {
    list.forEach((o, i) => { for (const k of ['badge', 'title', 'desc', 'drug']) out.push([`organs.${mode}[${i}].${k}`, o[k]]); });
  }
  SYNAPSE_STEPS.forEach((s, i) => { for (const k of ['nav', 'title', 'desc', 'targets', 'alert']) out.push([`steps[${i}].${k}`, s[k]]); });
  for (const [state, v] of Object.entries(NMJ)) {
    out.push([`nmj.${state}.button`, v.button]);
    for (const k of ['curare', 'succ']) out.push([`nmj.${state}.${k}.lead`, v[k].lead], [`nmj.${state}.${k}.text`, v[k].text]);
  }
  return out;
}

test('parseRich splits bold, Latin and line breaks, and nests bold inside Latin', () => {
  assert.deepEqual(parseRich('א **ב** `C` ד'), [
    { text: 'א ', bold: false, en: false },
    { text: 'ב', bold: true, en: false },
    { text: ' ', bold: false, en: false },
    { text: 'C', bold: false, en: true },
    { text: ' ד', bold: false, en: false },
  ]);
  assert.deepEqual(parseRich('**`Atropine`**'), [{ text: 'Atropine', bold: true, en: true }]);
  assert.deepEqual(parseRich('א\nב'), [
    { text: 'א', bold: false, en: false }, { br: true }, { text: 'ב', bold: false, en: false },
  ]);
  assert.deepEqual(parseRich(''), []);
});

test('isBalanced catches an unclosed ** or `', () => {
  assert.ok(isBalanced('**a** `b`'));
  assert.ok(!isBalanced('**a'));
  assert.ok(!isBalanced('`b'));
});

test('every marked-up string is balanced and non-empty, and no HTML slipped in', () => {
  for (const [where, text] of allStrings()) {
    assert.ok(text.trim() !== '', `${where} is empty`);
    assert.ok(isBalanced(text), `${where} has an unclosed ** or backtick`);
    assert.ok(!/[<>]|&[a-z]+;/.test(text), `${where} contains HTML (text is rendered with textContent)`);
  }
});

test('the organ simulator compares the same six organs in both modes', () => {
  assert.equal(ORGAN_MODES.cholinergic.length, 6);
  assert.equal(ORGAN_MODES.antichol.length, 6);
  const icons = (mode) => ORGAN_MODES[mode].map((o) => o.icon).sort();
  assert.deepEqual(icons('antichol').filter((i) => i !== '🔥'), icons('cholinergic').filter((i) => i !== '💧'));
});

test('the synapse explorer has the six steps, with the key drugs and toxins', () => {
  assert.equal(SYNAPSE_STEPS.length, 6);
  const text = (i) => `${SYNAPSE_STEPS[i].targets} ${SYNAPSE_STEPS[i].desc}`;
  assert.match(text(0), /Hemicholinium/);
  assert.match(text(1), /Vesamicol/);
  assert.match(text(2), /Botox/);
  assert.match(text(4), /Neostigmine/);
});

test('NMJ: Neostigmine reverses the competitive block and does not reverse succinylcholine', () => {
  assert.match(NMJ.injected.curare.lead, /Reversed/);
  assert.match(NMJ.injected.succ.lead, /NOT Reversed/);
  assert.ok(NMJ.start.curare.text && NMJ.start.succ.text);
});

test('there are 13 unique recall flashcards, each with a question and an answer', () => {
  assert.equal(FLASHCARDS.length, 13);
  assert.equal(new Set(FLASHCARDS.map((c) => c.q)).size, FLASHCARDS.length);
  for (const c of FLASHCARDS) assert.ok(c.q.trim() && c.a.trim());
});

test('the page has one "שחזור N" point per flashcard, and every ps- anchor it links to exists', async () => {
  const html = await readFile(new URL('../summaries/parasympathetic.html', import.meta.url), 'utf8');
  for (let n = 1; n <= FLASHCARDS.length; n++) assert.ok(html.includes(`<span class="exam">שחזור ${n}</span>`), `missing point ${n}`);
  for (const [, id] of html.matchAll(/href="#(ps-[a-z0-9-]+)"/g)) assert.ok(html.includes(`id="${id}"`), `no #${id}`);
  assert.match(html, /id="flash-progress"[^>]*>0 מתוך 13/);
});
