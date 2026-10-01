// Printable exam: choose topics, count and order, preview the sheet, print it (or save as PDF).
// The browser does the PDF, so Hebrew shaping and the self-hosted fonts come for free.
import {
  PRINT_DEFAULT_COUNT,
  buildPrintExam,
  isolateNumberRanges as fmt,
  listTopics,
  questionIdsForTopics,
} from './core.js';
import { loadQuizFromUrl, quizPlace } from './load-quiz.js';

const $ = (id) => document.getElementById(id);
const ui = {
  backLink: $('back-link'),
  subject: $('subject'),
  title: $('quiz-title'),
  status: $('status'),
  form: $('print-form'),
  allTopics: $('all-topics'),
  noTopics: $('no-topics'),
  topicsLegend: $('topics-legend'),
  topicList: $('topic-list'),
  count: $('count'),
  countHint: $('count-hint'),
  explanations: $('explanations'),
  summary: $('summary'),
  printButton: $('print-button'),
  reshuffle: $('reshuffle'),
  previewLabel: $('preview-label'),
  sheet: $('sheet'),
};

const ORDER_LABELS = { mixed: 'סדר מעורבב', 'by-topic': 'לפי נושאים' };

let quiz = null;
let exam = [];
// What the user asked for; the field shows it capped by what the chosen topics hold.
let wantedCount = PRINT_DEFAULT_COUNT;
let countTimer = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- settings ----------

function topicCheckboxes() {
  return [...ui.topicList.querySelectorAll('input[type="checkbox"]')];
}

function selectedTopics() {
  return topicCheckboxes().filter((c) => c.checked).map((c) => c.value);
}

// A mixed quiz is chosen by unit, like on the practice page.
function selectionField() {
  return quiz.mixed ? 'group' : 'topic';
}

function available(topics) {
  return questionIdsForTopics(quiz, topics, selectionField()).length;
}

function examTitle() {
  return quiz.mixed ? 'מבחן משולב' : quiz.title;
}

function order() {
  return ui.form.elements.order.value;
}

function renderTopics() {
  ui.topicList.replaceChildren(...listTopics(quiz, selectionField()).map(({ topic, count }) => {
    const li = el('li');
    const label = el('label', 'topic-option');
    const box = el('input');
    box.type = 'checkbox';
    box.value = topic;
    box.checked = true;
    box.addEventListener('change', rebuild);
    label.append(box, el('span', null, topic), el('span', 'count', String(count)));
    li.append(label);
    return li;
  }));
}

function setAllTopics(checked) {
  for (const c of topicCheckboxes()) c.checked = checked;
  rebuild();
}

/** Rebuilds only when the field's value changes what gets printed; a bad value is put back. */
function applyCount() {
  clearTimeout(countTimer);
  const n = Number.parseInt(ui.count.value, 10);
  if (!Number.isInteger(n) || n < 1) {
    ui.count.value = String(exam.length || wantedCount);
    return;
  }
  const max = available(selectedTopics());
  const changed = Math.min(n, max) !== exam.length;
  wantedCount = n;
  if (changed) rebuild();
  else ui.count.value = String(Math.min(n, max));
}

function onCountInput() {
  clearTimeout(countTimer);
  countTimer = setTimeout(applyCount, 400);
}

// ---------- building ----------

/** Samples a fresh exam from the current settings and renders it. */
function rebuild() {
  const topics = selectedTopics();
  const max = available(topics);
  const count = Math.min(wantedCount, max);

  ui.count.max = String(Math.max(1, max));
  ui.count.disabled = max === 0;
  if (document.activeElement !== ui.count || Number(ui.count.value) > max) ui.count.value = String(count);
  ui.countHint.textContent = max === 0 ? '' : `מתוך ${max} זמינות`;

  ui.printButton.disabled = max === 0;
  ui.reshuffle.disabled = max === 0;
  if (max === 0) {
    exam = [];
    ui.summary.textContent = 'בחרו לפחות נושא אחד.';
    ui.sheet.hidden = true;
    ui.previewLabel.hidden = true;
    return;
  }

  exam = buildPrintExam(quiz, { topics, field: selectionField(), count, order: order() }, Math.random);
  const topicCount = new Set(exam.map((q) => q.topic)).size;
  ui.summary.textContent = `${exam.length} שאלות מ-${topicCount} נושאים · ${ORDER_LABELS[order()]}`;
  renderSheet();
}

// ---------- the sheet ----------

function field(label, trailing = '') {
  const span = el('span', 'exam-field');
  span.append(el('span', null, label), el('span', 'exam-line'));
  if (trailing) span.append(el('span', null, trailing));
  return span;
}

