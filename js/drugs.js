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
  flashcardSheets,
  stemsUrl,
  updateMatchWeights,
  validateDrugDeck,
  validateStems,
} from './drugs-core.js';
import { button, buzz, drugRows, el, familyOptions, fmt, starsEl } from './drugs-ui.js';
import { formatTime, recordBestTime, starsFor } from './drug-games-core.js';
import { initReview } from './drugs-review.js';
import { initBlitz, initOdd, initStems } from './drugs-games.js';
import { keys, load, save } from './storage.js';

const $ = (id) => document.getElementById(id);

// ---------- tabs ----------

const TABS = ['browse', 'review', 'games', 'test'];
const GAMES = ['match', 'stems', 'odd', 'blitz'];

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
  let shown = []; // { drug, family } in screen order, for the printable flashcards
  const render = () => {
    const chosen = family.value || null;
    const found = filterDrugs(deck.drugs, { query: query.value, family: chosen, examOnly: exam.checked });
    $('browse-count').textContent = `${found.length} מתוך ${deck.drugs.length} תרופות`;
    $('print-sheet').disabled = $('print-cards').disabled = found.length === 0;
    $('print-scope').textContent = printScope(found.length, chosen, exam.checked, query.value.trim());
    shown = [];
    const sections = (chosen ? [chosen] : deck.families).map((f) => {
      const items = found.filter((d) => d.family === f || (chosen && d.alsoIn.includes(f)));
      if (items.length === 0) return null;
      shown.push(...items.map((drug) => ({ drug, family: f })));
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
  initPrint(() => {
    clearTimeout(timer); // a search still waiting to render
    render();
    return shown;
  });
}

/** The line on the printout saying what was printed. */
function printScope(count, family, examOnly, query) {
  const parts = [`${count} תרופות`];
  parts.push(family ? `משפחה: ${family}` : 'כל המשפחות');
  if (examOnly) parts.push('רק מה שהופיע במבחנים (★)');
  if (query) parts.push(`חיפוש: ${query}`);
  return parts.join(' · ');
}

// ---------- printing ----------

/** A cut-out card's front (name, family) or back (details); null leaves the slot empty. */
function flashcard(item, side) {
  const card = el('div', `flashcard is-${side}`);
  if (!item) return card;
  const { drug, family } = item;
  if (side === 'front') {
    card.append(el('p', 'flashcard-name', drug.name), el('p', 'flashcard-family', family));
    if (drug.exam) card.append(el('p', 'flashcard-exam', '★ הופיע במבחנים'));
    return card;
  }
  card.append(el('p', 'flashcard-title', drug.name), drugRows(drug));
  // Long details get smaller type so they fit the card.
  const length = DRUG_FIELDS.reduce((sum, { key }) => sum + (drug[key] ?? '').length, 0);
  if (length > 260) card.classList.add('is-long');
  return card;
}

/**
 * The two print buttons. The study sheet is the page's own print style (also what Ctrl+P gives);
 * the flashcards are built on demand into #flashcards. `data-print` on <html> picks the layout.
 */
function initPrint(currentItems) {
  const root = document.documentElement;
  const sheets = $('flashcards');
  let fromButton = false;
  const print = (mode) => {
    const items = currentItems();
    if (mode === 'cards') {
      sheets.replaceChildren(...flashcardSheets(items).flatMap(({ front, back }) => ['front', 'back'].map((side) => {
        const page = el('div', `flashcard-page is-${side}`);
        page.append(...(side === 'front' ? front : back).map((item) => flashcard(item, side)));
        return page;
      })));
    }
    root.dataset.print = mode;
    fromButton = true;
    window.print();
  };
  // Printing from the browser's menu always gives the study sheet.
  window.addEventListener('beforeprint', () => {
    if (!fromButton) root.dataset.print = 'sheet';
    fromButton = false;
  });
  $('print-sheet').addEventListener('click', () => print('sheet'));
  $('print-cards').addEventListener('click', () => print('cards'));
}

// ---------- matching game ----------

function initMatch(deck, subjectId, bestKey) {
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
  let wrongTries = 0;
  let startedAt = 0;
  let clock = null;
  const hud = el('div', 'game-hud');
  const timer = el('span', 'game-score');
  const pairsLeft = el('span', 'game-streak');
  hud.append(timer, pairsLeft);
  board.before(hud);
  const tick = () => {
    timer.textContent = `⏱ ${formatTime(Date.now() - startedAt)}`;
  };

  const field = () => document.querySelector('input[name="match-field"]:checked').value;
  const fieldLabel = () => DRUG_FIELDS.find((f) => f.key === field()).label;

  function finish() {
    clearInterval(clock);
    const ms = Date.now() - startedAt;
    const results = Object.fromEntries(round.pairs.map((p) => [p.id, Boolean(missed[p.id])]));
    save(weightsKey, updateMatchWeights(load(weightsKey, {}), results));
    const clean = round.pairs.length - Object.keys(missed).length;
    const stars = starsFor(clean, round.pairs.length);
    // Best time per family and field, only for rounds without a mistake.
    const bests = load(bestKey, {}) ?? {};
    const timeKey = `${family.value || 'all'}|${field()}`;
    const { times, isNew } = clean === round.pairs.length
      ? recordBestTime(bests.match, timeKey, ms)
      : { times: bests.match ?? {}, isNew: false };
    save(bestKey, { ...bests, match: times });

    const end = el('div', 'game-card game-end');
    end.setAttribute('role', 'status');
    end.append(el('p', 'game-kicker', 'סיימתם!'), starsEl(stars), el('p', 'game-end-score', `⏱ ${formatTime(ms)}`));
    if (isNew) end.append(el('p', 'game-new-best', 'שיא זמן חדש!'));
    const stats = el('p', 'meta game-end-stats');
    stats.append(el('span', null, `${clean} מתוך ${round.pairs.length} בלי טעות`), el('span', null, `ניסיונות שגויים ${wrongTries}`));
    if (Number.isFinite(times[timeKey])) stats.append(el('span', null, `הזמן הכי טוב ${formatTime(times[timeKey])}`));
    const again = button('primary', 'סבב נוסף', newRound);
    end.append(stats, again);
    board.append(end);
    status.textContent = '';
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
      // Each matched pair gets its own colour and number, so the pairs read without colour too.
      const n = round.pairs.length - left + 1;
      for (const b of [other.button, button]) {
        b.disabled = true;
        b.classList.add('is-done', `pair-${n}`);
        const badge = el('span', 'pair-badge', String(n));
        badge.setAttribute('aria-hidden', 'true');
        b.prepend(badge);
      }
      left -= 1;
      pairsLeft.textContent = `${round.pairs.length - left} מתוך ${round.pairs.length} זוגות`;
      const pair = round.pairs.find((p) => p.id === id);
      status.textContent = `נכון: ${pair.name}.`;
      if (left === 0) finish();
      else board.querySelector('.match-item:not(:disabled)')?.focus();
    } else {
      // The drug whose name was picked is the one not known yet.
      missed[side === 'name' ? id : other.id] = true;
      wrongTries += 1;
      buzz();
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
    wrongTries = 0;
    left = round.pairs.length;
    clearInterval(clock);
    startedAt = Date.now();
    tick();
    clock = setInterval(() => {
      // Stop counting when the game is not on screen.
      if (board.offsetParent === null) clearInterval(clock);
      else tick();
    }, 500);
    pairsLeft.textContent = `0 מתוך ${round.pairs.length} זוגות`;
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
  const bestKey = keys.drugGames(subject.id);
  const showGame = initGames({
    match: initMatch(deck, subject.id, bestKey),
    stems: stems ? initStems(stems, deck, bestKey) : null,
    odd: initOdd(deck, bestKey),
    blitz: initBlitz(stems, deck, bestKey),
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
