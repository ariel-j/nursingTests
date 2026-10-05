import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURVES, LOG_MIN, LOG_MAX, PK, responseAt, therapeuticIndex, classifyTI, plasmaConcentration,
} from '../js/pharma-math.js';
import { FLASHCARDS, TI_INFO } from '../js/pharma-data.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

test('a full agonist gives half its Emax at EC50 and approaches Emax at high dose', () => {
  near(responseAt(CURVES.full.logEC50, CURVES.full), 50);
  assert.ok(responseAt(LOG_MAX, CURVES.full) > 99);
  assert.ok(responseAt(LOG_MIN, CURVES.full) < 1);
});

test('a competitive antagonist shifts the curve right and keeps Emax; a non-competitive one lowers Emax', () => {
  assert.ok(CURVES.comp.logEC50 > CURVES.full.logEC50);
  assert.equal(CURVES.comp.emax, CURVES.full.emax);
  assert.ok(responseAt(-6, CURVES.comp) < responseAt(-6, CURVES.full));
  assert.ok(responseAt(LOG_MAX, CURVES.comp) > 95, 'overcome by a surplus of agonist');
  assert.equal(CURVES.noncomp.logEC50, CURVES.full.logEC50);
  assert.ok(responseAt(LOG_MAX, CURVES.noncomp) < 50, 'cannot be overcome');
});

test('a partial agonist plateaus below the full one; an inverse agonist goes below baseline', () => {
  assert.ok(responseAt(LOG_MAX, CURVES.partial) < responseAt(LOG_MAX, CURVES.full));
  const inverse = CURVES.inverse;
  near(responseAt(LOG_MIN - 20, inverse), inverse.baseline);
  assert.ok(responseAt(LOG_MAX, inverse) < inverse.baseline);
  assert.ok(responseAt(LOG_MAX, inverse) >= 0 - 1, 'ends near 0');
});

test('every curve has a name, a color and an explanation', () => {
  for (const [key, c] of Object.entries(CURVES)) {
    assert.ok(c.name && c.color && c.explain.lead && c.explain.text, key);
  }
});

test('therapeutic index is TD50 over ED50 and is banded narrow / medium / wide', () => {
  assert.equal(therapeuticIndex(10, 50), 5);
  assert.equal(classifyTI(1.99), 'narrow');
  assert.equal(classifyTI(2), 'medium');
  assert.equal(classifyTI(4.49), 'medium');
  assert.equal(classifyTI(4.5), 'wide');
  assert.equal(classifyTI(1.996), 'medium', 'compared at the two decimals shown on the page');
  for (const level of ['narrow', 'medium', 'wide']) {
    assert.ok(TI_INFO[level].title(2.5).includes('2.5'));
    assert.ok(TI_INFO[level].desc && TI_INFO[level].icon);
  }
});

test('a loading dose is above MEC at once; a gradual dose starts at zero and peaks inside the window', () => {
  assert.ok(plasmaConcentration(0, true) > PK.mec);
  assert.ok(plasmaConcentration(0, true) < PK.mtc, 'the bolus targets MEC, not MTC');
  assert.equal(plasmaConcentration(0, false), 0);
  let peak = 0;
  for (let t = 0; t <= PK.timeMax; t += 0.1) peak = Math.max(peak, plasmaConcentration(t, false));
  assert.ok(peak > PK.mec && peak < PK.mtc);
  assert.ok(PK.mec < PK.mtc && PK.mtc < PK.concMax);
});

test('flashcards are complete and unique', () => {
  assert.equal(FLASHCARDS.length, 10);
  for (const card of FLASHCARDS) assert.ok(card.q.trim() && card.a.trim());
  assert.equal(new Set(FLASHCARDS.map((c) => c.q)).size, FLASHCARDS.length);
});
