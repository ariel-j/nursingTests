// Summaries hub (summaries/index.html). ?subject=<id> shows that subject's summaries; without it,
// every subject that has summaries gets its own heading and list.
import { findSubject, loadManifest } from './catalog.js';
import { SUMMARIES, summariesFor, summaryFile } from './summary-list.js';

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderList(summaries, headingTag) {
  const list = el('ul', 'summary-list');
  list.append(...summaries.map((summary) => {
    const item = el('li');
    const link = el('a', 'quiz-card summary-card');
    link.href = summaryFile(summary.id);
    link.dataset.system = summary.id;
    link.append(el(headingTag, 'card-title', summary.title), el('p', 'muted', summary.blurb));
    item.append(link);
    return item;
  }));
  return list;
}

/** Points the print button at the combined page, for one subject or for all of them. */
function showPrintAll(subjectId) {
  const box = $('print-all');
  if (subjectId) box.querySelector('a').href = `all.html?subject=${encodeURIComponent(subjectId)}#print`;
  box.hidden = false;
}

async function main() {
  const groups = $('summary-groups');
  let manifest = null;
  try {
    manifest = await loadManifest();
  } catch (err) {
    console.error(err); // names are only for headings; the summaries still list without them
  }

  const subject = findSubject(manifest, new URLSearchParams(location.search).get('subject'));
  if (subject) {
    document.title = `סיכומים קצרים · ${subject.name}`;
    $('subject').textContent = subject.name;
    $('subject').hidden = false;
    $('back-link').href = `../?subject=${encodeURIComponent(subject.id)}`;
    $('back-link').textContent = `→ ${subject.name}`;
    const own = summariesFor(subject.id);
    if (own.length === 0) {
      $('status').textContent = 'עדיין אין סיכומים במקצוע הזה.';
      $('status').hidden = false;
      return;
    }
    groups.replaceChildren(renderList(own, 'h2'));
    showPrintAll(subject.id);
    return;
  }

  const subjects = (manifest?.subjects ?? []).filter((s) => summariesFor(s.id).length > 0);
  if (subjects.length === 0) {
    groups.replaceChildren(renderList(SUMMARIES, 'h2'));
  } else {
    groups.replaceChildren(...subjects.map((s) => {
      const section = el('section', 'summary-group');
      section.append(el('h2', 'group-title', s.name), renderList(summariesFor(s.id), 'h3'));
      return section;
    }));
  }
  showPrintAll(null);
}

main();
