// Study tools for the plain pharmacology summaries (opt-in: a page loads this file and
// css/summary-study.css): links to the other summaries of the subject, search, self-test (hide the
// effect of each cause → effect row until clicked), exam focus (dim all but the "asked in exams"
// list) and a learned-checklist with progress. Everything is built with the DOM APIs, nothing is
// written as HTML. The tools live on the page, not inside the <article>, so the combined print
// page (all.html) stays clean. The checklist is stored per summary via storage.js.
import { SUMMARIES, summariesFor, summaryFile } from './summary-list.js';
import { load, save } from './storage.js';
import { matchesQuery, percent, textKey, validChecks } from './summary-logic.js';

const checksKey = (id) => `summary-checks:${id}`;

const article = document.querySelector('article.summary');
if (article) init(article);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function scrollTo(node) {
  const calm = document.documentElement.dataset.motion === 'off'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
}

function init(article) {
  const id = article.dataset.system;
  const entry = SUMMARIES.find((s) => s.id === id);
  const bar = el('div', 'study no-print');

  if (entry) bar.append(buildNav(entry));
  const tools = el('div', 'study-tools');
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-label', 'כלי למידה');
  const status = el('p', 'study-status');
  status.setAttribute('role', 'status');

  tools.append(buildSearch(article, status), buildToggle('בחן את עצמך', (on) => setRecall(article, on)),
    buildToggle('מיקוד שחזורים', (on) => setFocus(article, on)));
  bar.append(tools, status);

  const progress = buildChecklist(article, id);
  if (progress) bar.append(progress);

  prepareEffects(article);
  article.before(bar);
}

/** Links to the other summaries of the same subject; the current one is marked. */
function buildNav(entry) {
  const nav = el('nav', 'study-nav');
  nav.setAttribute('aria-label', 'סיכומים באותו נושא');
  const list = el('ul');
  for (const s of summariesFor(entry.subject)) {
    const link = el('a', null, s.title);
    link.href = summaryFile(s.id);
    if (s.id === entry.id) link.setAttribute('aria-current', 'page');
    const item = el('li');
    item.append(link);
    list.append(item);
  }
  nav.append(list);
  return nav;
}

function buildToggle(label, onChange) {
  const btn = el('button', 'secondary study-toggle', label);
  btn.type = 'button';
  btn.setAttribute('aria-pressed', 'false');
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    onChange(on);
  });
  return btn;
}

// ---------- search ----------

const ITEM_SELECTOR = '.def, .rel, .call, .flags li, :scope > p:not(.sec-note), :scope > ul > li';

function buildSearch(article, status) {
  const wrap = el('label', 'study-search');
  wrap.append(el('span', 'study-label', 'חיפוש בסיכום'));
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'חיפוש תרופה, מושג או תופעה…';
  input.autocomplete = 'off';
  wrap.append(input);

  input.addEventListener('input', () => {
    const query = input.value;
    const searching = query.trim() !== '';
    let shown = 0;
    for (const section of article.querySelectorAll('section')) {
      const titleHit = matchesQuery(section.querySelector('h2')?.textContent ?? '', query);
      let any = false;
      for (const item of section.querySelectorAll(ITEM_SELECTOR)) {
        const hit = titleHit || matchesQuery(item.textContent, query);
        item.hidden = !hit;
        if (hit) { any = true; shown += 1; }
      }
      section.hidden = searching && !any;
    }
    status.textContent = !searching ? '' : shown === 0 ? 'לא נמצאו תוצאות.' : `נמצאו ${shown} פריטים.`;
  });
  return wrap;
}

// ---------- self-test ----------

/** Wrap each effect's content so it can be blurred separately from the row's box. */
function prepareEffects(article) {
  for (const effect of article.querySelectorAll('.rel-effect')) {
    const text = el('span', 'effect-text');
    text.append(...effect.childNodes);
    effect.append(text);
    effect.addEventListener('click', () => toggleReveal(article, effect));
    effect.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!article.classList.contains('recall')) return;
      e.preventDefault();
      toggleReveal(article, effect);
    });
  }
}

function markEffect(effect, recall) {
  if (!recall) {
    for (const a of ['role', 'tabindex', 'aria-expanded', 'aria-label']) effect.removeAttribute(a);
    effect.classList.remove('is-revealed');
    return;
  }
  const open = effect.classList.contains('is-revealed');
  effect.setAttribute('role', 'button');
  effect.tabIndex = 0;
  effect.setAttribute('aria-expanded', String(open));
  // Hidden means hidden for screen readers too; once revealed, the text itself is the name.
  if (open) effect.removeAttribute('aria-label');
  else effect.setAttribute('aria-label', 'תוצאה מוסתרת, לחצו לחשיפה');
}

function toggleReveal(article, effect) {
  if (!article.classList.contains('recall')) return;
  effect.classList.toggle('is-revealed');
  markEffect(effect, true);
}

function setRecall(article, on) {
  article.classList.toggle('recall', on);
  for (const effect of article.querySelectorAll('.rel-effect')) markEffect(effect, on);
}

// ---------- exam focus ----------

function setFocus(article, on) {
  article.classList.toggle('focus', on);
  const flags = article.querySelector('.flags');
  const section = flags?.closest('section');
  for (const s of article.querySelectorAll('section')) s.classList.toggle('is-flags', s === section);
  if (on && section) scrollTo(section);
}

// ---------- learned checklist ----------

function buildChecklist(article, id) {
  const items = [...article.querySelectorAll('.flags li')];
  if (items.length === 0) return null;
  const itemKeys = items.map((li) => textKey(li.textContent));
  const done = validChecks(load(checksKey(id)), itemKeys);

  const meter = el('progress');
  meter.max = 100;
  const label = el('span', 'study-count');
  const wrap = el('div', 'study-progress');
  const caption = el('span', null, 'נלמד:');
  wrap.append(caption, meter, label);
  meter.setAttribute('aria-label', 'התקדמות בנקודות לשינון');

  const refresh = () => {
    meter.value = percent(done.size, items.length);
    label.textContent = `${done.size}/${items.length}`;
  };

  items.forEach((li, i) => {
    const box = el('input');
    box.type = 'checkbox';
    box.checked = done.has(itemKeys[i]);
    const text = el('span', 'flag-text');
    text.append(...li.childNodes);
    const row = el('label', 'flag-item');
    row.append(box, text);
    li.append(row);
    li.classList.add('has-check');
    li.classList.toggle('is-done', box.checked);
    box.addEventListener('change', () => {
      if (box.checked) done.add(itemKeys[i]); else done.delete(itemKeys[i]);
      li.classList.toggle('is-done', box.checked);
      save(checksKey(id), [...done]);
      refresh();
    });
  });
  refresh();
  return wrap;
}