function renderHead() {
  const chosen = selectedTopics().length;
  const total = topicCheckboxes().length;
  const noun = quiz.mixed ? 'יחידות' : 'נושאים';
  const head = el('header', 'exam-head');
  const topicText = chosen === total ? `כל ה${noun}` : `${chosen} מתוך ${total} ${noun}`;
  const fields = el('p', 'exam-fields');
  fields.append(field('שם:'), field('תאריך:'), field('ציון:', `מתוך ${exam.length}`));
  head.append(
    el('p', 'exam-kicker', quizPlace(quiz)),
    el('h2', 'exam-title', examTitle()),
    el('p', 'exam-meta', `${exam.length} שאלות · ${topicText} · ${ORDER_LABELS[order()]}`),
    fields,
    el('p', 'exam-instructions', 'לכל שאלה תשובה נכונה אחת. הקיפו את האות שבחרתם. מפתח התשובות וההסברים בסוף המבחן.'),
  );
  return head;
}

// Options this short fit two to a row, which saves a lot of paper on a long exam.
const COMPACT_OPTION_CHARS = 34;

function renderQuestion(q) {
  const li = el('li', 'exam-q');
  li.value = q.number;
  const content = el('div', 'exam-q-body');

  const compact = q.options.every((o) => o.text.length <= COMPACT_OPTION_CHARS && !o.text.includes('\n'));
  const options = el('ol', compact ? 'exam-opts is-compact' : 'exam-opts');
  options.append(...q.options.map((o) => {
    const opt = el('li');
    opt.append(el('span', 'bubble', o.letter), el('span', 'exam-opt-text', fmt(o.text)));
    return opt;
  }));
  content.append(el('p', 'exam-q-text', fmt(q.question)), options);
  li.append(el('span', 'exam-num', String(q.number)), content);
  return li;
}

function renderBody() {
  const body = el('section', 'exam-body');
  if (order() === 'mixed') {
    const list = el('ol', 'exam-questions');
    list.append(...exam.map((q) => renderQuestion(q)));
    body.append(list);
    return body;
  }
  // by-topic: questions arrive grouped, so start a new heading whenever the topic changes.
  let list = null;
  for (const q of exam) {
    if (!list || q.topic !== exam[q.number - 2].topic) {
      const count = exam.filter((x) => x.topic === q.topic).length;
      const heading = el('h3', 'exam-topic', q.topic);
      heading.append(el('span', 'exam-topic-count', ` · ${count} שאלות`));
      list = el('ol', 'exam-questions');
      list.start = q.number;
      body.append(heading, list);
    }
    list.append(renderQuestion(q));
  }
  return body;
}

function renderKey() {
  const key = el('section', 'exam-key');
  key.append(
    el('h2', 'exam-title', 'מפתח תשובות'),
    el('p', 'exam-meta', `${examTitle()} · ${quizPlace(quiz)}`),
  );

  const grid = el('ol', 'key-grid');
  grid.append(...exam.map((q) => {
    const li = el('li');
    li.append(el('span', 'key-num', String(q.number)), el('span', 'key-letter', q.correctLetter));
    return li;
  }));
  key.append(grid);

  if (ui.explanations.checked) {
    const list = el('ol', 'key-explain');
    list.append(...exam.map((q) => {
      const li = el('li');
      li.value = q.number;
      const head = el('p', 'key-head');
      head.append(
        el('span', 'exam-num', String(q.number)),
        el('span', 'bubble is-answer', q.correctLetter),
        el('b', null, fmt(q.correctText)),
      );
      li.append(head, el('p', 'key-text', fmt(q.explanation)), el('p', 'key-topic', q.topic));
      return li;
    }));
    key.append(el('h3', 'exam-topic', 'הסברים'), list);
  }
  return key;
}

function renderSheet() {
  ui.sheet.replaceChildren(renderHead(), renderBody(), renderKey());
  ui.sheet.hidden = false;
  ui.previewLabel.hidden = false;
  // Becomes the suggested file name in "Save as PDF".
  document.title = `${examTitle()} · ${quiz.unit ?? quiz.subject} · ${exam.length} שאלות`;
}

// ---------- wiring ----------

function onSubmit(event) {
  event.preventDefault();
  if (exam.length > 0) window.print();
}

async function main() {
  try {
    quiz = await loadQuizFromUrl();
  } catch (err) {
    ui.status.textContent = err.message;
    return;
  }

  ui.status.hidden = true;
  ui.form.hidden = false;
  ui.subject.textContent = quizPlace(quiz);
  ui.title.textContent = examTitle();
  ui.topicsLegend.textContent = quiz.mixed ? 'יחידות' : 'נושאים';
  ui.backLink.href = `quiz.html${location.search}`;

  ui.allTopics.addEventListener('click', () => setAllTopics(true));
  ui.noTopics.addEventListener('click', () => setAllTopics(false));
  ui.count.addEventListener('input', onCountInput);
  ui.count.addEventListener('change', applyCount);
  // Enter in the count field means "use this number", not "print".
  ui.count.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyCount();
  });
  for (const radio of ui.form.elements.order) radio.addEventListener('change', rebuild);
  ui.explanations.addEventListener('change', renderSheet);
  ui.reshuffle.addEventListener('click', rebuild);
  ui.form.addEventListener('submit', onSubmit);

  renderTopics();
  rebuild();
}

main();
