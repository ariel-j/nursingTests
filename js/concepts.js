// כרטיסיות מושגים: concepts.html?subject=<id>. Tabs over the subject's concept cards
// (data/<id>/concepts.json): browse (search, kind, topic, hide the answers to self-test, print),
// daily review, the games and the generated quiz. Logic in concepts-core.js.
import { findSubject, loadManifest, subjectPaths } from './catalog.js';
import {
  BROWSE_KINDS,
  CARD_KINDS,
  QUESTION_GAMES,
  buildBank,
  buildBrowse,
  buildCards,
  buildMatchRound,
  conceptsUrl,
  questionPool,
  topicGroups,
  validateConceptDeck,
} from './concepts-core.js';
import { initMatch, initQuestionGames } from './concepts-games.js';
import { answerRows, frontNodes, initReview } from './concepts-review.js';
import { createTopics } from './concepts-topics.js';
import { button, el, fmt } from './drugs-ui.js';
import { keys } from './storage.js';

const $ = (id) => document.getElementById(id);

// ---------- tabs ----------

const TABS = ['browse', 'review', 'games', 'test'];
const GAMES = ['match', 'concepts', 'numbers', 'practice', 'order', 'qa', 'blitz'];
const MATCH_SOURCES = ['sets', 'concepts', 'cards'];

/**
 * What this deck can play: the games with something to ask (a deck of one kind of card shows only
 * its games) and the matching board's sources that make a board. The blitz needs any question game.
 */
function available(bank) {
  const sources = MATCH_SOURCES.filter((source) => buildMatchRound(bank, { source }) !== null);
  const games = new Set(Object.entries(QUESTION_GAMES).filter(([, kinds]) => questionPool(bank, kinds, null) > 0).map(([g]) => g));
  if (games.size > 0) games.add('blitz');
  if (sources.length > 0) games.add('match');
  return { games: GAMES.filter((g) => games.has(g)), sources };
}

/** Hides the radio (and its label) of every value not in `keep`, and checks the first kept one if needed. */
function keepRadios(name, keep) {
  const radios = [...document.querySelectorAll(`input[name="${name}"]`)];
  for (const r of radios) r.closest('label').hidden = !keep.includes(r.value);
  const checked = radios.find((r) => r.checked);
  if (!checked || !keep.includes(checked.value)) {
    const first = radios.find((r) => keep.includes(r.value));
    if (first) first.checked = true;
  }
}

function initTabs(onShow) {
  const tabs = TABS.map((name) => $(`tab-${name}`));
  const show = (name, focus = false) => {
    TABS.forEach((n, i) => {
      const selected = n === name;
      tabs[i].setAttribute('aria-selected', String(selected));
      tabs[i].tabIndex = selected ? 0 : -1;
      $(`panel-${n}`).hidden = !selected;
    });
    if (focus) tabs[TABS.indexOf(name)].focus();
    onShow(name);
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => show(TABS[i]));
    // Arrow keys move between tabs (RTL: left is "next").
    tab.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: 1, ArrowRight: -1, Home: -i, End: TABS.length - 1 - i }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      show(TABS[(i + step + TABS.length) % TABS.length], true);
    });
  });
  $('tabs').hidden = false;
  const fromHash = location.hash.slice(1);
  show(GAMES.includes(fromHash) ? 'games' : TABS.includes(fromHash) ? fromHash : 'browse');
}

/** The game picker inside the games tab; each game starts the first time it is shown. */
function initGames(starters, topics, games) {
  const radios = [...document.querySelectorAll('input[name="game"]')].filter((r) => games.includes(r.value));
  const started = new Set();
  const current = () => radios.find((r) => r.checked).value;
  const show = (name) => {
    for (const g of GAMES) $(`game-${g}`).hidden = g !== name;
    history.replaceState(null, '', `#${name}`);
    if (!started.has(name) && starters[name]) {
      started.add(name);
      starters[name]();
    }
  };
  for (const r of radios) r.addEventListener('change', () => show(r.value));
  const fromHash = location.hash.slice(1);
  const first = games.includes(fromHash) ? fromHash : games[0];
  radios.find((r) => r.value === first).checked = true;
  // New topics: the game on screen restarts now, the others when next shown.
  topics.onChange(() => {
    started.clear();
    if (!$('panel-games').hidden) show(current());
  });
  return () => show(current());
}

