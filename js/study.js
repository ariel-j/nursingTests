// Interactive study hub (study/<id>.html): tabs of flip cards, expandable rows, reveal cards, filters
// and a quick quiz. Content comes from js/study-data/<id>.js; this file only renders it, with the DOM
// APIs (never innerHTML). In text, **word** marks bold.

const page = document.body.dataset.study;
const data = (await import(`./study-data/${page}.js`)).default;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Text with **bold** parts as a fragment of text nodes and <b> elements. */
function rich(text) {
  const frag = document.createDocumentFragment();
  text.split('**').forEach((part, i) => {
    if (part === '') return;
    if (i % 2) frag.append(el('b', null, part));
    else frag.append(part);
  });
  return frag;
}

function toggleButton(className) {
  const btn = el('button', className);
  btn.type = 'button';
  return btn;
}

// ---------- score chips ----------

const score = { xp: 0, streak: 0 };
const chips = {};
function renderScore() {
  chips.xp.textContent = score.xp;
  chips.streak.textContent = score.streak;
  chips.lvl.textContent = Math.floor(score.xp / 50) + 1;
}
function scoreChips() {
  const bar = el('div', 'xpbar');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'ניקוד');
  for (const [key, icon, label] of [['xp', '⭐', 'XP'], ['streak', '🔥', 'רצף'], ['lvl', '📈', 'רמה']]) {
    const chip = el('span', 'xpchip');
    chips[key] = el('b');
    chip.append(`${icon} ${label} `, chips[key]);
    bar.append(chip);
  }
  score.xp = 0;
  score.streak = 0;
  renderScore();
  return bar;
}

// ---------- blocks ----------

function deck(items) {
  const grid = el('div', 'deck');
  for (const c of items) {
    const card = toggleButton('fc');
    card.setAttribute('aria-pressed', 'false');
    const inner = el('span', 'fc-in');
    const front = el('span', 'fc-face fc-front');
    front.append(el('span', 'term', c.t), el('span', 'hint', c.hint));
    const back = el('span', 'fc-face fc-back');
    back.append(rich(c.b));
    inner.append(front, back);
    card.append(inner);
    card.addEventListener('click', () => {
      const flipped = card.classList.toggle('flip');
      card.setAttribute('aria-pressed', String(flipped));
    });
    grid.append(card);
  }
  return grid;
}

function values(items) {
  const list = el('div', 'vtable');
  for (const r of items) {
    const row = el('div', 'vrow');
    const head = toggleButton('vhead');
    head.setAttribute('aria-expanded', 'false');
    head.append(el('span', 'name', r.name), el('span', 'val', r.val));
    const detail = el('div', 'detail');
    detail.hidden = true;
    detail.append(rich(r.d));
    head.addEventListener('click', () => {
      const open = detail.hidden;
      detail.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
    });
    row.append(head, detail);
    list.append(row);
  }
  return list;
}

function reveal(items) {
  const grid = el('div', 'diap');
  for (const x of items) {
    const card = toggleButton('dcard');
    card.setAttribute('aria-expanded', 'false');
    const he = el('span', 'he', x.he);
    he.hidden = true;
    card.append(el('span', 'ltr', x.l), el('span', 'word', x.w), he);
    card.addEventListener('click', () => {
      const open = he.hidden;
      he.hidden = !open;
      card.setAttribute('aria-expanded', String(open));
    });
    grid.append(card);
  }
  return grid;
}

function cards(items) {
  const grid = el('div', 'cards');
  for (const c of items) {
    const card = el('div', c.warn ? 'ic warn' : 'ic');
    const ul = el('ul');
    for (const text of c.li) {
      const li = el('li');
      li.append(rich(text));
      ul.append(li);
    }
    card.append(el('h3', null, c.h), ul);
    grid.append(card);
  }
  return grid;
}

function bristol(items) {
  const list = el('ul', 'bristol');
  for (const b of items) {
    const row = el('li', 'brow');
    row.dataset.zone = b.zone;
    row.append(el('span', 'n', String(b.n)), el('span', 'lbl', b.lbl), el('span', 'zone', b.zoneLabel));
    list.append(row);
  }
  return list;
}

