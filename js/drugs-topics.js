// "נושאים": the families the learner is studying now, one choice for the daily review and every game
// on the drug-cards page, remembered per subject. Each tab shows its own picker (a collapsible
// checkbox list); all pickers stay in sync.
import { filterDrugs, sanitizeFamilies } from './drugs-core.js';
import { button, el } from './drugs-ui.js';
import { keys, load, save } from './storage.js';

export function createTopics(deck, subjectId) {
  const key = keys.drugTopics(subjectId);
  let chosen = sanitizeFamilies(load(key, null), deck.families);
  const pickers = []; // update functions of the mounted pickers
  const listeners = [];
  const counts = new Map(deck.families.map((f) => [f, filterDrugs(deck.drugs, { family: f }).length]));

  const label = () => (chosen.length === deck.families.length
    ? `כל ${deck.families.length} הנושאים`
    : `${chosen.length} מתוך ${deck.families.length}`);

  function choose(families) {
    chosen = families;
    save(key, chosen);
    // The games restart and may take focus; keep it on the checkbox or button that was used.
    const active = document.activeElement;
    for (const update of pickers) update();
    for (const fn of listeners) fn();
    active?.focus({ preventScroll: true });
  }

  /** A picker appended to `container`. */
  function mount(container) {
    const details = el('details', 'topics');
    const summary = el('summary', null, 'נושאים · ');
    const count = el('span');
    summary.append(count);
    const body = el('fieldset', 'topics-body');
    const legend = el('legend', 'visually-hidden', 'משפחות התרופות שייכללו בחזרה ובמשחקים');
    const actions = el('div', 'topics-actions');
    actions.append(
      button('link-button', 'בחירת הכול', () => choose([...deck.families])),
      button('link-button', 'ניקוי', () => choose([])),
    );
    const list = el('div', 'topics-list');
    const boxes = deck.families.map((f) => {
      const input = el('input');
      input.type = 'checkbox';
      input.value = f;
      input.addEventListener('change', () => choose(deck.families.filter((g) => g === f ? input.checked : chosen.includes(g))));
      const row = el('label', 'drug-check');
      row.append(input, ` ${f} (${counts.get(f)})`);
      list.append(row);
      return input;
    });
    body.append(legend, actions, list);
    details.append(summary, body);
    container.append(details);
    const update = () => {
      for (const box of boxes) box.checked = chosen.includes(box.value);
      count.textContent = label();
    };
    pickers.push(update);
    update();
  }

  return {
    mount,
    /** The chosen families, in deck order. */
    chosen: () => chosen,
    /** Whether every family is chosen (personal bests count only then). */
    all: () => chosen.length === deck.families.length,
    /** The deck's drugs in the chosen families, with any other filterDrugs options. */
    drugs: (options = {}) => filterDrugs(deck.drugs, { ...options, families: chosen }),
    onChange: (fn) => listeners.push(fn),
  };
}