// ---------- browse ----------

function kindSelect(select, kinds, all, counts) {
  const first = el('option', null, `הכול (${all})`);
  first.value = '';
  // Kinds the deck has none of are left out; with a single kind the choice is pointless.
  const present = kinds.filter(({ key }) => (counts[key] ?? 0) > 0);
  select.closest('label').hidden = present.length < 2;
  select.replaceChildren(first, ...present.map(({ key, label }) => {
    const option = el('option', null, `${label} (${counts[key] ?? 0})`);
    option.value = key;
    return option;
  }));
}

/** An answer that can be hidden until the learner asks for it (מצב שינון). */
function withAnswer(card, rows, hidden) {
  card.append(rows);
  if (!hidden) return;
  rows.hidden = true;
  const reveal = button('secondary drug-reveal', 'הצגת התשובה', () => {
    rows.hidden = false;
    reveal.remove();
  });
  card.append(reveal);
}

function flashcard(c, hidden) {
  const card = el('article', 'drug-card');
  const name = el('h3', 'drug-name');
  name.append(...frontNodes(c));
  card.append(name);
  withAnswer(card, answerRows(c), hidden);
  return card;
}

function sequenceCard(seq, hidden) {
  const card = el('article', 'drug-card');
  card.append(el('h3', 'drug-name', seq.title));
  const steps = el('ol', 'seq-steps');
  for (const step of seq.steps) steps.append(el('li', null, fmt(step)));
  if (!hidden) {
    card.append(steps);
    return card;
  }
  // Self-test: the order is the answer.
  steps.hidden = true;
  const reveal = button('secondary drug-reveal', 'הצגת הסדר', () => {
    steps.hidden = false;
    reveal.remove();
  });
  card.append(steps, reveal);
  return card;
}

function matchCard(set, hidden) {
  const card = el('article', 'drug-card');
  card.append(el('h3', 'drug-name', set.title));
  const rows = el('dl', 'drug-rows');
  for (const { a, b } of set.pairs) rows.append(el('dt', null, fmt(a)), el('dd', null, fmt(b)));
  withAnswer(card, rows, hidden);
  return card;
}

function initBrowse(deck, cards) {
  const query = $('browse-query');
  const kind = $('browse-kind');
  const topic = $('browse-topic');
  const hide = $('browse-hide');
  const list = $('browse-list');
  const count = $('browse-count');

  const counts = Object.fromEntries(CARD_KINDS.map((k) => [k.key, cards.filter((c) => c.kind === k.key).length]));
  counts.sequence = deck.topics.reduce((n, t) => n + (t.sequences?.length ?? 0), 0);
  counts.match = deck.topics.reduce((n, t) => n + (t.matches?.length ?? 0), 0);
  kindSelect(kind, BROWSE_KINDS, Object.values(counts).reduce((a, b) => a + b, 0), counts);
  const allTopics = el('option', null, `כל הנושאים (${deck.topics.length})`);
  allTopics.value = '';
  const topicOption = (t) => {
    const option = el('option', null, t.title);
    option.value = t.id;
    return option;
  };
  const groups = topicGroups(deck);
  topic.replaceChildren(allTopics, ...(groups
    ? groups.map((g) => {
      const group = el('optgroup');
      group.label = g.unit || 'כללי';
      group.append(...g.topics.map(topicOption));
      return group;
    })
    : deck.topics.map(topicOption)));

  function render() {
    const groups = buildBrowse(deck, cards, {
      query: query.value,
      kind: kind.value || null,
      topics: topic.value ? [topic.value] : null,
    });
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    count.textContent = total === 0 ? 'לא נמצא כלום. נסו חיפוש אחר או סוג אחר.' : `${total} פריטים`;
    list.replaceChildren(...groups.map((g) => {
      const section = el('section', 'drug-family');
      const grid = el('div', 'drug-grid');
      grid.append(...g.items.map((item) => {
        if (item.type === 'sequence') return sequenceCard(item.seq, hide.checked);
        if (item.type === 'match') return matchCard(item.set, hide.checked);
        return flashcard(item.card, hide.checked);
      }));
      section.append(el('h2', 'group-title', g.topic.title), grid);
      return section;
    }));
  }

  for (const control of [query, kind, topic, hide]) control.addEventListener('input', render);
  $('browse-print').addEventListener('click', () => window.print());
  render();
}

