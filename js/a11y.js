// Self-contained accessibility toolbar. No third-party overlay: it only sets data-* attributes
// on <html>, which css/style.css turns into text scaling, high contrast, underlined links and
// stopped motion. Choices persist per browser. The underlying site is already keyboard- and
// screen-reader-friendly; this is an extra convenience, not a replacement for that.
import { load, save } from './storage.js';

const KEY = 'a11y';
const TEXT_STEPS = ['normal', 'large', 'xlarge'];
const DEFAULTS = { text: 0, contrast: false, links: false, motion: false };

const root = document.documentElement;
let state = { ...DEFAULTS, ...(load(KEY) ?? {}) };

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

// A decorative "person" icon, built with the SVG DOM API (no innerHTML anywhere in the project).
function personIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '26');
  svg.setAttribute('height', '26');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const head = document.createElementNS(NS, 'circle');
  head.setAttribute('cx', '12');
  head.setAttribute('cy', '4');
  head.setAttribute('r', '2');
  head.setAttribute('fill', 'currentColor');
  const body = document.createElementNS(NS, 'path');
  body.setAttribute('fill', 'none');
  body.setAttribute('stroke', 'currentColor');
  body.setAttribute('stroke-width', '2');
  body.setAttribute('stroke-linecap', 'round');
  body.setAttribute('d', 'M4 8h16M12 8v6m0 0l-4 6m4-6l4 6');
  svg.append(head, body);
  return svg;
}

function setAttr(name, value) {
  if (value) root.setAttribute(name, value);
  else root.removeAttribute(name);
}

function apply() {
  state.text = Math.min(TEXT_STEPS.length - 1, Math.max(0, state.text | 0));
  setAttr('data-text-size', state.text > 0 ? TEXT_STEPS[state.text] : '');
  setAttr('data-contrast', state.contrast ? 'high' : '');
  setAttr('data-links', state.links ? 'underline' : '');
  setAttr('data-motion', state.motion ? 'off' : '');
}

// Apply saved settings as early as this module runs, before building the UI.
apply();

function build() {
  const panelId = 'a11y-panel';
  const toggle = el('button', {
    type: 'button',
    class: 'a11y-toggle',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    'aria-controls': panelId,
    'aria-label': 'תפריט נגישות',
    title: 'תפריט נגישות',
  });
  toggle.append(personIcon());

  const controls = [];
  const container = el('section', { id: panelId, class: 'a11y-panel', 'aria-label': 'הגדרות נגישות', hidden: '' });
  const heading = el('h2', { class: 'a11y-title', text: 'נגישות' });

  const textValue = el('span', { class: 'a11y-value', 'aria-live': 'polite' });
  const dec = el('button', { type: 'button', class: 'a11y-btn', text: 'א−', 'aria-label': 'הקטן טקסט' });
  const inc = el('button', { type: 'button', class: 'a11y-btn', text: 'א+', 'aria-label': 'הגדל טקסט' });
  const textRow = el('div', { class: 'a11y-row' },
    el('span', { class: 'a11y-label', text: 'גודל טקסט' }),
    el('span', { class: 'a11y-stepper' }, dec, textValue, inc));

  function refresh() {
    textValue.textContent = ['רגיל', 'גדול', 'גדול מאוד'][state.text];
    dec.disabled = state.text === 0;
    inc.disabled = state.text === TEXT_STEPS.length - 1;
    for (const c of controls) c.el.setAttribute('aria-pressed', String(state[c.key]));
  }

  function change(mutate) {
    mutate();
    apply();
    save(KEY, state);
    refresh();
  }

  dec.addEventListener('click', () => change(() => { state.text -= 1; }));
  inc.addEventListener('click', () => change(() => { state.text += 1; }));

  const toggles = [
    { key: 'contrast', label: 'ניגודיות גבוהה' },
    { key: 'links', label: 'הדגשת קישורים' },
    { key: 'motion', label: 'עצירת אנימציות' },
  ];
  const toggleRows = toggles.map(({ key, label }) => {
    const btn = el('button', { type: 'button', class: 'a11y-btn a11y-switch', 'aria-pressed': 'false', text: label });
    btn.addEventListener('click', () => change(() => { state[key] = !state[key]; }));
    controls.push({ key, el: btn });
    return el('div', { class: 'a11y-row' }, btn);
  });

  const reset = el('button', { type: 'button', class: 'a11y-reset', text: 'איפוס הגדרות' });
  reset.addEventListener('click', () => change(() => { state = { ...DEFAULTS }; }));

  // Resolved from this module so it also works on pages in subfolders (summaries/).
  const statementHref = new URL('../accessibility.html', import.meta.url).href;
  const statement = el('a', { class: 'a11y-statement', href: statementHref, text: 'הצהרת נגישות' });

  container.append(heading, textRow, ...toggleRows, reset, statement);

  // Open/close behavior
  function setOpen(open) {
    container.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      refresh();
      dec.focus({ preventScroll: true });
    }
  }
  toggle.addEventListener('click', () => setOpen(container.hidden));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !container.hidden) {
      setOpen(false);
      toggle.focus({ preventScroll: true });
    }
  });
  document.addEventListener('click', (e) => {
    if (!container.hidden && !wrap.contains(e.target)) setOpen(false);
  });

  const wrap = el('div', { class: 'a11y' }, toggle, container);
  refresh();
  document.body.append(wrap);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', build, { once: true });
} else {
  build();
}
