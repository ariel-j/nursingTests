# CLAUDE.md

Quiz site for nursing exam prep, several subjects (courses), each with one or more quizzes. Hebrew, full RTL. Hosted on GitHub Pages from `main` / root: https://ariel-j.github.io/nursingTests/

## Constraints

* Vanilla JS ES modules, no build step, no runtime dependencies. Keep it that way.
* Must work as static files on GitHub Pages (relative paths only). `.nojekyll` keeps Pages from running Jekyll.
* No external requests: fonts are self-hosted in `fonts/` (Hebrew + Latin subsets via `unicode-range`).
* Repo is public: never commit course materials, only quiz JSON and the owner's own short summaries (the owner decides what content is published; summaries name no lecturers). Test fixtures use placeholder text only.
* All user-facing text in Hebrew; use CSS logical properties (inline/block, start/end) for RTL.
* Render content with textContent (and the DOM/SVG APIs), never innerHTML.
* Ships an accessibility toolbar and a הצהרת נגישות / מדיניות פרטיות page; keep the site keyboard- and screen-reader-friendly, and update the statement's date when accessibility changes.

## Layout

* `js/core.js`: pure logic (queue, scoring, stats, topics, quiz validation). No DOM, no storage; imported by Node tests and the scripts. Randomness is injected as an `rng` argument; state is plain JSON and never mutated.
* `js/storage.js`: guarded localStorage wrapper (prefix `anatomy-quizzes:v1:`). Keys: `session:<id>` (in-progress state), `results:<id>` (attempts, best score).
* `js/index.js`: home page; renders the manifest tree of subjects → units → quizzes.
* `js/quiz.js`: start screen (resume / choose topics) → play → end screen (retry missed). `?id=<quiz>` plays one quiz; `?subject=<name>` plays mixed practice ("בחירת נושאים למבחן"): every quiz of the subject merged by `buildMixedQuiz` (question ids `<quiz>/<q>`, topics `<unit> · <topic>`), chosen by unit, saved as `session:mix-<hash>`, no best score.
* `js/print.js` + `print.html`: printable exam (topics, count, order; answer key with optional explanations). Uses `buildPrintExam` from core.js and `@media print` / `@page` in style.css; the browser's print dialog makes the PDF.
* `js/load-quiz.js`: loads `?id=<quiz>` or `?subject=<name>` (mixed) for quiz.js and print.js; validates every quiz file.
* `js/a11y.js`: accessibility toolbar (text size, high contrast, underline links, stop motion); sets `data-*` on `<html>`, persists in localStorage. Imported by every page.
* `summaries/`: סיכומים קצרים. `index.html` hub (from `js/summary-list.js`, the single list), one static `<id>.html` per summary with its content in `<article class="summary" data-system="<id>">`, and `all.html`, which fetches every summary into one page for a single PDF (`js/summaries-all.js`, DOMParser + adoptNode). Styles in `css/summary.css` (per-system accent, dark, high contrast, print). PDF = the browser's print dialog, no library.
* `accessibility.html` (הצהרת נגישות) and `privacy.html` (מדיניות פרטיות): static content pages; every page has a footer linking to them.
* `css/style.css`: all styles, following `design/STYLE.md` (tokens, ring, cards, letter badges). `design/reference.html` is the standalone page the design was taken from; reference only, the site doesn't use it.
* `scripts/`: `manifest.mjs`, `validate.mjs`, `import.mjs` (+`import-format.mjs`), shared `quizzes.mjs`, `summaries.mjs` (summary page checks), dev `serve.mjs`.
* `quizzes/subjects.json`: hand-written catalog of subjects and their units (order shown on the home page).
* `quizzes/<id>.json`: one quiz per file; required `subject`, plus `unit` when its subject declares units. Subject/unit must exist in the catalog. `quizzes/manifest.json` is generated (a subjects → units → quizzes tree; titles numeric-aware).
* Authoring format (options as strings + `correctIndex` + `wrongExplanations`, or the variant `stem` + `answer` + option-aligned `notes`) is converted with `npm run import`.
* Quiz format is documented in README.md.

## Quiz rules the engine must keep

* 4 options, one correct; options reshuffled on every display.
* Wrong or skipped questions re-queue 2-5 positions later, never immediately next (only exception: it is the last question left).
* Mastery: correct on first try = mastered. After any miss or skip, needs 2 correct in a row (`MASTERY_STREAK`); not-yet-mastered correct answers re-queue the same way.
* Wrong answer: chosen option red, correct green, explanation plus the note for the chosen option.
* Correct answer auto-advances after ~1.1s, except when the toolbar's stop-motion is on or `prefers-reduced-motion: reduce`; then it waits for הבאה. Wrong/skipped always wait.
* Progress: a ring with mastered/total, plus queue size and first-try correct. End screen: first-try score, retried questions, weak topics.
* Session modes: `full` (whole quiz), `topics` (chosen topics, or chosen units in mixed practice), `retry` (questions that came back last run). Only `full` runs of a single quiz update the best score.
* Printable exam: questions sampled per topic in proportion (`allocateByTopic`), options shuffled once and lettered א–ד; default 100 questions.
* In-progress sessions persist and resume after refresh; a saved session that no longer matches the quiz is discarded.

## Commands

* `npm test`: unit tests for core.js and scripts (node:test)
* `npm run validate`: validates all quizzes and summaries, and checks the manifest
* `npm run manifest`: regenerate the manifest after adding or editing a quiz or the catalog
* `npm run import -- <src.json> [--id …] [--subject …] [--unit …] [--title …]`: convert an authoring-format quiz into `quizzes/<id>.json`
* `npm run serve`: local server on :8000 (fetch() fails over file://)

## Workflow

Quiz content is written outside this repo (from the course materials) and added as JSON. Work here is on the engine and UI: plan first, keep core.js pure and tested, run tests and validate before committing.
