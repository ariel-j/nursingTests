// כרטיסיות תרופות: drugs.html?subject=<id>. Tabs over the subject's drug cards
// (data/<id>/drugs.json): browse (search, family, exam-only, hide details to self-test), daily review
// (drugs-review.js), games (matching here; suffixes and odd one out in drugs-games.js) and links to
// the generated quiz.
import { findSubject, loadManifest, subjectPaths } from './catalog.js';
import {
  DRUG_FIELDS,
  buildMatchRound,
  drugDeckUrl,
  drugId,
  filterDrugs,
  stemsUrl,
  updateMatchWeights,
  validateDrugDeck,
  validateStems,
} from './drugs-core.js';
import { drugRows, el, familyOptions, fmt } from './drugs-ui.js';
import { initReview } from './drugs-review.js';
import { initOdd, initStems } from './drugs-games.js';
import { keys, load, save } from './storage.js';

const $ = (id) => document.getElementById(id);

// ---------- tabs ----------

const TABS = ['browse', 'review', 'games', 'test'];
const GAMES = ['match', 'stems', 'odd'];

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
function initGames(starters) {
  const radios = [...document.querySelectorAll('input[name="game"]')];
  const started = new Set();
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
  const first = GAMES.includes(fromHash) ? fromHash : 'match';
  radios.find((r) => r.value === first).checked = true;
  return () => show(radios.find((r) => r.checked).value);
}

// ---------- browse ----------

function drugCard(drug, hidden) {
  const card = el('article', 'drug-card');
  const head = el('div', 'drug-head');
  const name = el('h3', 'drug-name', drug.name);
  head.append(name);
  if (drug.exam) {
    const badge = el('span', 'drug-badge', '★ הופיע במבחנים');
    head.append(badge);
  }
  card.append(head);
  if (drug.alsoIn.length > 0) card.append(el('p', 'drug-also', `גם ב: ${drug.alsoIn.join(', ')}`));

  const rows = drugRows(drug);
  if (hidden) {
    // Self-test: think of the answer, then reveal.
    rows.id = `rows-${drugId(drug)}`;
    rows.hidden = true;
    const reveal = el('button', 'secondary drug-reveal', 'הצגת הפרטים');
    reveal.type = 'button';
    reveal.setAttribute('aria-expanded', 'false');
    reveal.setAttribute('aria-controls', rows.id);
    reveal.addEventListener('click', () => {
      rows.hidden = !rows.hidden;
      reveal.setAttribute('aria-expanded', String(!rows.hidden));
      reveal.textContent = rows.hidden ? 'הצגת הפרטים' : 'הסתרה';
    });
    card.append(reveal);
  }
  card.append(rows);
  return card;
}

function initBrowse(deck) {
  const query = $('browse-query');
  const family = $('browse-family');
  const exam = $('browse-exam');
  const hide = $('browse-hide');
  familyOptions(family, deck.families, deck.drugs);

  let timer = null;
  const render = () => {
    const chosen = family.value || null;
    const found = filterDrugs(deck.drugs, { query: query.value, family: chosen, examOnly: exam.checked });
    $('browse-count').textContent = `${found.length} מתוך ${deck.drugs.length} תרופות`;
    const sections = (chosen ? [chosen] : deck.families).map((f) => {
      const items = found.filter((d) => d.family === f || (chosen && d.alsoIn.includes(f)));
      if (items.length === 0) return null;
      const section = el('section', 'drug-family');
      const grid = el('div', 'drug-grid');
      grid.append(...items.map((d) => drugCard(d, hide.checked)));
      section.append(el('h2', 'group-title', `${f} · ${items.length}`), grid);
      return section;
    }).filter(Boolean);
    if (sections.length === 0) sections.push(el('p', 'muted', 'לא נמצאו תרופות. נסו שם, משפחה, רצפטור או מנגנון.'));
    $('browse-list').replaceChildren(...sections);
  };
  query.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });
  for (const control of [family, exam, hide]) control.addEventListener('change', render);
  render();
}

// ---------- matching game ----------