// ---------- page ----------

async function main() {
  const status = $('status');
  const params = new URLSearchParams(location.search);
  let subject;
  let deck;
  try {
    subject = findSubject(await loadManifest(), params.get('subject'));
    if (!subject) throw new Error('המקצוע לא נמצא.');
    const res = await fetch(conceptsUrl(subject.id), { cache: 'no-cache' });
    if (!res.ok) throw new Error('למקצוע הזה אין כרטיסיות מושגים.');
    deck = await res.json();
    const errors = validateConceptDeck(deck);
    if (errors.length > 0) {
      console.error('Invalid concept cards:', errors);
      throw new Error('קובץ כרטיסיות המושגים פגום. פרטים בקונסול.');
    }
  } catch (err) {
    status.textContent = location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : err.message;
    return;
  }
  status.hidden = true;

  document.title = `כרטיסיות מושגים · ${subject.name}`;
  $('subject').textContent = subject.name;
  $('back-link').href = subjectPaths(subject.id).home;
  const cards = buildCards(deck);
  const bank = buildBank(deck);
  const stats = $('deck-stats');
  const sizes = [
    [bank.concepts.length, 'מושגים'],
    [bank.numbers.length, 'מספרים'],
    [bank.tests.length, 'בדיקות ופעולות'],
    [bank.meds.length, 'תרופות'],
    [bank.cards.length, 'שאלות ותשובות'],
    [bank.sequences.length, 'סדרים'],
    [bank.sets.length, 'התאמות'],
  ];
  stats.append(...sizes.filter(([n]) => n > 0).map(([n, label]) => el('span', null, `${n} ${label}`)));

  const quiz = `concepts=${encodeURIComponent(subject.id)}`;
  $('test-all').href = `quiz.html?${quiz}`;
  $('test-print').href = `print.html?${quiz}`;

  initBrowse(deck, cards);
  // One choice of topics for the daily review and the games, with a picker in each tab.
  const topics = createTopics(deck, cards, subject.id);
  topics.mount($('games-topics'));
  kindSelect($('review-kind'), CARD_KINDS, cards.length, Object.fromEntries(CARD_KINDS.map((k) => [k.key, cards.filter((c) => c.kind === k.key).length])));
  const startReview = initReview(topics, subject.id);
  const bestKey = keys.conceptGames(subject.id);
  const { games, sources } = available(bank);
  keepRadios('game', games);
  keepRadios('match-source', sources);
  // One source left: nothing to choose between.
  document.querySelector('input[name="match-source"]')?.closest('fieldset').toggleAttribute('hidden', sources.length < 2);
  const showGame = initGames({
    match: initMatch(bank, topics, subject.id, bestKey),
    ...initQuestionGames(bank, topics, bestKey),
  }, topics, games);
  let reviewStarted = false;
  initTabs((name) => {
    if (name === 'review' && !reviewStarted) {
      reviewStarted = true;
      startReview();
    }
    if (name === 'games') showGame();
    else history.replaceState(null, '', `#${name}`);
  });
}

main();
