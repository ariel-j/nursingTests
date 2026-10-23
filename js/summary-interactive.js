// Interactive layer for the study-hub summaries (tabs, flip cards, expandable rows, a scale
// switch and a mini quiz). The page is complete static HTML: this only enhances it, so without
// JS (and in print / the combined PDF, which never calls enhance) every panel is simply shown.
// Built with the DOM APIs only, never innerHTML.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function activate(node, handler) {
  node.addEventListener('click', handler);
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  });
}

/** Rows that behave like a button: focusable, announced as such, toggled with click / Enter / Space. */
function makeToggle(node, onToggle) {
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  activate(node, () => onToggle());
}

function setupTabs(article) {
  const panels = [...article.querySelectorAll(':scope > section[data-tab]')];
  if (panels.length < 2) return;
  const bar = el('div', 'tabs no-print');
  bar.setAttribute('role', 'tablist');
  const tabs = panels.map((panel, i) => {
    panel.id ||= `${article.dataset.system}-panel-${i}`;
    const tab = el('button', 'tab', panel.dataset.tab);
    tab.type = 'button';
    tab.id = `${panel.id}-tab`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    return tab;
  });
  const select = (index, focus) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) tabs[index].focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i, false));
    tab.addEventListener('keydown', (e) => {
      // RTL: the next tab is to the left.
      const step = { ArrowLeft: 1, ArrowRight: -1 }[e.key];
      if (step) {
        e.preventDefault();
        select((i + step + tabs.length) % tabs.length, true);
      }
    });
  });
  bar.append(...tabs);
  article.querySelector(':scope > header').after(bar);
  select(0, false);
}

// Scroll-through hubs: a sticky row of links to the sections, highlighting the one in view.
function setupNav(article) {
  const sections = [...article.querySelectorAll(':scope > section[data-nav]')];
  if (sections.length < 2) return;
  const bar = el('nav', 'chipnav no-print');
  bar.setAttribute('aria-label', 'ניווט בסיכום');
  const links = new Map(sections.map((sec) => {
    const a = el('a', 'chip', sec.dataset.nav);
    a.href = `#${sec.id}`;
    return [sec, a];
  }));
  bar.append(...links.values());
  article.querySelector(':scope > header').after(bar);
  if (!('IntersectionObserver' in window)) return;
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const [sec, a] of links) {
        if (sec === entry.target) {
          a.setAttribute('aria-current', 'true');
          a.scrollIntoView({ inline: 'center', block: 'nearest' });
        } else {
          a.removeAttribute('aria-current');
        }
      }
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  for (const sec of sections) seen.observe(sec);
}

function setupCards(article) {
  for (const card of article.querySelectorAll('.fc')) {
    const front = card.querySelector('.fc-front');
    const back = card.querySelector('.fc-back');
    const sync = () => {
      const flipped = card.classList.contains('flip');
      card.setAttribute('aria-pressed', String(flipped));
      front.setAttribute('aria-hidden', String(flipped));
      back.setAttribute('aria-hidden', String(!flipped));
    };
    makeToggle(card, () => {
      card.classList.toggle('flip');
      sync();
    });
    sync();
  }
}

function setupLevels(article) {
  for (const row of article.querySelectorAll('.lvl')) {
    row.setAttribute('aria-expanded', 'false');
    makeToggle(row, () => {
      row.setAttribute('aria-expanded', String(row.classList.toggle('open')));
    });
  }
}

function setupScales(article) {
  const group = article.querySelector('.scales');
  if (!group) return;
  const cards = [...group.querySelectorAll('.scale-card')];
  const bar = el('div', 'scale-toggle no-print');
  const buttons = cards.map((card, i) => {
    const btn = el('button', 'scale-btn', card.dataset.label);
    btn.type = 'button';
    btn.addEventListener('click', () => show(i));
    return btn;
  });
  const show = (index) => {
    cards.forEach((card, i) => { card.hidden = i !== index; });
    buttons.forEach((btn, i) => btn.setAttribute('aria-pressed', String(i === index)));
  };
  bar.append(...buttons);
  group.prepend(bar);
  show(0);
}

