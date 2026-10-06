// respiratory drugs summary (summaries/pharma-respiratory.html): wires the shared widgets (summary-widgets.js) to this page's ids:
// reading progress, search with filter pills, and the self-test that hides every definition and cause → effect
// result until the reader opens it. The article's text works without any of this (and in all.html, which
// drops the [data-interactive] blocks).
import { initReadingProgress, initSearch, initSelfTest, studyFilter } from './summary-widgets.js';

initReadingProgress();
initSearch('pr', studyFilter);
initSelfTest(null, { all: true });
