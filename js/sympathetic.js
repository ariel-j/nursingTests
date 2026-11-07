// Sympathetic summary (summaries/sympathetic.html): wires the shared widgets (summary-widgets.js) to this
// page's ids and data: search filters, receptor explorer, self-test mode over the cause → effect rows, the
// "chapter done" tracker and flashcards. The article's text works without any of this (and in all.html,
// which drops the [data-interactive] blocks), so each widget's facts also appear in the static sections.
// Text data is in sympathetic-data.js; text goes in with textContent and DOM nodes, never innerHTML.
import { RECEPTORS, FLASHCARDS } from './sympathetic-data.js';
import {
  initReadingProgress, initSearch, initFlashcards, initSelfTest, initTracker, initReceptors,
} from './summary-widgets.js';

const DONE_KEY = 'summary:sympathetic:done';

// ---------- search filters ----------

const inCategory = (card, cat) => card.closest(`[data-category="${cat}"]`) !== null;
function matchesFilter(filter, card, text) {
  switch (filter) {
    case 'exam': return card.classList.contains('is-exam') || text.includes('נשאל');
    case 'agonists': return inCategory(card, 'agonists') || text.includes('אגוניסט');
    case 'antagonists': return inCategory(card, 'antagonists') || text.includes('חוסם');
    case 'traps': return text.includes('מלכוד') || text.includes('ת"ל') || text.includes('אסור') || text.includes('התוויית נגד') || text.includes('סכנה');
    case 'rel': return inCategory(card, 'rel') || text.includes('←');
    default: return true;
  }
}

initReadingProgress();
initSearch('sy', matchesFilter);
initReceptors(RECEPTORS);
initSelfTest('sy-chains');
initTracker('sy', DONE_KEY);
initFlashcards(FLASHCARDS);
