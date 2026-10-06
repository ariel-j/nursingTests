// Flashcards on the GI, respiratory and immunosuppression summaries: picks the page's deck from
// pharma-cards-data.js and wires the shared flashcard widget (summary-widgets.js) to the deck section.
// The article's text works without this (and in all.html, which drops the [data-interactive] blocks).
import { DECKS } from './pharma-cards-data.js';
import { initFlashcards } from './summary-widgets.js';

const id = document.querySelector('article.summary')?.dataset.system;
if (DECKS[id]) initFlashcards(DECKS[id]);
