// Side menu on every page. A slim bar at the top of the page holds the menu button and the site
// name; the button opens a modal <dialog> drawer (focus stays inside, Esc and the backdrop close it)
// listing every subject with its parts: quizzes by unit, mixed practice, the printable exam and
// summaries and videos. Built from the manifests and the summaries list. Links are resolved from this module's
// URL, so pages in subfolders (summaries/) get the same menu.
import { findSubject, loadManifest, loadMedia, mediaCount, subjectOfQuiz, subjectPaths, subjectStats, unitAnchor } from './catalog.js';
import { SUMMARIES, summariesFor } from './summary-list.js';

const ROOT = new URL('../', import.meta.url);
const SITE_TITLE = 'תרגול למבחנים בסיעוד';
const SVG_NS = 'http://www.w3.org/2000/svg';

const href = (path) => new URL(path, ROOT).href;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function icon(d) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/** Path and query of a URL, with index.html dropped, so "./" and "index.html" compare equal. */
function pageKey(url) {
  const u = new URL(url, location.href);
  return `${u.pathname.replace(/\/index\.html$/, '/')}${u.search}`;
}
const here = pageKey(location.href);

function link(path, text, className) {
  const a = el('a', { href: href(path), text, ...(className ? { class: className } : {}) });
  // Unit links (#unit-N) jump within a page, so only plain page links can be the current page.
  if (!path.includes('#') && pageKey(a.href) === here) a.setAttribute('aria-current', 'page');
  return a;
}

/** The subject the current page is about: ?subject=, the quiz in ?id=, or a summary page's article. */
function currentSubjectId(manifest) {
  const params = new URLSearchParams(location.search);
  const bySubject = findSubject(manifest, params.get('subject'));
  if (bySubject) return bySubject.id;
  const id = params.get('id');
  if (id) return subjectOfQuiz(manifest, id)?.id ?? null;
  const system = document.querySelector('article.summary[data-system]')?.dataset.system;
  return SUMMARIES.find((s) => s.id === system)?.subject ?? null;
}

function subjectItem(subject, open, media) {
  const paths = subjectPaths(subject.id);
  const { quizCount, canMix } = subjectStats(subject);
  const items = [el('li', {}, link(paths.home, quizCount > 0 ? 'כל הבחנים' : 'דף המקצוע'))];
  subject.units.forEach((unit, i) => {
    if (unit.quizzes.length === 0) return;
    items.push(el('li', { class: 'drawer-unit' }, link(`${paths.home}#${unitAnchor(i)}`, unit.name)));
  });
  if (canMix) items.push(el('li', {}, link(paths.practice, 'תרגול לפי נושאים')));
  if (quizCount > 0) items.push(el('li', {}, link(paths.print, 'מבחן להדפסה')));
  if (summariesFor(subject.id).length > 0) items.push(el('li', {}, link(paths.summaries, 'סיכומים קצרים')));
  if (mediaCount(media, subject.id) > 0) items.push(el('li', {}, link(paths.media, 'סרטוני הסבר קצרים')));
  if (quizCount === 0) items.push(el('li', { class: 'drawer-soon', text: 'בחנים בקרוב' }));

  const details = el('details', { class: 'drawer-subject' },
    el('summary', { text: subject.name }),
    el('ul', {}, ...items));
  details.open = open;
  return el('li', {}, details);
}

function subjectsSection(manifest, media) {
  const subjects = manifest?.subjects ?? [];
  if (subjects.length === 0) return [];
  const current = currentSubjectId(manifest);
  return [
    el('h3', { class: 'drawer-heading', text: 'מקצועות' }),
    // The current subject starts open; with none (home, statement pages) every subject does.
    el('ul', { class: 'drawer-subjects' },
      ...subjects.map((s) => subjectItem(s, current === null || s.id === current, media))),
  ];
}

function build() {
  const dialog = el('dialog', { class: 'drawer', 'aria-labelledby': 'drawer-title' });
  const close = el('button', { type: 'button', class: 'drawer-close', 'aria-label': 'סגירת התפריט' },
    icon('M6 6l12 12M18 6L6 18'));
  const nav = el('nav', { 'aria-label': 'ניווט ראשי' });
  const fill = (manifest, media) => nav.replaceChildren(
    el('ul', { class: 'drawer-list' },
      el('li', {}, link('./', 'דף הבית · כל המקצועות')),
      el('li', {}, link('summaries/', 'כל הסיכומים'))),
    ...subjectsSection(manifest, media),
    el('ul', { class: 'drawer-list drawer-foot' },
      el('li', {}, link('accessibility.html', 'הצהרת נגישות')),
      el('li', {}, link('privacy.html', 'מדיניות פרטיות'))),
  );
  fill(null);
  Promise.all([loadManifest(), loadMedia()]).then(([manifest, media]) => fill(manifest, media), (err) => console.error(err));

  // The inner box takes every click inside the drawer, so a click on the dialog itself is the backdrop.
  dialog.append(el('div', { class: 'drawer-box' },
    el('div', { class: 'drawer-head' }, el('h2', { id: 'drawer-title', text: 'תפריט' }), close),
    nav));
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('a')) dialog.close();
  });
  close.addEventListener('click', () => dialog.close());

  const toggle = el('button', {
    type: 'button',
    class: 'menu-toggle',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
  }, icon('M4 7h16M4 12h16M4 17h16'), el('span', { text: 'תפריט' }));
  toggle.addEventListener('click', () => {
    dialog.showModal();
    toggle.setAttribute('aria-expanded', 'true');
  });
  dialog.addEventListener('close', () => toggle.setAttribute('aria-expanded', 'false'));

  const bar = el('header', { class: 'site-bar' },
    el('div', { class: 'site-bar-inner' }, toggle, el('a', { class: 'site-name', href: href('./'), text: SITE_TITLE })));
  document.body.prepend(bar);
  document.body.append(dialog);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', build, { once: true });
} else {
  build();
}
