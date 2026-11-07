// Drug memory game: hub, collection, achievements, result screen. The two play modes live in
// memory-pairs.js, memory-connect.js and memory-speed.js; all rules and scoring are in memory-core.js.
import {
  ACHIEVEMENTS,
  DAILY_BONUS,
  DAILY_GOAL,
  DEFAULT_PAIRS,
  LEVEL_LABELS,
  MIN_PAIRS,
  PAIR_SIZES,
  SPEED_MS,
  SPEED_QUESTIONS,
  WEAK_MIN,
  applyResult,
  countAtLevel,
  levelOf,
  listTopicGroups,
  liveStreak,
  normalizeProgress,
  pickDrugs,
  playerLevel,
  topicMap,
  weakDrugs,
} from './memory-core.js';
import { drugDetail } from './memory-detail.js';
import { clear, countUp, drugName, el, formatNumber, ltr, motionAllowed, todayString } from './memory-dom.js';
import { confetti, setEffects, sound } from './memory-fx.js';
import { playConnect } from './memory-connect.js';
import { playPairs } from './memory-pairs.js';
import { playSpeed } from './memory-speed.js';
import { keys, load, save } from './storage.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['hub', 'collection', 'achievements', 'game', 'result'];
const RESULT_TITLES = ['נסו שוב, זה מתחזק', 'התחלה טובה', 'יפה מאוד!', 'מושלם!'];

let drugs = [];
let byId = new Map();
let groups = [];
let topics = {};
let progress = normalizeProgress(load(keys.memory));
let selection = 'all';
let size = DEFAULT_PAIRS;
let active = null;
let lastRound = null;

// ---------- helpers ----------

function announce(text) {
  const live = $('live');
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 30);
}

function persist() {
  save(keys.memory, progress);
}

function show(view) {
  for (const v of VIEWS) $(v).hidden = v !== view;
  window.scrollTo(0, 0);
}

function focusHeading(id) {
  $(id).focus({ preventScroll: true });
}

function stopActive() {
  if (active) active.stop();
  active = null;
}

function poolDrugs() {
  if (selection === 'weak') return weakDrugs(drugs, progress);
  if (selection.startsWith('topic:')) {
    const name = selection.slice(6);
    return drugs.filter((d) => topics[d.id] === name);
  }
  return drugs;
}

function levelClass(level) {
  return `level-${level}`;
}

// ---------- hub ----------

function renderPlayer() {
  const info = playerLevel(progress.xp);
  $('level-num').textContent = String(info.level);
  $('player-title').textContent = info.title;
  const bar = $('xp-bar');
  bar.setAttribute('aria-valuenow', String(info.into));
  bar.setAttribute('aria-valuemax', String(info.need));
  bar.style.setProperty('--fill', String(info.fraction));
  $('xp-text').textContent = `${formatNumber(info.into)} / ${formatNumber(info.need)} XP לרמה ${info.level + 1}`;

  const today = todayString();
  const days = liveStreak(progress.streak, today);
  $('streak-stat').textContent = days > 0 ? `🔥 ${days} ${days === 1 ? 'יום' : 'ימים'} ברצף` : '🔥 שחקו היום כדי להתחיל רצף';
  const rounds = progress.daily.date === today ? progress.daily.rounds : 0;
  $('daily-stat').textContent = rounds >= DAILY_GOAL
    ? `✅ היעד היומי הושג (${rounds} סבבים)`
    : `🎯 יעד יומי: ${rounds}/${DAILY_GOAL} סבבים · בונוס ${DAILY_BONUS} XP`;

  const counts = [3, 2, 1, 0].map((lvl) => ({
    lvl,
    n: drugs.filter((d) => levelOf(progress, d.id) === lvl).length,
  }));
  const mastery = $('mastery-bar');
  clear(mastery);
  for (const { lvl, n } of counts) {
    const seg = el('i', levelClass(lvl));
    seg.style.setProperty('--n', String(n));
    mastery.append(seg);
  }
  mastery.setAttribute('aria-label', counts.map(({ lvl, n }) => `${LEVEL_LABELS[lvl]}: ${n}`).join(', '));
  const legend = $('mastery-legend');
  clear(legend);
  for (const { lvl, n } of counts) {
    const li = el('li');
    li.append(el('span', `swatch ${levelClass(lvl)}`), document.createTextNode(`${LEVEL_LABELS[lvl]} ${n}`));
    legend.append(li);
  }
}

