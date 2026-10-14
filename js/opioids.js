// Opioids summary (summaries/opioids.html): wires the shared widgets (summary-widgets.js) to this page's ids
// and data: search filters, receptor explorer, self-test mode over the cause → effect rows, the "chapter
// done" tracker and flashcards. The article's text works without any of this (and in all.html, which drops
// the [data-interactive] blocks), so each widget's facts also appear in the static sections.
// Text data is in opioids-data.js; text goes in with textContent and DOM nodes, never innerHTML.
import { RECEPTORS, FLASHCARDS } from './opioids-data.js';
import {
  initReadingProgress, initSearch, initFlashcards, initSelfTest, initTracker, initReceptors,
} from './summary-widgets.js';

const DONE_KEY = 'summary:opioids:done';

// ---------- search filters ----------

const inCategory = (card, cat) => card.closest(`[data-category="${cat}"]`) !== null;
function matchesFilter(filter, card, text) {
  switch (filter) {
    case 'exam': return card.classList.contains('is-exam') || text.includes('נשאל');
    case 'drugs': return inCategory(card, 'drugs') || text.includes('משפחה');
    case 'traps': return text.includes('מלכוד') || text.includes('אסור') || text.includes('התוויות נגד') || text.includes('סכנה');
    case 'emergency': return inCategory(card, 'emergency') || text.includes('naloxone');
    case 'rel': return inCategory(card, 'rel') || text.includes('←');
    default: return true;
  }
}

initReadingProgress();
initSearch('op', matchesFilter);
initReceptors(RECEPTORS);
initSelfTest('op-chains');
initTracker('op', DONE_KEY);
initFlashcards(FLASHCARDS);