function filterList(block) {
  const wrap = el('div');
  const bar = el('div', 'lax-toggle');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'סינון לפי מנגנון');
  const list = el('div', 'lax-list');
  list.setAttribute('aria-live', 'polite');
  const renderList = (cat) => {
    list.replaceChildren(...block.items
      .filter((l) => cat === block.cats[0] || l.cat === cat)
      .map((l) => {
        const row = el('div', 'lax');
        const name = el('div', 'nm', l.nm + ' ');
        name.append(el('span', 'cat', `· ${l.cat}`));
        row.append(name, el('div', 'mech', l.mech));
        return row;
      }));
  };
  block.cats.forEach((cat, i) => {
    const btn = toggleButton(i === 0 ? 'on' : '');
    btn.textContent = cat;
    btn.setAttribute('aria-pressed', String(i === 0));
    btn.addEventListener('click', () => {
      for (const b of bar.children) {
        b.classList.remove('on');
        b.setAttribute('aria-pressed', 'false');
      }
      btn.classList.add('on');
      btn.setAttribute('aria-pressed', 'true');
      renderList(cat);
    });
    bar.append(btn);
  });
  renderList(block.cats[0]);
  wrap.append(bar, list);
  return wrap;
}

function quiz(questions) {
  const box = el('div', 'quiz');
  let index = 0;

  const render = () => {
    if (index >= questions.length) {
      const restart = toggleButton('btn');
      restart.textContent = 'התחל מחדש';
      restart.addEventListener('click', () => { index = 0; render(); });
      box.replaceChildren(
        el('div', 'q-stem', 'סיימת! 🎉'),
        el('p', 'muted', `צברת ${score.xp} XP. חזרי לכרטיסיות ולטבלאות לשליפה פעילה.`),
        restart,
      );
      return;
    }
    const q = questions[index];
    const opts = el('div', 'opts');
    const exp = el('div', 'q-exp', q.explanation);
    exp.hidden = true;
    exp.setAttribute('role', 'status');
    const next = toggleButton('btn');
    next.textContent = 'הבא ←';
    next.disabled = true;
    let answered = false;

    const order = q.options.map((text, i) => ({ text, i })).sort(() => Math.random() - 0.5);
    const buttons = order.map((o) => {
      const b = toggleButton('opt');
      b.textContent = o.text;
      b.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        buttons.forEach((x) => { x.disabled = true; });
        if (o.i === q.correct) {
          b.classList.add('correct');
          score.xp += 10;
          score.streak += 1;
        } else {
          b.classList.add('wrong');
          score.streak = 0;
          buttons[order.findIndex((x) => x.i === q.correct)].classList.add('correct');
        }
        renderScore();
        exp.hidden = false;
        next.disabled = false;
        next.focus();
      });
      return b;
    });
    opts.append(...buttons);
    next.addEventListener('click', () => { index += 1; render(); });

    const foot = el('div', 'q-foot');
    foot.append(el('span', 'q-prog', `שאלה ${index + 1} / ${questions.length}`), next);
    box.replaceChildren(el('div', 'q-stem', q.question), opts, exp, foot);
  };
  render();
  return box;
}

const BLOCKS = { deck, values, reveal, cards, bristol, quiz };

// ---------- page ----------

function build() {
  document.title = `${data.title} — תרגול אינטראקטיבי`;
  const root = document.getElementById('study');

  const hero = el('header', 'hero');
  hero.append(el('div', 'kick', data.kicker), el('h1', null, data.title), el('p', 'lede', data.lede), scoreChips());

  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'נושאים');
  const sections = [];
  const tabButtons = [];

  const select = (i, focus) => {
    tabButtons.forEach((t, j) => {
      t.setAttribute('aria-selected', String(i === j));
      t.tabIndex = i === j ? 0 : -1;
      sections[j].hidden = i !== j;
    });
    if (focus) tabButtons[i].focus();
  };

  data.panels.forEach((p, i) => {
    const tab = toggleButton('tab');
    tab.id = `tab-${p.id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `panel-${p.id}`);
    tab.textContent = p.label;
    tab.addEventListener('click', () => select(i, false));
    tab.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: 1, ArrowRight: -1 }[e.key]; // RTL: left is the next tab
      if (!step) return;
      e.preventDefault();
      select((i + step + data.panels.length) % data.panels.length, true);
    });
    tabButtons.push(tab);

    const section = el('section', 'panel');
    section.id = `panel-${p.id}`;
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', tab.id);
    section.append(el('h2', null, p.title), el('p', 'muted', p.note));
    for (const block of p.blocks) section.append((block.type === 'filter' ? filterList(block) : BLOCKS[block.type](block.items)));
    sections.push(section);
  });
  tabs.append(...tabButtons);

  const tip = el('p', 'tip');
  tip.append('💡 ', rich(data.tip));
  root.replaceChildren(hero, tabs, ...sections, tip);
  select(0, false);
}

build();
