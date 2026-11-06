# CLAUDE.md

Quiz site for nursing exam prep, several subjects (courses), each with one or more quizzes. Hebrew, full RTL. Hosted on GitHub Pages from `main` / root: https://ariel-j.github.io/nursingTests/

## Constraints

* Vanilla JS ES modules, no build step, no runtime dependencies. Keep it that way.
* Must work as static files on GitHub Pages (relative paths only). `.nojekyll` keeps Pages from running Jekyll.
* No external requests: fonts are self-hosted in `fonts/` (Hebrew + Latin subsets via `unicode-range`). The only exception is the owner-only admin panel, which calls `api.github.com` after an explicit action (disclosed in privacy.html).
* Repo is public: never commit course materials, only quiz JSON and the owner's own short summaries (the owner decides what content is published; summaries name no lecturers). Test fixtures use placeholder text only.
* All user-facing text in Hebrew; use CSS logical properties (inline/block, start/end) for RTL.
* Render content with textContent (and the DOM/SVG APIs), never innerHTML.
* Ships an accessibility toolbar and a הצהרת נגישות / מדיניות פרטיות page; keep the site keyboard- and screen-reader-friendly, and update the statement's date when accessibility changes.

## Layout

* `js/core.js`: pure logic (queue, scoring, stats, topics, quiz validation). No DOM, no storage; imported by Node tests and the scripts. Randomness is injected as an `rng` argument; state is plain JSON and never mutated.
* `js/ecg.js`: pure SVG path for the ECG progress strip.
* `js/storage.js`: guarded localStorage wrapper (prefix `anatomy-quizzes:v1:`). Keys: `session:<id>` (in-progress state), `results:<id>` (attempts, best score).
* `js/index.js`: home page; renders the manifest tree of subjects → units → quizzes.
* `js/quiz.js`: start screen (resume / choose topics) → play → end screen (retry missed).
* `js/cards-core.js` + `js/cards.js` + `cards.html`: flashcard decks (`flashcards/<id>.json`: front/back/topic text cards). Pure logic reuses the quiz engine (`createSession`, `isSessionCompatible`, `advance`, `requeue` from core.js), so deck sessions follow the same rules: known first try = mastered, after a miss needs `MASTERY_STREAK` in a row, re-queue 2-5 later, modes full/topics/retry, only `full` updates the best score. Card text is rendered with textContent. Storage keys `cards-session:<id>`, `cards-results:<id>`.
* `js/a11y.js`: accessibility toolbar (text size, high contrast, underline links, stop motion); sets `data-*` on `<html>`, persists in localStorage. Imported by every page.
* `summaries/`: סיכומים קצרים. `index.html` hub (from `summaries/list.json`, the single list, loaded by `js/summary-list.js`), one static `<id>.html` per summary with its content in `<article class="summary" data-system="<id>">`, and `all.html`, which fetches every summary into one page for a single PDF (`js/summaries-all.js`, DOMParser + adoptNode). Styles in `css/summary.css` (per-system accent, dark, high contrast, print). PDF = the browser's print dialog, no library.
* `admin/index.html` + `js/admin/`: owner-only panel committing via the GitHub Git Data API. `vault.js` (token encrypted with a password; not access control, the token is the gate), `github.js` (the only network module; injected fetch), `uploads.js` (id/path allowlist, reserved ids, file checks), `actions.js` (pure: every add/edit/delete/reorder of quizzes, decks, summaries and structure -> exact files to commit; EVERY manifest goes through `manifestFile` so no action can drop the decks; same validators as `npm run validate`; `planStructure` cascades renames into quizzes, quiz ids are immutable), `app.js` (UI, textContent only, strict CSP meta, frame-bust, idle lock). `js/admin-link.js` shows the side tab only where the admin was unlocked. Pure shared logic lives in `js/catalog.js`, `js/import-format.js`, `js/summary-check.js` (the scripts re-export them).
* `templates/`: ready-to-upload examples (placeholder content); a test runs them through the validators so they cannot go stale.
* `.github/workflows/check.yml`: `npm test` + `npm run validate` on every push.
* `accessibility.html` (הצהרת נגישות) and `privacy.html` (מדיניות פרטיות): static content pages; every page has a footer linking to them.
* `scripts/`: `manifest.mjs`, `validate.mjs`, `import.mjs` (+`import-format.mjs`), shared `quizzes.mjs`, `summaries.mjs` (summary page checks), dev `serve.mjs`.
* `quizzes/subjects.json`: hand-written catalog of subjects and their units (order shown on the home page).
* `quizzes/<id>.json`: one quiz per file; required `subject`, plus `unit` when its subject declares units. Subject/unit must exist in the catalog. `quizzes/manifest.json` is generated (a subjects → units → quizzes and flashcards tree; titles numeric-aware). Decks live in `flashcards/<id>.json` and are placed with the same subject/unit rules as quizzes; a missing `flashcards/` folder just means no decks.
* Authoring format (options as strings + `correctIndex` + `wrongExplanations`) is converted with `npm run import`.
* Quiz format is documented in README.md.

## Quiz rules the engine must keep

* 4 options, one correct; options reshuffled on every display.
* Wrong or skipped questions re-queue 2-5 positions later, never immediately next (only exception: it is the last question left).
* Mastery: correct on first try = mastered. After any miss or skip, needs 2 correct in a row (`MASTERY_STREAK`); not-yet-mastered correct answers re-queue the same way.
* Wrong answer: chosen option red, correct green, explanation plus the note for the chosen option.
* Progress: mastered/total and queue size. End screen: first-try score, retried questions, weak topics.
* Session modes: `full` (whole quiz), `topics` (chosen topics), `retry` (questions that came back last run). Only `full` runs update the best score.
* In-progress sessions persist and resume after refresh; a saved session that no longer matches the quiz is discarded.

## Commands

* `npm test`: unit tests for core.js and scripts (node:test)
* `npm run validate`: validates all quizzes and summaries, and checks the manifest
* `npm run manifest`: regenerate the manifest after adding or editing a quiz or the catalog
* `npm run import -- <src.json> [--id …] [--subject …] [--unit …] [--title …]`: convert an authoring-format quiz into `quizzes/<id>.json`
* `npm run serve`: local server on :8000 (fetch() fails over file://)

## Admin panel security rules

* Any new plan that writes `quizzes/manifest.json` must build it with `manifestFile(quizzes, decks, catalog)` and be added to the "every plan keeps the decks" test.
* Never add a path to `WRITABLE` in `uploads.js` without a test; ids are validated and reserved names (`index`, `all`, `list`, `manifest`, `subjects`) are refused.
* Summary HTML stays on the strict allowlist in `summary-check.js` (stored XSS surface); add a hostile sample to `test/admin.test.mjs` for every new rule.
* The token is never logged, put in a URL, stored in clear, or sent anywhere but `api.github.com`. Keep the CSP meta in `admin/index.html` in sync with what the page loads.
* Logical CSS properties resolve against the element's own `writing-mode`: never put `writing-mode` on a positioned element (use an inner span).

## Workflow

Quiz content is written outside this repo (from the course materials) and added as JSON. Work here is on the engine and UI: plan first, keep core.js pure and tested, run tests and validate before committing.