function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function readQuestions(set) {
  return [...set.querySelectorAll('.mq')].map((q) => ({
    stem: q.querySelector('.mq-q').textContent,
    options: [...q.querySelectorAll('.mq-opts li')].map((li) => ({
      text: li.textContent,
      ok: li.classList.contains('ok'),
    })),
    explanation: q.querySelector('.mq-exp').textContent,
  }));
}

function setupQuiz(article) {
  const set = article.querySelector('.mq-set');
  if (!set) return;
  const questions = readQuestions(set);
  set.classList.add('is-live');

  const box = el('div', 'quiz no-print');
  const chips = el('div', 'xpbar');
  const xpVal = el('b', null, '0');
  const streakVal = el('b', null, '0');
  const lvlVal = el('b', null, '1');
  for (const [label, val] of [['⭐ XP ', xpVal], ['🔥 רצף ', streakVal], ['📈 רמה ', lvlVal]]) {
    const chip = el('span', 'xpchip', label);
    chip.append(val);
    chips.append(chip);
  }
  const body = el('div', 'quiz-body');
  box.append(chips, body);
  set.after(box);

  let index = 0;
  let xp = 0;
  let streak = 0;
  const addXp = () => {
    xp += 10;
    streak += 1;
    xpVal.textContent = String(xp);
    streakVal.textContent = String(streak);
    lvlVal.textContent = String(Math.floor(xp / 50) + 1);
  };
  const breakStreak = () => {
    streak = 0;
    streakVal.textContent = '0';
  };

  const render = () => {
    body.replaceChildren();
    if (index >= questions.length) {
      const again = el('button', 'btn', 'התחלה מחדש');
      again.type = 'button';
      again.addEventListener('click', () => { index = 0; render(); });
      body.append(el('p', 'q-stem', 'סיימתם את החידון! 🎉'),
        el('p', 'muted', `צברתם ${xp} XP. חזרו לכרטיסיות ונסו לשלוף את התשובה לפני ההפיכה.`), again);
      return;
    }
    const q = questions[index];
    const opts = el('div', 'opts');
    const exp = el('p', 'q-exp', q.explanation);
    exp.setAttribute('role', 'status');
    exp.hidden = true;
    const next = el('button', 'btn', 'הבא ←');
    next.type = 'button';
    next.disabled = true;
    next.addEventListener('click', () => { index += 1; render(); });

    const picks = shuffle(q.options).map((o) => {
      const btn = el('button', 'opt', o.text);
      btn.type = 'button';
      return { o, btn };
    });
    for (const { o, btn } of picks) {
      btn.addEventListener('click', () => {
        for (const p of picks) p.btn.disabled = true;
        if (o.ok) {
          btn.classList.add('correct');
          addXp();
        } else {
          btn.classList.add('wrong');
          breakStreak();
          picks.find((p) => p.o.ok).btn.classList.add('correct');
        }
        exp.hidden = false;
        next.disabled = false;
        next.focus();
      });
    }
    opts.append(...picks.map((p) => p.btn));
    const foot = el('div', 'q-foot');
    foot.append(el('span', 'q-prog', `שאלה ${index + 1} / ${questions.length}`), next);
    body.append(el('p', 'q-stem', q.stem), opts, exp, foot);
  };
  render();
}

/** Turns the static summary into the interactive study hub. */
export function enhance(article) {
  article.classList.add('is-interactive');
  setupTabs(article);
  setupNav(article);
  setupCards(article);
  setupLevels(article);
  setupScales(article);
  setupQuiz(article);
}

for (const article of document.querySelectorAll('article.summary')) {
  if (article.querySelector('[data-tab], [data-nav]')) enhance(article);
}
