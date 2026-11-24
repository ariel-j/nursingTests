// The panel that explains a drug after a match, shared by the pairs and connect modes.
import { comboMultiplier } from './memory-core.js';
import { drugDetail } from './memory-detail.js';
import { clear, el, ltr } from './memory-dom.js';

/**
 * Fills `panel` with the points just earned and the drug's full explanation, and shows it.
 * With `onFinish` (the last match of a round) the panel gets a "לתוצאות" button instead of "סגירה";
 * the button is returned so the caller can move focus to it.
 */
export function showExplanation(panel, drug, points, combo, onFinish = null) {
  clear(panel);
  const head = el('div', 'explain-head');
  head.append(el('span', 'explain-points', ltr(`+${points}`) + (combo >= 2 ? ` · רצף ${ltr(`×${comboMultiplier(combo)}`)}` : '')));
  if (!onFinish) {
    const close = el('button', 'link-button', 'סגירה');
    close.type = 'button';
    close.addEventListener('click', () => { panel.hidden = true; });
    head.append(close);
  }
  panel.append(head, drugDetail(drug));
  let next = null;
  if (onFinish) {
    next = el('button', 'primary', 'לתוצאות');
    next.type = 'button';
    next.addEventListener('click', onFinish);
    const actions = el('div', 'actions');
    actions.append(next);
    panel.append(actions);
  }
  panel.hidden = false;
  panel.classList.remove('is-new');
  void panel.offsetWidth; // restart the slide-in
  panel.classList.add('is-new');
  return next;
}