function renderSetup() {
  const weak = weakDrugs(drugs, progress).length;
  const pool = $('pool');
  clear(pool);
  const add = (value, text, disabled = false) => {
    const opt = el('option', null, text);
    opt.value = value;
    opt.disabled = disabled;
    pool.append(opt);
  };
  add('all', `כל התרופות (${drugs.length})`);
  add('weak', weak >= WEAK_MIN ? `🎯 החלשות שלי (${weak})` : `🎯 החלשות שלי (נדרשות ${WEAK_MIN}, יש ${weak})`, weak < WEAK_MIN);
  for (const g of groups) add(`topic:${g.name}`, `${g.name} (${g.ids.length})`);
  if (![...pool.options].some((o) => o.value === selection && !o.disabled)) selection = 'all';
  pool.value = selection;

  const sizes = $('sizes');
  clear(sizes);
  for (const n of PAIR_SIZES) {
    const label = el('label', 'seg');
    const input = el('input');
    input.type = 'radio';
    input.name = 'size';
    input.value = String(n);
    input.checked = n === size;
    input.addEventListener('change', () => { size = n; renderNote(); });
    label.append(input, el('span', null, String(n)));
    sizes.append(label);
  }

  $('relaxed').checked = progress.settings.relaxed;
  $('speed-desc').textContent = progress.settings.relaxed
    ? `${SPEED_QUESTIONS} שאלות בלי שעון: מזהים את התרופה או את השימוש הנכון.`
    : `${SPEED_QUESTIONS} שאלות, ${SPEED_MS.toName / 1000}–${SPEED_MS.toUse / 1000} שניות לכל אחת. מהר יותר שווה יותר נקודות.`;
  renderNote();
}

function renderNote() {
  const n = poolDrugs().length;
  $('pool-note').textContent = n < size
    ? `בנושא הזה יש ${n} תרופות, ולכן בלוח יהיו ${n} זוגות.`
    : '';
}

function renderFx() {
  const btn = $('fx-toggle');
  btn.setAttribute('aria-pressed', String(progress.settings.effects));
  btn.textContent = `צלילים ורטט: ${progress.settings.effects ? 'מופעלים' : 'כבויים'}`;
  setEffects(progress.settings.effects);
}

function showHub() {
  stopActive();
  renderPlayer();
  renderSetup();
  show('hub');
  focusHeading('page-title');
}

// ---------- collection ----------

function openDetail(drug) {
  const rec = progress.drugs[drug.id];
  const body = $('detail-body');
  clear(body);
  const status = el('p', `detail-level ${levelClass(levelOf(progress, drug.id))}`, `רמה: ${LEVEL_LABELS[levelOf(progress, drug.id)]}`);
  if (rec) status.textContent += ` · נכון ${rec.right}, טעות ${rec.wrong}`;
  body.append(drugDetail(drug, { headingTag: 'h2', headingId: 'detail-title' }), status);
  $('detail').showModal();
}

function renderCollection() {
  const total = drugs.length;
  $('collection-summary').textContent = `${countAtLevel(progress, drugs, 1)} מתוך ${total} תרופות נחשפו · ${countAtLevel(progress, drugs, 3)} ברמת "שלי". תרופה נחשפת אחרי שפוגשים אותה במשחק.`;
  const root = $('collection-groups');
  clear(root);
  for (const g of groups) {
    const section = el('section', 'topic-group');
    const seen = g.ids.filter((id) => levelOf(progress, id) >= 1).length;
    const head = el('div', 'topic-head');
    head.append(el('h3', null, g.name), el('span', 'muted', `${seen}/${g.ids.length}`));
    const practice = el('button', 'link-button', 'תרגול הנושא');
    practice.type = 'button';
    practice.addEventListener('click', () => {
      selection = `topic:${g.name}`;
      start('pairs');
    });
    head.append(practice);
    const grid = el('ul', 'tiles');
    for (const id of g.ids) {
      const drug = byId.get(id);
      const level = levelOf(progress, id);
      const item = el('li');
      const tile = el('button', `tile ${levelClass(level)}`);
      tile.type = 'button';
      if (level >= 1) {
        tile.append(drugName(drug.name, 'span'), el('span', 'tile-level', LEVEL_LABELS[level]));
        tile.setAttribute('aria-label', `${drug.name}, ${LEVEL_LABELS[level]}`);
        tile.addEventListener('click', () => openDetail(drug));
      } else {
        tile.append(el('span', 'tile-lock', '?'), el('span', 'tile-level', 'עוד לא נחשפה'));
        tile.setAttribute('aria-label', 'תרופה שעוד לא נחשפה');
        tile.setAttribute('aria-disabled', 'true');
      }
      item.append(tile);
      grid.append(item);
    }
    section.append(head, grid);
    root.append(section);
  }
}