function initMatch(deck, subjectId) {
  const family = $('match-family');
  const exam = $('match-exam');
  const board = $('match-board');
  const status = $('match-status');
  const weightsKey = keys.drugMatch(subjectId);
  familyOptions(family, deck.families, deck.drugs);

  let round = null;
  let selected = null; // { side: 'name' | 'text', id, button }
  let missed = {}; // id → true once a wrong pair included it
  let left = 0;

  const field = () => document.querySelector('input[name="match-field"]:checked').value;
  const fieldLabel = () => DRUG_FIELDS.find((f) => f.key === field()).label;

  function finish() {
    const results = Object.fromEntries(round.pairs.map((p) => [p.id, Boolean(missed[p.id])]));
    save(weightsKey, updateMatchWeights(load(weightsKey, {}), results));
    const clean = round.pairs.length - Object.keys(missed).length;
    status.textContent = `סיימתם! ${clean} מתוך ${round.pairs.length} בלי טעות.`;
    const again = el('button', 'primary', 'סבב נוסף');
    again.type = 'button';
    again.addEventListener('click', newRound);
    board.append(again);
    again.focus();
  }

  function choose(side, id, button) {
    // With motion off the shake never ends on its own, so the red mark goes on the next choice.
    for (const b of board.querySelectorAll('.is-wrong')) b.classList.remove('is-wrong');
    if (selected && selected.side === side) {
      selected.button.setAttribute('aria-pressed', 'false');
      if (selected.button === button) {
        selected = null;
        return;
      }
    }
    if (!selected || selected.side === side) {
      selected = { side, id, button };
      button.setAttribute('aria-pressed', 'true');
      return;
    }
    const other = selected;
    selected = null;
    other.button.setAttribute('aria-pressed', 'false');
    if (other.id === id) {
      for (const b of [other.button, button]) {
        b.disabled = true;
        b.classList.add('is-done');
      }
      left -= 1;
      const pair = round.pairs.find((p) => p.id === id);
      status.textContent = `נכון: ${pair.name}.`;
      if (left === 0) finish();
      else board.querySelector('.match-item:not(:disabled)')?.focus();
    } else {
      // The drug whose name was picked is the one not known yet.
      missed[side === 'name' ? id : other.id] = true;
      for (const b of [other.button, button]) {
        b.classList.remove('is-wrong');
        void b.offsetWidth; // restart the shake
        b.classList.add('is-wrong');
      }
      status.textContent = 'לא מתאים, נסו שוב.';
    }
  }

  function item(side, id, text) {
    const button = el('button', `match-item is-${side}`, fmt(text));
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => choose(side, id, button));
    button.addEventListener('animationend', () => button.classList.remove('is-wrong'));
    return button;
  }

  function newRound() {
    const pool = filterDrugs(deck.drugs, { family: family.value || null, examOnly: exam.checked });
    round = buildMatchRound(pool, { field: field(), weights: load(weightsKey, {}) });
    selected = null;
    missed = {};
    left = round.pairs.length;
    if (round.pairs.length < 2) {
      status.textContent = 'אין מספיק תרופות לבחירה הזו. נסו משפחה אחרת או שדה אחר.';
      board.replaceChildren();
      return;
    }
    const byId = new Map(round.pairs.map((p) => [p.id, p]));
    const names = el('div', 'match-col');
    names.setAttribute('role', 'group');
    names.setAttribute('aria-label', 'תרופות');
    names.append(el('h3', 'match-head', 'תרופה'), ...round.pairs.map((p) => item('name', p.id, p.name)));
    const texts = el('div', 'match-col');
    texts.setAttribute('role', 'group');
    texts.setAttribute('aria-label', fieldLabel());
    texts.append(el('h3', 'match-head', fieldLabel()), ...round.texts.map((id) => item('text', id, byId.get(id).text)));
    board.replaceChildren(names, texts);
    status.textContent = `${round.pairs.length} תרופות. בחרו תרופה ואת ה${fieldLabel()} שלה.`;
  }

  $('match-new').addEventListener('click', newRound);
  for (const control of [family, exam, ...document.querySelectorAll('input[name="match-field"]')]) {
    control.addEventListener('change', newRound);
  }
  return newRound;
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
    const res = await fetch(drugDeckUrl(subject.id), { cache: 'no-cache' });
    if (!res.ok) throw new Error('למקצוע הזה אין כרטיסיות תרופות.');
    deck = await res.json();
    const errors = validateDrugDeck(deck);
    if (errors.length > 0) {
      console.error('Invalid drug cards:', errors);
      throw new Error('קובץ כרטיסיות התרופות פגום. פרטים בקונסול.');
    }
  } catch (err) {
    status.textContent = location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : err.message;
    return;
  }
  status.hidden = true;

  document.title = `כרטיסיות תרופות · ${subject.name}`;
  $('subject').textContent = subject.name;
  $('back-link').href = subjectPaths(subject.id).home;
  const stats = $('deck-stats');
  stats.append(
    el('span', null, `${deck.drugs.length} תרופות`),
    el('span', null, `${deck.families.length} משפחות`),
    el('span', null, `${deck.drugs.filter((d) => d.exam).length} הופיעו במבחנים (★)`),
  );

  const quiz = `drugs=${encodeURIComponent(subject.id)}`;
  $('test-all').href = `quiz.html?${quiz}`;
  $('test-exam').href = `quiz.html?${quiz}&exam=1`;
  $('test-print').href = `print.html?${quiz}`;

  const stems = await loadStems(subject.id, deck);
  if (!stems) {
    // No suffix list for this subject: drop that game from the picker.
    document.querySelector('input[name="game"][value="stems"]').closest('label').remove();
  }

  initBrowse(deck);
  const startReview = initReview(deck, subject.id);
  const showGame = initGames({
    match: initMatch(deck, subject.id),
    stems: stems ? initStems(stems, deck) : null,
    odd: initOdd(deck),
  });
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

/** The subject's suffix list, or null when it has none (or it is broken: reported in the console). */
async function loadStems(subjectId, deck) {
  try {
    const res = await fetch(stemsUrl(subjectId), { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    const errors = validateStems(data, deck);
    if (errors.length > 0) {
      console.error('Invalid stems:', errors);
      return null;
    }
    return data.stems;
  } catch {
    return null;
  }
}

main();
