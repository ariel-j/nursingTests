import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// WCAG contrast of the per-subject palettes in css/style.css ([data-subject="..."] rules).
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const palettes = [...css.matchAll(/\[data-subject="([a-z0-9-]+)"\]\s*\{([^}]*)\}/g)].map(([, id, body]) => ({
  id,
  vars: Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(([, k, v]) => [k, v])),
}));

// Page surfaces of the base tokens.
const LIGHT = { surface: '#FFFFFF', bg: '#F6F5F2' };
const DARK = { surface: '#1B1A21', bg: '#121116' };

test('every subject in subjects.json has a palette, and each palette is complete', () => {
  const subjects = JSON.parse(readFileSync(new URL('../quizzes/subjects.json', import.meta.url), 'utf8')).subjects;
  const ids = palettes.map((p) => p.id);
  for (const s of subjects) assert.ok(ids.includes(s.id), `no [data-subject="${s.id}"] palette`);
  for (const p of palettes) {
    for (const k of ['s', 's-soft', 's-ink', 'd', 'd-soft', 'd-ink']) assert.ok(p.vars[k], `${p.id}: missing --${k}`);
  }
});

for (const p of palettes) {
  test(`${p.id}: light palette is readable (AA, 4.5:1)`, () => {
    const v = p.vars;
    assert.ok(ratio('#FFFFFF', v.s) >= 4.5, 'white text on accent');
    assert.ok(ratio(v.s, LIGHT.surface) >= 4.5, 'accent text on surface');
    assert.ok(ratio(v.s, LIGHT.bg) >= 4.5, 'accent text on page background');
    assert.ok(ratio(v['s-ink'], v['s-soft']) >= 4.5, 'ink on soft');
    assert.ok(ratio(v.s, v['s-soft']) >= 4.5, 'accent on soft');
  });
  test(`${p.id}: dark palette is readable (AA, 4.5:1)`, () => {
    const v = p.vars;
    assert.ok(ratio(DARK.surface, v.d) >= 4.5, 'surface-colored text on accent (buttons)');
    assert.ok(ratio(v.d, DARK.surface) >= 4.5, 'accent text on surface');
    assert.ok(ratio(v.d, DARK.bg) >= 4.5, 'accent text on page background');
    assert.ok(ratio(v['d-ink'], v['d-soft']) >= 4.5, 'ink on soft');
    assert.ok(ratio(v.d, v['d-soft']) >= 4.5, 'accent on soft');
  });
}
