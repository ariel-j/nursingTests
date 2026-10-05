# CLAUDE.md

Quiz site for nursing exam prep, several subjects (courses), each with one or more quizzes. Hebrew, full RTL. Hosted on GitHub Pages: https://ariel-j.github.io/nursingTests/, published by `.github/workflows/pages.yml` on every push to `main` (Pages source: GitHub Actions), which also builds `media/manifest.json`.

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
* `js/catalog.js`: the manifest for the pages: `loadManifest()` (one cached fetch per page) and pure helpers (`findSubject` by id or, for old links, name; `subjectQuizzes`, `subjectStats`, `subjectPaths`). Tested in Node.
* `js/index.js`: home page. No `?subject=` → subject cards; `?subject=<id>` → that subject: mixed practice, printable exam, summaries and videos cards, then quizzes by unit (sections `#unit-N`).
* `js/nav.js`: top bar + side menu on every page: a modal `<dialog>` drawer listing each subject with its units, mixed practice, print and summaries; the current subject starts open. Links resolve from `import.meta.url`, so subfolder pages work. Deliberately a drawer at every width, not a persistent desktop sidebar: the quiz page stays a focus screen, and the subject page already lists every unit.
* `js/quiz.js`: start screen (resume / choose topics) → play → end screen (retry missed). `?id=<quiz>` plays one quiz; `?subject=<id>` (or the name, from older links) plays mixed practice ("בחירת נושאים למבחן"): every quiz of the subject merged by `buildMixedQuiz` (question ids `<quiz>/<q>`, topics `<unit> · <topic>`), chosen by unit, saved as `session:mix-<hash of the subject name>`, no best score.
* `js/print.js` + `print.html`: printable exam (topics, count, order; answer key with optional explanations). Uses `buildPrintExam` from core.js and `@media print` / `@page` in style.css; the browser's print dialog makes the PDF.
* `js/load-quiz.js`: loads `?id=<quiz>` or `?subject=<id>` (mixed) for quiz.js and print.js; validates every quiz file. `subjectHomeHref` gives the "כל הבחנים" links their subject page.
* `media/` + `media.html` + `js/media.js`: סרטוני הסבר קצרים. The owner uploads videos and own artifacts (mp4/webm, images, pdf, html; `.vtt` captions beside a video) to `media/<subject-id>/[<sub-subject>/]`; names give titles and order (`01 - …` prefix dropped). `scripts/media.mjs` (pure `buildMedia`, tested) scans it into `media/manifest.json` (Pages can't list folders). That file is gitignored: the deploy workflow builds it (`scripts/media-manifest.mjs`) and `npm run manifest` builds it locally. Validation rejects course files (pptx/docx), mov, unsupported types and >50MB; warns on missing captions and CDN-loading HTML. `catalog.js` has `loadMedia()` (never rejects) and `mediaCount`; the subject card, tools card and menu entry appear only when a subject has media. Upload guide: `media/README.md`.
* `js/a11y.js`: accessibility toolbar (text size, high contrast, underline links, stop motion); sets `data-*` on `<html>`, persists in localStorage. Imported by every page.
* `summaries/`: סיכומים קצרים. `index.html` hub (from `js/summary-list.js`, the single list; each entry has its catalog `subject` id; `?subject=<id>` filters, otherwise grouped by subject), one static `<id>.html` per summary with its content in `<article class="summary" data-system="<id>">`, and `all.html` (`?subject=<id>` to keep one subject's), which fetches the summaries into one page for a single PDF (`js/summaries-all.js`, DOMParser + adoptNode). Styles in `css/summary.css` (per-system accent, dark, high contrast, print). PDF = the browser's print dialog, no library. A summary may add interactive widgets in `[data-interactive]` blocks (`summaries/pharmacodynamics.html` + `js/pharmacodynamics.js`, `css/pharmacodynamics.css`; pure maths in `js/pharma-math.js`, text data in `js/pharma-data.js`, both unit-tested); `all.html` strips those blocks, so the article text must stand on its own. Rules: `docs/interactive-summaries.md`.
* `accessibility.html` (הצהרת נגישות) and `privacy.html` (מדיניות פרטיות): static content pages; every page has a footer linking to them. Every page loads `js/nav.js` and `js/a11y.js`; `npm run validate` checks this.
* `css/style.css`: all styles, following `design/STYLE.md` (tokens, ring, cards, letter badges). `design/reference.html` is the standalone page the design was taken from; reference only, the site doesn't use it.
* `scripts/`: `manifest.mjs`, `validate.mjs`, `import.mjs` (+`import-format.mjs`), shared `quizzes.mjs`, `summaries.mjs` (summary page checks), dev `serve.mjs`.
* `quizzes/subjects.json`: hand-written catalog of subjects (`id` slug for URLs and summaries, Hebrew `name` that quizzes use as `subject`, optional `units`), in home-page order.
* `docs/`: `new-subject.md` (what a subject gets, steps to add one), `quiz-authoring.md` (pasteable quiz brief + per-subject notes), `summary-authoring.md` (pasteable summary brief with the summary style). Keep them in step with the validators.
* `quizzes/<id>.json`: one quiz per file; required `subject`, plus `unit` when its subject declares units. Subject/unit must exist in the catalog. `quizzes/manifest.json` is generated (a subjects → units → quizzes tree; titles numeric-aware).
* Authoring format (options as strings + `correctIndex` + `wrongExplanations`, or the variant `stem` + `answer` + option-aligned `notes`) is converted with `npm run import`.
* Quiz format is documented in README.md.

## Subjects

* Every subject gets the same features from data alone: subject page with quizzes by unit (progress, best score), mixed practice (2+ units with quizzes), printable exam, summaries hub + combined PDF, videos page (`media/<id>/`), and a menu entry. Never special-case a subject in code.

## Quiz rules the engine must keep

* 4 options, one correct; options reshuffled on every display.
* Wrong or skipped questions re-queue 2-5 positions later, never immediately next (only exception: it is the last question left).
* Mastery: correct on first try = mastered. After any miss or skip, needs 2 correct in a row (`MASTERY_STREAK`); not-yet-mastered correct answers re-queue the same way.
* Wrong answer: chosen option red, correct green, explanation plus the note for the chosen option.
* Correct answer auto-advances after a pause scaled to the explanation length (2.5-8s) with a thin countdown bar; touching the feedback panel cancels it. A "מעבר אוטומטי" checkbox (shortcut `A`) on every question switches it on/off and is remembered (`pref:auto-advance`); until the learner chooses, it is off when the toolbar's stop-motion is on or `prefers-reduced-motion: reduce`. Wrong/skipped always wait for הבאה.
* Progress: a ring with mastered/total, plus queue size and first-try correct. End screen: first-try score, retried questions, weak topics.
* Session modes: `full` (whole quiz), `topics` (chosen topics, or chosen units in mixed practice), `retry` (questions that came back last run). Only `full` runs of a single quiz update the best score.
* Printable exam: questions sampled per topic in proportion (`allocateByTopic`), options shuffled once and lettered א–ד; default 100 questions.
* In-progress sessions persist and resume after refresh; a saved session that no longer matches the quiz is discarded.

## Commands

* `npm test`: unit tests for core.js and scripts (node:test)
* `npm run validate`: validates all quizzes, summaries and media files, and checks the quiz manifest
* `npm run manifest`: regenerate the quiz and media manifests after adding or editing a quiz, the catalog or media files
* `npm run import -- <src.json> [--id …] [--subject …] [--unit …] [--title …]`: convert an authoring-format quiz into `quizzes/<id>.json`
* `npm run serve`: local server on :8000 (fetch() fails over file://)

## Workflow

Quiz content is written outside this repo (from the course materials) and added as JSON. Work here is on the engine and UI: plan first, keep core.js pure and tested, run tests and validate before committing.
