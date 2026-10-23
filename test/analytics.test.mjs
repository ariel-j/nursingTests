import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOATCOUNTER_CODE, countUrl, pagePath, shouldCount, visitorEvents } from '../js/analytics.js';

test('pagePath folds index.html and keeps only the quiz, subject and deck parameters', () => {
  assert.equal(pagePath('/nursingTests/'), '/nursingTests/');
  assert.equal(pagePath('/nursingTests/index.html'), '/nursingTests/');
  assert.equal(pagePath('/nursingTests/summaries/index.html'), '/nursingTests/summaries/');
  assert.equal(pagePath('/nursingTests/privacy.html', '?utm=x'), '/nursingTests/privacy.html');
  assert.equal(pagePath('/nursingTests/quiz.html', '?id=heart&x=1'), '/nursingTests/quiz.html?id=heart');
  assert.equal(pagePath('/nursingTests/quiz.html', '?subject=anatomy'), '/nursingTests/quiz.html?subject=anatomy');
  assert.equal(pagePath('/nursingTests/quiz.html', '?exam=1&drugs=pharmacology'),
    '/nursingTests/quiz.html?drugs=pharmacology&exam=1');
  assert.equal(pagePath('/nursingTests/', '?subject=anatomy&utm=x'), '/nursingTests/?subject=anatomy');
  assert.equal(pagePath('/nursingTests/quiz.html', '?id='), '/nursingTests/quiz.html');
});

test('visitorEvents counts a browser once a day and once a week', () => {
  const sun = new Date(2026, 9, 18, 9); // Sunday
  const first = visitorEvents(null, sun);
  assert.deepEqual(first.events, ['visitors/day/new', 'visitors/week']);
  assert.deepEqual(first.record, { day: '2026-10-18', week: '2026-10-18' });

  assert.deepEqual(visitorEvents(first.record, new Date(2026, 9, 18, 23)).events, []);

  const mon = visitorEvents(first.record, new Date(2026, 9, 19, 8));
  assert.deepEqual(mon.events, ['visitors/day/returning']);
  assert.equal(mon.record.week, '2026-10-18');

  const nextSun = visitorEvents(mon.record, new Date(2026, 9, 25, 8));
  assert.deepEqual(nextSun.events, ['visitors/day/returning', 'visitors/week']);
  assert.equal(nextSun.record.week, '2026-10-25');

  // Saturday still belongs to the week that started on the Sunday before.
  assert.equal(visitorEvents(null, new Date(2026, 9, 24, 22)).record.week, '2026-10-18');
  // Across a month and year boundary.
  assert.equal(visitorEvents(null, new Date(2027, 0, 1)).record.week, '2026-12-27');
});

test('shouldCount only on the live site, with a valid code and no opt-out', () => {
  const live = { code: 'site', hostname: 'ariel-j.github.io' };
  assert.equal(shouldCount(live), true);
  assert.equal(shouldCount({ ...live, code: '' }), false);
  assert.equal(shouldCount({ ...live, code: 'bad code/' }), false);
  for (const hostname of ['localhost', '127.0.0.1', '']) assert.equal(shouldCount({ ...live, hostname }), false);
  assert.equal(shouldCount({ ...live, doNotTrack: '1' }), false);
  assert.equal(shouldCount({ ...live, gpc: true }), false);
  assert.equal(shouldCount({ ...live, webdriver: true }), false);
  assert.equal(shouldCount({ ...live, optedOut: true }), false);
});

test('countUrl builds a GoatCounter request for page views and events', () => {
  const view = new URL(countUrl('site', { path: '/q.html?id=heart', title: 'הלב', screen: '390,844,3' }));
  assert.equal(view.origin + view.pathname, 'https://site.goatcounter.com/count');
  assert.equal(view.searchParams.get('p'), '/q.html?id=heart');
  assert.equal(view.searchParams.get('t'), 'הלב');
  assert.equal(view.searchParams.get('e'), 'false');
  const event = new URL(countUrl('site', { path: 'quiz-done/heart/full', event: true }));
  assert.equal(event.searchParams.get('e'), 'true');
});

test('the code is empty or a valid GoatCounter code', () => {
  assert.match(GOATCOUNTER_CODE, /^(?:[a-z0-9-]+)?$/);
});
