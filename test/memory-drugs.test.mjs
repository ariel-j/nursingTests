import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDrugs, drugErrors, loadDrugs, slug } from '../scripts/memory-drugs.mjs';

const USES = { 'placebo-a': 'שימוש קצר' };
const source = (extra = {}) => ({
  meta: { lecturers: ['placeholder'] },
  drugs: [{
    rank: 2, name: 'Placebo A', family: 'משפחה', topic: 'נושא', indication: 'התוויה',
    side_effects: ['אחת', ' '], explanation: 'הסבר',
    evidence: { score: 9 }, ...extra,
  }],
});

test('slug makes url-safe ids', () => {
  assert.equal(slug('Valproic acid'), 'valproic-acid');
  assert.equal(slug('Vitamin K'), 'vitamin-k');
  assert.equal(slug('Amoxicillin/Augmentin'), 'amoxicillin-augmentin');
});

test('buildDrugs keeps only the game fields and drops sources and statistics', () => {
  const { drugs } = buildDrugs(source(), USES);
  assert.deepEqual(Object.keys(drugs[0]).sort(), ['explanation', 'family', 'id', 'indication', 'name', 'rank', 'sideEffects', 'topic', 'use']);
  assert.deepEqual(drugs[0].sideEffects, ['אחת']);
  assert.equal(drugs[0].id, 'placebo-a');
});

test('buildDrugs rejects a source with missing fields', () => {
  assert.throws(() => buildDrugs({}), /drugs/);
  assert.throws(() => buildDrugs(source({ explanation: '' })), /explanation/);
  assert.throws(() => buildDrugs(source({ side_effects: undefined })), /side_effects/);
});

test('buildDrugs leaves the short use empty when none is known, and drugErrors then asks for it', () => {
  const one = buildDrugs(source()).drugs[0];
  assert.equal(one.use, '');
  const many = Array.from({ length: 8 }, (_, i) => ({ ...one, id: `d${i}`, name: `Drug ${i}`, use: i === 0 ? '' : 'קצר' }));
  assert.ok(drugErrors({ drugs: many }).some((e) => /missing "use"/.test(e)));
});

test('drugErrors keeps the short use short', () => {
  const one = buildDrugs(source(), USES).drugs[0];
  const many = (use) => Array.from({ length: 8 }, (_, i) => ({ ...one, id: `d${i}`, name: `Drug ${i}`, use: i === 0 ? use : 'קצר' }));
  assert.ok(drugErrors({ drugs: many('א'.repeat(61)) }).some((e) => /longer than 60/.test(e)));
  assert.deepEqual(drugErrors({ drugs: many('קצר') }), []);
});

test('drugErrors flags duplicates, bad ids and unexpected fields', () => {
  const one = buildDrugs(source(), USES).drugs[0];
  const many = (n) => Array.from({ length: n }, (_, i) => ({ ...one, id: `d${i}`, name: `Drug ${i}` }));
  assert.deepEqual(drugErrors({ drugs: many(8) }), []);
  assert.ok(drugErrors({ drugs: many(3) })[0].includes('at least 8'));
  const dup = many(8);
  dup[1].id = dup[0].id;
  assert.ok(drugErrors({ drugs: dup }).some((e) => /duplicate id/.test(e)));
  const extra = many(8);
  extra[0].evidence = { score: 1 };
  assert.ok(drugErrors({ drugs: extra }).some((e) => /unexpected field "evidence"/.test(e)));
  const bad = many(8);
  bad[0].id = 'Bad Id';
  assert.ok(drugErrors({ drugs: bad }).some((e) => /bad id/.test(e)));
});

test('the published games/drugs.json is valid', async () => {
  const data = await loadDrugs();
  assert.deepEqual(drugErrors(data), []);
  assert.equal(data.drugs.length, 70);
});

test('memory.html keeps the site rules: toolbar, footer links, no external or inline code', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../memory.html', import.meta.url), 'utf8');
  assert.ok(html.includes('src="js/a11y.js"'));
  assert.ok(html.includes('href="accessibility.html"') && html.includes('href="privacy.html"'));
  assert.ok(!/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(html));
  assert.ok(!/<[^>]+\s(?:on[a-z]+|style)\s*=/i.test(html));
});
