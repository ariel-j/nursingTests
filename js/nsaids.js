// NSAIDs summary (summaries/nsaids.html): wires the shared widgets (summary-widgets.js) to this page's ids
// and data: search filters, the pathway explorer, self-test mode over the cause → effect rows, the "chapter
// done" tracker and flashcards. The article's text works without any of this (and in all.html, which drops
// the [data-interactive] blocks), so each widget's facts also appear in the static chapters.
// Text data is in nsaids-data.js; text goes in with textContent and DOM nodes, never innerHTML.
import { EXPLORER, FLASHCARDS } from './nsaids-data.js';
import {
  initReadingProgress, initSearch, initFlashcards, initSelfTest, initTracker, initExplorer,
} from './summary-widgets.js';

const DONE_KEY = 'summary:nsaids:done';

// ---------- search filters ----------

const inCategory = (card, cat) => card.closest(`[data-category="${cat}"]`) !== null;
function matchesFilter(filter, card, text) {
  switch (filter) {
    case 'exam': return card.classList.contains('is-exam') || text.includes('נשאל');
    case 'drugs': return inCategory(card, 'drugs');
    case 'traps': return inCategory(card, 'traps') || text.includes('מלכוד') || text.includes('אסור') || text.includes('התוויית נגד');
    case 'emergency': return inCategory(card, 'emergency') || text.includes('סם-נגד') || text.includes('סם‑נגד');
    case 'rel': return inCategory(card, 'rel') || text.includes('←');
    default: return true;
  }
}

initReadingProgress();
initSearch('ns', matchesFilter);
initExplorer(EXPLORER);
initSelfTest('ns-chains');
initTracker('ns', DONE_KEY);
initFlashcards(FLASHCARDS);
