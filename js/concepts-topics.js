// "נושאים" on the concept-cards page: the topics the learner is studying now, one choice for the
// daily review and every game, remembered per subject. Each tab shows its own picker (a collapsible
// checkbox list, grouped by unit when a unit has several topics); all pickers stay in sync.
import { filterCards, sanitizeTopics, topicGroups } from './concepts-core.js';
import { button, el } from './drugs-ui.js';
import { keys, load, save } from './storage.js';

export function createTopics(deck, cards, subjectId) {
  const key = keys.conceptTopics(subjectId);
  const ids = deck.topics.map((t) => t.id);
  let chosen = sanitizeTopics(load(key, null), ids);
  const pickers = []; // update functions of the mounted pickers
  const listeners = [];
  const counts = new Map(ids.map((id) => [id, filterCards(cards, { topics: [id] }).length]));
  const groups = topicGroups(deck);

  const label = () => (chosen.length === ids.length ? `כל ${ids.length} הנושאים` : `${chosen.length} מתוך ${ids.length}`);

  function choose(next) {
    chosen = next;
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
    const legend = el('legend', 'visually-hidden', 'הנושאים שייכללו בחזרה ובמשחקים');
    const actions = el('div', 'topics-actions');
    actions.append(
      button('link-button', 'בחירת הכול', () => choose([...ids])),
      button('link-button', 'ניקוי', () => choose([])),
    );
    const topicBox = (t, into) => {
      const input = el('input');
      input.type = 'checkbox';
      input.value = t.id;
      input.addEventListener('change', () => choose(ids.filter((id) => (id === t.id ? input.checked : chosen.includes(id)))));
      const row = el('label', 'drug-check');
      row.append(input, ` ${t.title} (${counts.get(t.id)})`);
      into.append(row);
      return input;
    };
    const list = el('div', 'topics-list');
    const boxes = [];
    const unitBoxes = []; // { input, ids }
    if (groups) {
      list.classList.add('is-grouped');
      for (const g of groups) {
        const group = el('div', 'topics-unit');
        const unitIds = g.topics.map((t) => t.id);
        const input = el('input');
        input.type = 'checkbox';
        // Checked = the whole unit; the boxes below it stay the place to pick single topics.
        input.addEventListener('change', () => choose(ids.filter((id) => (unitIds.includes(id) ? input.checked : chosen.includes(id)))));
        const head = el('label', 'drug-check topics-unit-title');
        head.append(input, ` ${g.unit || 'כללי'}`);
        const inner = el('div', 'topics-unit-list');
        for (const t of g.topics) boxes.push(topicBox(t, inner));
        group.append(head, inner);
        list.append(group);
        unitBoxes.push({ input, ids: unitIds });
      }
    } else {
      for (const t of deck.topics) boxes.push(topicBox(t, list));
    }
    body.append(legend, actions, list);
    details.append(summary, body);
    container.append(details);
    const update = () => {
      for (const box of boxes) box.checked = chosen.includes(box.value);
      for (const { input, ids: unitIds } of unitBoxes) {
        const n = unitIds.filter((id) => chosen.includes(id)).length;
        input.checked = n === unitIds.length;
        input.indeterminate = n > 0 && n < unitIds.length;
      }
      count.textContent = label();
    };
    pickers.push(update);
    update();
  }

  return {
    mount,
    /** The chosen topic ids, in deck order. */
    chosen: () => chosen,
    /** Whether every topic is chosen (personal bests count only then). */
    all: () => chosen.length === ids.length,
    /** The cards of the chosen topics, optionally of one kind. */
    cards: (kind = null) => filterCards(cards, { kind, topics: chosen }),
    onChange: (fn) => listeners.push(fn),
  };
}