function openCollection() {
  renderCollection();
  show('collection');
  focusHeading('collection-title');
}

// ---------- achievements ----------

function achievementItem(a, unlockedOn) {
  const li = el('li', `achievement${unlockedOn ? ' is-unlocked' : ''}`);
  li.append(el('span', 'ach-icon', unlockedOn ? a.icon : '🔒'));
  const text = el('div');
  text.append(el('strong', null, a.title), el('span', 'muted', a.desc));
  if (unlockedOn) text.append(el('span', 'ach-date', `הושג ב־${unlockedOn.split('-').reverse().join('.')}`));
  li.append(text);
  return li;
}

function openAchievements() {
  const list = $('achievements-list');
  clear(list);
  const unlocked = ACHIEVEMENTS.filter((a) => progress.achievements[a.id]).length;
  $('achievements-summary').textContent = `${unlocked} מתוך ${ACHIEVEMENTS.length} הושגו.`;
  for (const a of ACHIEVEMENTS) list.append(achievementItem(a, progress.achievements[a.id]));
  show('achievements');
  focusHeading('achievements-title');
}

// ---------- playing ----------

function start(mode) {
  const pool = poolDrugs();
  const count = mode === 'speed' ? Math.min(SPEED_QUESTIONS, pool.length) : Math.min(size, pool.length);
  if (count < MIN_PAIRS) {
    $('pool-note').textContent = 'אין מספיק תרופות לסבב הזה.';
    return;
  }
  stopActive();
  lastRound = { mode, selection };
  const ids = pickDrugs(pool, progress, count, Math.random);
  show('game');
  const common = { root: $('game'), ids, byId, rng: Math.random, announce, onExit: showHub, onFinish: finish };
  if (mode === 'pairs') active = playPairs(common);
  else if (mode === 'connect') active = playConnect(common);
  else active = playSpeed({ ...common, drugs, relaxed: progress.settings.relaxed });
  $('game').focus({ preventScroll: true });
  const intro = { pairs: `סבב זוגות: ${ids.length} זוגות`, connect: `סבב חיבור: ${ids.length} תרופות לחבר לשימושים`, speed: `סבב מהירות: ${ids.length} שאלות` };
  announce(intro[mode]);
}

function finish(result) {
  stopActive();
  const before = progress;
  const applied = applyResult(before, result, todayString(), drugs);
  progress = applied.progress;
  persist();
  renderResult(result, applied.report, before);
}

// ---------- result ----------

