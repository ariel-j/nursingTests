import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOATCOUNTER_CODE, countUrl, pagePath, shouldCount, visitorEvents } from '../js/analytics.js';

test('pagePath drops the site folder and .html, folds index.html and keeps only the quiz, subject and deck parameters', () => {
  const at = (pathname, search) => pagePath(pathname, search, '/nursingTests/');
  assert.equal(at('/nursingTests/'), '/');
  assert.equal(at('/nursingTests/index.html'), '/');
  assert.equal(at('/nursingTests/summaries/index.html'), '/summaries/');
  assert.equal(at('/nursingTests/privacy.html', '?utm=x'), '/privacy');
  assert.equal(at('/nursingTests/quiz.html', '?id=heart&x=1'), '/quiz?id=heart');
  assert.equal(at('/nursingTests/quiz.html', '?subject=anatomy'), '/quiz?subject=anatomy');
  assert.equal(at('/nursingTests/quiz.html', '?exam=1&drugs=pharmacology'), '/quiz?drugs=pharmacology&exam=1');
  assert.equal(at('/nursingTests/', '?subject=anatomy&utm=x'), '/?subject=anatomy');
  assert.equal(at('/nursingTests/quiz.html', '?id='), '/quiz');
  assert.equal(at('/nursingTests/media.html', '?topic=NSAID&subject=pharmacology'), '/media?subject=pharmacology&topic=NSAID');
  assert.equal(at('/nursingTests/quiz.html', '?group=A&subject=anatomy'), '/quiz?subject=anatomy&group=A');
  assert.equal(pagePath('/quiz.html', '?id=heart'), '/quiz?id=heart'); // site at the domain root
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
