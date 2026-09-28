# CLAUDE.md

Quiz site for nursing exam prep, several subjects (courses), each with one or more quizzes. Hebrew, full RTL. Hosted on GitHub Pages from `main` / root: https://ariel-j.github.io/nursingTests/

## Constraints

* Vanilla JS ES modules, no build step, no runtime dependencies. Keep it that way.
* Must work as static files on GitHub Pages (relative paths only). `.nojekyll` keeps Pages from running Jekyll.
* No external requests: fonts are self-hosted in `fonts/` (Hebrew + Latin subsets via `unicode-range`).
* Repo is public: never commit course materials, only quiz JSON (the owner decides what quiz content is published). Test fixtures use placeholder text only.
* All user-facing text in Hebrew; use CSS logical properties (inline/block, start/end) for RTL.
* Render quiz content with textContent, never innerHTML.

## Layout

* `js/core.js`: pure logic (queue, scoring, stats, topics, quiz validation). No DOM, no storage; imported by Node tests and the scripts. Randomness is injected as an `rng` argument; state is plain JSON and never mutated.
* `js/ecg.js`: pure SVG path for the ECG progress strip.
* `js/storage.js`: guarded localStorage wrapper (prefix `anatomy-quizzes:v1:`). Keys: `session:<id>` (in-progress state), `results:<id>` (attempts, best score).
* `js/index.js`: home page, quizzes grouped by `subject`.
* `js/quiz.js`: start screen (resume / choose topics) → play → end screen (retry missed).
* `scripts/`: `manifest.mjs`, `validate.mjs`, shared `quizzes.mjs`, dev `serve.mjs`.
* `quizzes/<id>.json`: one quiz per file, with a required `subject`; `quizzes/manifest.json` is generated (sorted by subject, then title, numeric-aware).
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
* `npm run validate`: validates all quizzes and checks the manifest
* `npm run manifest`: regenerate the manifest after adding a quiz
* `npm run serve`: local server on :8000 (fetch() fails over file://)

## Workflow

Quiz content is written outside this repo (from the course materials) and added as JSON. Work here is on the engine and UI: plan first, keep core.js pure and tested, run tests and validate before committing.
