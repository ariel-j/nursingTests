// Pharmacodynamics summary (summaries/pharmacodynamics.html): the interactive parts around the static
// text. Search and filters, the dose-response simulator, the therapeutic-index calculator with its
// plasma curve, and the flashcards. The article's text works without any of this (and in all.html,
// which drops the [data-interactive] blocks). Maths lives in pharma-math.js, text data in pharma-data.js.
import {
  CURVES, LOG_MIN, LOG_MAX, PK, responseAt, therapeuticIndex, classifyTI, plasmaConcentration,
} from './pharma-math.js';
import { FLASHCARDS, TI_INFO } from './pharma-data.js';

const $ = (id) => document.getElementById(id);
const FONT = 'Assistant, "Segoe UI", Arial, sans-serif';

/** Size a canvas to its CSS box (sharp on high-DPI) and return its context and CSS size. */
function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.direction = 'rtl';
  return { ctx, w: rect.width, h: rect.height };
}

/** Call `draw` now and whenever the canvas changes size. */
function onResize(canvas, draw) {
  if ('ResizeObserver' in window) new ResizeObserver(draw).observe(canvas);
  else window.addEventListener('resize', draw);
  draw();
}

// ---------- reading progress ----------

function initReadingProgress() {
  const bar = $('read-progress');
  if (!bar) return;
  const update = () => {
    const root = document.documentElement;
    const max = root.scrollHeight - root.clientHeight;
    bar.style.transform = `scaleX(${max > 0 ? root.scrollTop / max : 0})`;
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ---------- search and filters ----------

function initSearch() {
  const input = $('pd-search');
  const counter = $('pd-search-count');
  const pills = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('.summary .sc')];
  const sections = [...document.querySelectorAll('.summary .topic-section')];
  let filter = 'all';

  const inCategory = (card, cat) => card.closest(`[data-category="${cat}"]`) !== null;
  const matchesFilter = (card, text) => {
    switch (filter) {
      case 'exam': return card.classList.contains('is-exam') || text.includes('נשאל');
      case 'curves': return inCategory(card, 'curves') || text.includes('emax') || text.includes('ec50') || text.includes('אינדקס');
      case 'receptors': return inCategory(card, 'receptors') || text.includes('רצפטור') || text.includes('gpcr');
      case 'combos': return inCategory(card, 'combos') || text.includes('סבילות') || text.includes('synergism') || text.includes('שילוב');
      default: return true;
    }
  };

  function run() {
    const query = input.value.trim().toLowerCase();
    const active = query !== '' || filter !== 'all';
    let visible = 0;
    for (const card of cards) {
      const text = card.textContent.toLowerCase();
      const show = (!query || text.includes(query)) && matchesFilter(card, text);
      card.classList.toggle('filtered-out', !show);
      if (show) visible++;
    }
    for (const sec of sections) {
      const empty = sec.querySelector('.sc:not(.filtered-out)') === null;
      sec.classList.toggle('dimmed', empty && active);
    }
    counter.textContent = active ? `נמצאו ${visible} תוצאות מתאימות` : 'מציג את כל הנושאים';
  }

  input.addEventListener('input', run);
  for (const pill of pills) {
    pill.addEventListener('click', () => {
      for (const p of pills) p.setAttribute('aria-pressed', String(p === pill));
      filter = pill.dataset.filter;
      run();
    });
  }
  // Print shows everything, whatever is filtered on screen.
  window.addEventListener('beforeprint', () => {
    for (const el of document.querySelectorAll('.filtered-out, .dimmed')) el.classList.remove('filtered-out', 'dimmed');
  });
  window.addEventListener('afterprint', run);
}

// ---------- dose-response simulator ----------

function initSimulator() {
  const canvas = $('dr-canvas');
  const slider = $('dose-slider');
  const doseOut = $('dose-value');
  const responseOut = $('response-value');
  const ec50Out = $('ec50-value');
  const legend = $('dr-legend');
  const explain = $('sim-explain');
  const buttons = [...document.querySelectorAll('[data-mode]')];
  let mode = 'full';

  function renderExplain() {
    const { lead, text } = CURVES[mode].explain;
    const head = document.createElement('b');
    head.className = 'sim-lead';
    head.textContent = '💡 מסקנה פרמקולוגית למבחן:';
    const strong = document.createElement('b');
    strong.textContent = lead;
    explain.replaceChildren(head, strong, ` ${text}`);
  }

  function draw() {
    const prepared = prepareCanvas(canvas);
    const logDose = parseFloat(slider.value);
    const curve = CURVES[mode];
    const response = responseAt(logDose, curve);
    doseOut.textContent = logDose.toFixed(2);
    responseOut.textContent = `${response.toFixed(1)}%`;
    ec50Out.textContent = curve.logEC50.toFixed(2);
    legend.textContent = curve.name;
    canvas.setAttribute('aria-label',
      `עקומת מנה-תגובה: ${curve.name}. בריכוז log ${logDose.toFixed(2)} התגובה היא ${response.toFixed(1)} אחוז, log EC50 הוא ${curve.logEC50.toFixed(2)}.`);
    if (!prepared) return;

    const { ctx, w, h } = prepared;
    const padL = 45, padR = 25, padT = 25, padB = 35;
    const x = (log) => padL + ((log - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (w - padL - padR);
    const y = (pct) => padT + (h - padT - padB) * (1 - pct / 100);

    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'right';
    for (const tick of [0, 25, 50, 75, 100]) {
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y(tick));
      ctx.lineTo(w - padR, y(tick));
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${tick}%`, padL - 8, y(tick) + 3);
    }
    // EC50 reference level
    ctx.strokeStyle = 'rgba(20, 184, 166, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, y(50));
    ctx.lineTo(w - padR, y(50));
    ctx.stroke();
    ctx.setLineDash([]);

    const trace = (c) => {
      ctx.beginPath();
      for (let l = LOG_MIN; l <= LOG_MAX + 1e-9; l += 0.05) {
        const px = x(l), py = y(responseAt(l, c));
        if (l === LOG_MIN) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };
    if (mode !== 'full') { // the agonist alone, as a ghost to compare against
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      trace(CURVES.full);
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 3.5;
    trace(curve);

    // current dose
    const cx = x(logDose), cy = y(response);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = curve.color;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  slider.addEventListener('input', draw);
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === btn));
      mode = btn.dataset.mode;
      renderExplain();
      draw();
    });
  }
  renderExplain();
  onResize(canvas, draw);
}

// ---------- therapeutic index calculator + plasma curve ----------

function initTherapeuticIndex() {
  const ed50 = $('ed50-slider');
  const td50 = $('td50-slider');
  const ed50Out = $('ed50-value');
  const td50Out = $('td50-value');
  const tiOut = $('ti-value');
  const alert = $('ti-alert');
  const icon = $('ti-alert-icon');
  const title = $('ti-alert-title');
  const desc = $('ti-alert-desc');
  const bolusBtn = $('bolus-toggle');
  const canvas = $('pk-canvas');
  let bolus = false;

  function update() {
    const ed = parseFloat(ed50.value);
    const td = parseFloat(td50.value);
    ed50Out.textContent = `${ed} mg`;
    td50Out.textContent = `${td} mg`;
    const ti = therapeuticIndex(ed, td);
    const shown = ti.toFixed(2);
    tiOut.textContent = shown;
    const level = classifyTI(ti);
    const info = TI_INFO[level];
    alert.dataset.level = level;
    icon.textContent = info.icon;
    title.textContent = info.title(shown);
    desc.textContent = info.desc;
  }

  function draw() {
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, w, h } = prepared;
    const padL = 76, padR = 20, padT = 20, padB = 25;
    const yOf = (conc) => padT + (h - padT - padB) * (1 - Math.min(conc, PK.concMax) / PK.concMax);
    const mtcY = yOf(PK.mtc);
    const mecY = yOf(PK.mec);

    ctx.fillStyle = 'rgba(20, 184, 166, 0.12)';
    ctx.fillRect(padL, mtcY, w - padL - padR, mecY - mtcY);

    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    for (const [yy, color] of [[mtcY, '#f43f5e'], [mecY, '#14b8a6']]) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(padL, yy);
      ctx.lineTo(w - padR, yy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f43f5e';
    ctx.fillText('MTC (רעיל)', padL - 6, mtcY + 3);
    ctx.fillStyle = '#14b8a6';
    ctx.fillText('MEC (יעיל)', padL - 6, mecY + 3);

    const color = bolus ? '#38bdf8' : '#fbbf24';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let t = 0; t <= PK.timeMax + 1e-9; t += 0.1) {
      const px = padL + (t / PK.timeMax) * (w - padL - padR);
      const py = yOf(plasmaConcentration(t, bolus));
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(bolus ? '⚡ מנת בולוס: מעבר מיידי של ה-MEC' : 'מתן הדרגתי: זמן הגעה מושהה (Onset)', padL + 10, padT + 16);
    canvas.setAttribute('aria-label', bolus
      ? 'עקומת ריכוז בדם לאורך זמן אחרי מנת בולוס: הריכוז עובר מיד את סף ה-MEC ואז יורד לאיטו.'
      : 'עקומת ריכוז בדם לאורך זמן אחרי מתן הדרגתי: הריכוז עולה לאט ומגיע ל-MEC רק אחרי זמן (Onset).');
  }

  ed50.addEventListener('input', update);
  td50.addEventListener('input', update);
  bolusBtn.addEventListener('click', () => {
    bolus = !bolus;
    bolusBtn.textContent = bolus ? 'הצג מתן פומי הדרגתי ⏳' : 'הדגם מנת בולוס (Loading Dose) ⚡';
    bolusBtn.setAttribute('aria-pressed', String(bolus));
    draw();
  });
  update();
  onResize(canvas, draw);
}

// ---------- flashcards ----------

function initFlashcards() {
  const card = $('flashcard');
  const num = $('card-num');
  const question = $('card-question');
  const answer = $('card-answer');
  const front = $('card-front');
  const back = $('card-back');
  const progress = $('flash-progress');
  const known = new Set();
  let index = 0;

  function setFlipped(flipped) {
    card.dataset.flipped = String(flipped);
    front.setAttribute('aria-hidden', String(flipped));
    back.setAttribute('aria-hidden', String(!flipped));
  }

  function show() {
    setFlipped(false);
    const item = FLASHCARDS[index];
    num.textContent = `${index + 1} / ${FLASHCARDS.length}`;
    question.textContent = item.q;
    answer.textContent = item.a;
    progress.textContent = `${known.size} מתוך ${FLASHCARDS.length} נלמדו בהצלחה`;
  }

  const go = (step) => {
    index = (index + step + FLASHCARDS.length) % FLASHCARDS.length;
    show();
  };

  card.addEventListener('click', () => setFlipped(card.dataset.flipped !== 'true'));
  $('card-prev').addEventListener('click', () => go(-1));
  $('card-next').addEventListener('click', () => go(1));
  $('card-known').addEventListener('click', () => { known.add(index); go(1); });
  $('card-again').addEventListener('click', () => { known.delete(index); go(1); });
  show();
}

initReadingProgress();
initSearch();
initSimulator();
initTherapeuticIndex();
initFlashcards();
