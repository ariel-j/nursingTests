import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DEFAULT_THEME, THEME_KEY, THEME_LABELS, THEME_MODES, nextTheme, normalizeTheme, themeAttribute } from '../js/theme-core.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('normalizeTheme accepts the three modes and falls back to auto', () => {
  for (const m of THEME_MODES) assert.equal(normalizeTheme(m), m);
  for (const bad of [undefined, null, '', 'sepia', 3, {}]) assert.equal(normalizeTheme(bad), DEFAULT_THEME);
});

test('nextTheme cycles auto → light → dark → auto, and repairs bad input', () => {
  assert.equal(nextTheme('auto'), 'light');
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'auto');
  assert.equal(nextTheme('garbage'), 'light');
});

test('themeAttribute is null for auto, so the CSS follows the device', () => {
  assert.equal(themeAttribute('auto'), null);
  assert.equal(themeAttribute('light'), 'light');
  assert.equal(themeAttribute('dark'), 'dark');
  assert.equal(themeAttribute('x'), null);
});

test('every mode has a Hebrew label', () => {
  for (const m of THEME_MODES) assert.match(THEME_LABELS[m], /[֐-׿]/);
});

test('theme-init.js reads the same storage key as storage.js + theme-core.js', () => {
  const prefix = /const PREFIX = '([^']+)'/.exec(read('js/storage.js'))[1];
  assert.ok(read('js/theme-init.js').includes(`'${prefix}${THEME_KEY}'`));
});

test('every site page loads theme-init.js synchronously before its stylesheets', () => {
  const pages = execFileSync('git', ['ls-files', '*.html'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
    .split('\n').filter((f) => f && f !== 'design/reference.html');
  assert.ok(pages.length > 30);
  for (const f of pages) {
    const html = read(f);
    const m = /<script src="((?:\.\.\/)?)js\/theme-init\.js"><\/script>/.exec(html);
    assert.ok(m, `${f}: missing theme-init.js`);
    assert.equal(m[1], f.includes('/') ? '../' : '', `${f}: wrong relative path`);
    const css = html.indexOf('rel="stylesheet"');
    assert.ok(css === -1 || html.indexOf('theme-init.js') < css, `${f}: theme-init.js must precede the stylesheets`);
  }
});

test('every stylesheet with a dark @media block also handles the manual data-theme override', () => {
  for (const f of readdirSync(new URL('../css/', import.meta.url))) {
    const css = read(`css/${f}`);
    if (!css.includes('prefers-color-scheme: dark')) continue;
    assert.ok(css.includes('[data-theme="light"]'), `${f}: dark @media must exclude data-theme="light"`);
    assert.ok(css.includes('[data-theme="dark"]'), `${f}: missing the data-theme="dark" rules`);
  }
});