function renderResult(result, report, before) {
  show('result');
  const title = $('result-title');
  title.textContent = RESULT_TITLES[result.stars];
  focusHeading('result-title');

  const stars = $('stars');
  clear(stars);
  stars.setAttribute('aria-label', `${result.stars} כוכבים מתוך 3`);
  const starEls = [0, 1, 2].map(() => stars.appendChild(el('span', 'star', '★')));
  const animate = motionAllowed();
  starEls.forEach((node, i) => {
    if (i >= result.stars) return;
    if (!animate) node.classList.add('is-on');
    else setTimeout(() => { node.classList.add('is-on'); sound('star', i + 1); }, 500 + i * 450);
  });

  countUp($('result-score'), result.score, 1100);
  const best = $('result-best');
  best.hidden = !(report.isBest && before.best[result.mode] > 0);
  best.textContent = '🏆 שיא חדש!';

  const rows = $('result-breakdown');
  clear(rows);
  const row = (text, value) => {
    const li = el('li');
    li.append(el('span', null, text), el('b', null, value));
    rows.append(li);
  };
  if (result.mode !== 'speed') {
    row(result.mode === 'connect' ? 'חיבורים' : 'התאמות', `${formatNumber(result.base)}`);
    row('רצף הכי ארוך', `${result.bestCombo}`);
    row('טעויות שאפשר היה להימנע מהן', `${result.misses}`);
    if (result.timeBonus) row('בונוס מהירות', ltr(`+${formatNumber(result.timeBonus)}`));
    if (result.perfectBonus) row('בונוס זיכרון חד', ltr(`+${formatNumber(result.perfectBonus)}`));
  } else {
    row('תשובות נכונות', `${result.correct}/${result.total}`);
    row('רצף הכי ארוך', `${result.bestStreak}`);
  }
  if (report.dailyBonus) row('בונוס יעד יומי', ltr(`+${formatNumber(report.dailyBonus)}`));

  const level = $('result-level');
  level.hidden = !report.leveledUp;
  if (report.leveledUp) level.textContent = `🎊 הגעתם לרמה ${report.levelAfter}: ${playerLevel(progress.xp).title}`;
  $('result-xp').textContent = ltr(`+${formatNumber(report.xpGained)} XP`);

  const promoted = $('result-promoted');
  clear(promoted);
  for (const id of report.promoted) {
    const li = el('li', `chip-static ${levelClass(levelOf(progress, id))}`);
    li.append(drugName(byId.get(id).name, 'span'), document.createTextNode(` ▲ ${LEVEL_LABELS[levelOf(progress, id)]}`));
    promoted.append(li);
  }
  $('result-promoted-box').hidden = report.promoted.length === 0;

  const achievements = $('result-achievements');
  clear(achievements);
  for (const id of report.newAchievements) {
    achievements.append(achievementItem(ACHIEVEMENTS.find((a) => a.id === id), progress.achievements[id]));
  }
  $('result-achievements-box').hidden = report.newAchievements.length === 0;

  const review = $('result-review');
  clear(review);
  const missed = [...new Set(result.outcomes.filter((o) => !o.ok).map((o) => o.drugId))];
  for (const id of missed) {
    const drug = byId.get(id);
    const li = el('li');
    li.append(drugName(drug.name, 'strong'), el('span', null, drug.indication));
    review.append(li);
  }
  $('result-review-box').hidden = missed.length === 0;

  $('again-weak').hidden = weakDrugs(drugs, progress).length < WEAK_MIN || selection === 'weak';

  if (result.stars >= 2 || report.leveledUp) setTimeout(() => confetti(result.stars === 3 ? 180 : 100), 300);
  if (report.leveledUp) sound('level');
  else if (result.stars >= 2) sound('win');
  announce(`${RESULT_TITLES[result.stars]} ${result.stars} כוכבים. ${formatNumber(result.score)} נקודות.`);
}

// ---------- wiring ----------

function wire() {
  $('pool').addEventListener('change', (e) => { selection = e.target.value; renderNote(); });
  $('relaxed').addEventListener('change', (e) => {
    progress = { ...progress, settings: { ...progress.settings, relaxed: e.target.checked } };
    persist();
    renderSetup();
  });
  $('setup').addEventListener('submit', (e) => e.preventDefault());
  $('play-pairs').addEventListener('click', () => start('pairs'));
  $('play-connect').addEventListener('click', () => start('connect'));
  $('play-speed').addEventListener('click', () => start('speed'));
  $('open-collection').addEventListener('click', openCollection);
  $('open-achievements').addEventListener('click', openAchievements);
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', showHub);
  $('to-hub').addEventListener('click', showHub);
  $('again').addEventListener('click', () => {
    if (lastRound) {
      selection = lastRound.selection;
      start(lastRound.mode);
    } else {
      showHub();
    }
  });
  $('again-weak').addEventListener('click', () => {
    selection = 'weak';
    start(lastRound?.mode ?? 'pairs');
  });
  $('fx-toggle').addEventListener('click', () => {
    progress = { ...progress, settings: { ...progress.settings, effects: !progress.settings.effects } };
    persist();
    renderFx();
    sound('match', 1);
  });
  const dialog = $('detail');
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  $('game').tabIndex = -1;
}

async function main() {
  const status = $('status');
  try {
    const response = await fetch('games/drugs.json');
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    if (!Array.isArray(data.drugs) || data.drugs.length < PAIR_SIZES[0]) throw new Error('bad data');
    drugs = data.drugs;
  } catch {
    status.textContent = 'לא הצלחנו לטעון את התרופות. נסו לרענן את הדף (בשרת מקומי: npm run serve).';
    return;
  }
  byId = new Map(drugs.map((d) => [d.id, d]));
  groups = listTopicGroups(drugs);
  topics = topicMap(drugs);
  status.hidden = true;
  wire();
  renderFx();
  showHub();
}

main();
