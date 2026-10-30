# Nursing exam practice quizzes

A Hebrew (RTL) quiz site for nursing exam prep, grouped by subject, served as static files from GitHub Pages:
https://ariel-j.github.io/nursingTests/

No build step and no runtime dependencies. Node is only needed for the tests and scripts.

## How a quiz plays

- The home page lists the subjects (מקצועות). A subject's page (`./?subject=<id>`) has its mixed practice,
  printable exam, summaries and videos, then its quizzes grouped by unit. A side menu (the "תפריט" button on
  every page) lists every subject with its units and those same parts.
- Each quiz opens on a start screen where you resume an unfinished session, or start a new one: pick the
  style, the topics (units, in mixed practice) and how many questions.
- Two styles. **תרגול** (practice) is everything below. **מבחן** (exam) shows each question once with no
  feedback: pick an option and confirm it (`Enter`); a skip counts as wrong. The end screen gives the score
  and reviews each mistake with your answer, its note, the right answer and the explanation.
- Fewer questions than the chosen topics hold are sampled in proportion to topic size. Within a topic the
  questions served least often come first, then those served longest ago, so consecutive sessions repeat
  as little as possible (`served:<quizId>` in `localStorage`, per quiz file, shared with mixed practice).
- A unit with two or more quizzes gets a **מבחן סיכום אישי** card: the subject's mixed practice opened
  with only that unit chosen (`quiz.html?subject=<id>&group=<unit>`), e.g. for the unit מבחנים מסכמים.
- Questions are shown in random order. The 4 options are reshuffled every time a question is shown.
- A **wrong** or **skipped** question goes back into the queue and comes back 2–5 questions later,
  never immediately next. The one exception is when it is the only question left.
- A question answered correctly on the **first try** is mastered.
  A question that was missed or skipped needs **2 correct answers in a row** to be mastered.
  Each of those correct answers requeues it the same way.
- After a wrong answer you see your choice in red, the correct answer in green, the explanation,
  and the note written for the option you chose.
- Progress shows mastered/total and the queue size. The end screen shows the first-try score,
  the questions that came back, and weak topics.
- The end screen can start a session with only the questions that came back.
- Any question can be **starred** (☆ next to the topic, `F`, or on the end screen's list).
  A quiz's start screen can practise or browse its starred questions, and the home page links to
  `quiz.html?starred`, which gathers starred questions from every quiz: tick which quizzes and
  which questions to practise. Stars only change when you change them.
- An unfinished session is saved in `localStorage` and resumes after a refresh.
  The quiz list shows which quizzes are in progress and your best first-try score
  (best score counts only runs over the whole quiz).
- **Statistics:** every finished run, in any mode, is saved as an attempt in `history:<quizId>`
  (misses per question, at most the last 30 attempts). The start screen shows each topic as
  weak / fair / solid with a trend, flags topics that *recovered*, and offers one-click practice of the
  weak topics or the questions that keep coming back. Each question counts once, weighted toward its
  recent answers, so retrying a few hard questions doesn't drag a topic down. A topic needs about 5 answered
  questions before it gets a label. Statistics can be exported to a JSON file and imported (merged, never
  overwriting) from the home page, which is how they move between devices.
- **Printable exam** (`print.html?id=…` for one quiz, linked from the start screen, or
  `print.html?subject=<id>` for the whole subject): pick topics, a question count
  (default 100, sampled in proportion to each topic's size) and an order (mixed, or grouped by topic).
  Options are shuffled once and lettered א–ד. The answer key, optionally with explanations, starts on
  a new page. Printing uses the browser's print dialog, so "Save as PDF" gives a file.
- **Starred questions:** star any question (☆ next to the topic, `F`, or on the end screen's list).
  A quiz's start screen can practise or browse its starred questions, and `quiz.html?starred`
  (linked from the home page and the menu) gathers starred questions from every quiz: tick which
  quizzes and which questions to practise. Stars change only when you change them. They are part of
  the statistics export file, and importing adds them (a star removed on one device is not removed
  on the other).
- Keyboard: `1`–`4` choose, `S` skips, `F` stars, `Enter` continues. These use key codes, so they also work with a Hebrew layout.

## Adding a quiz

Writing guidelines, plus a brief you can paste into the session that writes the questions, are in
[docs/quiz-authoring.md](docs/quiz-authoring.md). A whole new subject (catalog entry, quizzes,
summaries, and what it gets automatically) is covered step by step in [docs/new-subject.md](docs/new-subject.md).

1. Make sure the quiz's `subject` (and `unit`, if that subject has units) exist in
   `quizzes/subjects.json`. Add them there first if needed.
2. Save the quiz as `quizzes/<id>.json`. The file name must match `id`. If you were given the quiz in
   the authoring format (options as plain strings + `correctIndex` + `wrongExplanations`, or its variant
   `stem` + `answer` + `notes` with one note per option and `null` for the correct one, or no `notes` at all), convert it:
   `npm run import -- <src.json> --id <id> --subject "<subject>" --unit "<unit>" --title "<title>"`.
3. `npm run manifest` to regenerate `quizzes/manifest.json`.
4. `npm run validate` to check everything.
5. Commit the quiz, the catalog and the manifest together.

`quizzes/subjects.json` is the hand-written catalog: an ordered list of subjects, each with an `id`
(lowercase, hyphens; used in links like `?subject=pharmacology` and by summaries), a Hebrew `name`
(what quizzes put in `subject`) and an optional ordered list of `units`. It sets the subjects and their
order on the home page and in the menu; empty units and subjects show as "בקרוב".

### Quiz format

```json
{
  "id": "cardio-basics",
  "subject": "אנטומיה ופיזיולוגיה",
  "unit": "הלב",
  "title": "מבחן 1",
  "description": "optional, shown on the quiz list",
  "questions": [
    {
      "id": "q1",
      "topic": "הולכה חשמלית",
      "question": "היכן נוצר הדחף החשמלי בלב תקין?",
      "options": [
        { "text": "בקשר הסינוטריאלי (SA)", "note": "optional note for this option" },
        { "text": "בקשר האטריו־ונטריקולרי (AV)", "note": "why this is wrong" },
        { "text": "בצרור ע״ש היס" },
        { "text": "בסיבי פורקינייה" }
      ],
      "correct": 0,
      "explanation": "shown after every answer"
    }
  ]
}
```

| Field | Rules |
| --- | --- |
| `id` | lowercase letters, digits and single hyphens (`cardio-basics`) |
| `subject` | required. Must exist in `quizzes/subjects.json`; sets the home-page section |
| `unit` | required when the subject declares units, and must be one of them; sets the sub-section |
| `title` | required. Sorted with numbers in order, so "מבחן 2" comes before "מבחן 10" |
| `description` | optional string |
| `questions[].id` | required, unique within the quiz. Keep it stable: saved progress is keyed by it |
| `questions[].topic` | required. Used to group weak topics on the end screen |
| `questions[].question` | required |
| `questions[].options` | exactly 4, texts must be distinct |
| `options[].text` | required |
| `options[].note` | optional. Shown when that option is chosen |
| `questions[].correct` | index 0–3 into `options` **as written**. The engine shuffles, so authors don't have to |
| `questions[].explanation` | required |

Unknown fields are rejected, which catches typos like `explenation`. Options that refer to other options
by position ("א+ב נכונות", "all of the above") are rejected too, because the options are shuffled.
All text is rendered as plain text (no HTML). Use Unicode for symbols (O₂, Na⁺, →).
A `\n` in a string becomes a line break.

If you add, remove or rename question IDs in a quiz, saved progress for that quiz no longer matches.
It is dropped, and the quiz starts fresh.

## Short summaries (סיכומים קצרים)

`summaries/` is a hub with one condensed summary per unit or topic, grouped by subject;
`summaries/?subject=<id>` shows one subject's (linked from its page). Each summary is a static page,
`summaries/<id>.html`, with a print button; the browser's print dialog saves it as a PDF (light colors,
A4, rows kept whole across pages). `summaries/all.html` loads every summary into one page, so they print
as a single PDF; `all.html?subject=<id>` prints one subject's.

To add a summary, see [docs/summary-authoring.md](docs/summary-authoring.md): a brief for writing one in the
site's style, then these steps:

1. Save it as `summaries/<id>.html`, copying the structure of an existing one: its content goes in
   `<article class="summary" data-system="<id>">` and uses the same classes (`rel`, `def`, `call`, `flags`, `exam`).
2. Add `{ subject, id, title, blurb }` to `js/summary-list.js` (`subject` is the catalog id; the order sets
   the order on the hub and in the combined PDF).
3. Give it accent colors in `css/summary.css` (a `[data-system="<id>"]` rule with light and dark values).
4. `npm run validate` checks it: listed, a known subject, self-hosted only, no inline styles or handlers,
   toolbar, menu and footer present.

## Videos and artifacts (סרטוני הסבר קצרים)

`media.html?subject=<id>` shows a subject's short explainer videos and the owner's own artifacts (images,
PDFs, HTML pages), with a button per sub-subject that opens its own page (`&topic=<name>`). The
files live in `media/<subject-id>/`, optionally one folder per sub-subject; names give the titles and order (`01 - …`). GitHub Pages can't list a folder,
so `media/manifest.json` lists them. It is not committed: the deploy workflow builds it every time it
publishes the site, and `npm run manifest` builds it locally, so uploading through the GitHub web UI is enough. Captions:
a `.vtt` next to the video, same name. The deploy workflow makes them for any video that has none
(below). `npm run validate` rejects course files (`.pptx`, `.docx`), unplayable video (`.mov`),
videos without captions, unsupported types and files over 50MB, and warns about HTML pages that load
from a CDN.

Automatic captions: before building the media list, the deploy workflow transcribes each video
without a `.vtt` with ivrit.ai's Hebrew Whisper model (`scripts/transcribe.py`, faster-whisper on the
CPU, about half the video's length), turns the words into cues of up to two 42-character lines
(`scripts/captions.mjs`, tested), commits the `.vtt` files to `main` and opens an issue listing the
words that appear in no quiz or summary, where most mishearings are. The model's own confidence is no
guide to its mistakes. A `terms.md` in `media/<subject-id>/` (and in a topic folder) primes the model
with that subject's terms. To run it locally: `pip install -r scripts/requirements-captions.txt`,
then `python scripts/transcribe.py <dir> <video under media/>...` and
`node scripts/captions.mjs build <dir>`. How to upload: [media/README.md](media/README.md).

A summary can also carry interactive widgets (search, simulators, flashcards), as `pharmacodynamics.html` does:
mark each widget `data-interactive` (and `no-print`), keep its script and styles in their own files
(`js/pharmacodynamics.js`, `css/pharmacodynamics.css`, pure maths in `js/pharma-math.js`; the search, flashcards, panels and progress bar come from `js/summary-widgets.js` and `css/summary-widgets.css`), and keep the article's
text complete without them. `all.html` drops every `[data-interactive]` block, so only the text is printed.

A summary can also be a **study hub**: the same static page with `<section data-tab="…">` panels, flip cards
(`.fc` with `.fc-front` / `.fc-back`), expandable rows (`.lvl`), a `.scales` switch and a mini quiz (`.mq-set` with
`.mq` questions, the right option marked `<li class="ok">`). `js/summary-interactive.js` turns those into tabs,
flip cards, a toggle and a quiz with XP; without JS, in print and in `all.html` every panel is simply shown and
the quiz prints as questions with the right answers marked. A hub uses either `data-tab` sections (tabs, see
`summaries/hygiene.html`) or `data-nav` sections with unique ids (one scrolling page with a sticky section bar,
see `summaries/sleep.html`).

## Drug memory game (`memory.html`)

A game for learning what 70 key drugs are used for. The home page links to it.

- **Pairs:** flip a drug-name card and a use card (its indication) (6, 8 or 10 pairs per round, drawn from the pool
  with a bias towards drugs you know least). A match opens the explanation, side effects included.
  Matching builds a combo (up to x3); a wrong flip costs points only when the partner of a flipped card was
  already seen, so guessing at unseen cards is free. Bonuses for speed and for a round with no such misses.
- **Speed:** 10 questions, a use (or a drug name) and four options, against a clock (12-15 s).
  "Relaxed mode" turns the clock off.
- **Pool:** all drugs, only your weak ones, or one topic. Weak drugs come back more often.
- **Mastery:** each drug has a level, not seen / seen / familiar / mine. Pairs lifts a drug up to "familiar";
  only a correct answer in speed mode makes it "mine". A miss drops it one level (never below "seen").
- **Meta:** XP and player levels, a daily streak, a daily goal, 3-star rounds, a collection of all 70 drugs
  (unlocked as they are met) and achievements. Sound and vibration are off until switched on.
- Progress lives in `localStorage` (`memory:progress`). A round in progress is not saved.

Cards come from `games/drugs.json`, generated from the authoring file with
`npm run import-drugs -- <source.json>`. Only the fields the game shows are kept (name, family, topic,
indication, side effects, explanation); sources, lecturers and exam statistics are dropped.
`npm run validate` rejects any other field.

## Development

```sh
npm test          # unit tests for js/core.js and the scripts (node:test)
npm run validate  # validate all quizzes, summaries and media files, and check the quiz manifest is current
npm run manifest  # regenerate quizzes/manifest.json and media/manifest.json
npm run import-drugs -- <source.json>  # rebuild games/drugs.json for the memory game
npm run serve     # http://localhost:8000 (fetch() does not work over file://)
```

## Deploying

`.github/workflows/pages.yml` publishes the site on every push to `main`, after building
`media/manifest.json`. It needs **Settings → Pages → Build and deployment → Source: GitHub Actions**.
A run takes about a minute; GitHub Actions are free for public repositories.

| Path | Role |
| --- | --- |
| `js/core.js` | pure logic: queue, scoring, stats, validation. No DOM, no storage |
| `js/storage.js` | guarded `localStorage` wrapper (prefix `anatomy-quizzes:v1:`) |
| `js/index.js`, `js/quiz.js`, `js/print.js` | page UI (`js/load-quiz.js`: quiz loading shared by quiz.js and print.js). `quiz.html?id=<quiz>` plays one quiz; `quiz.html?subject=<id>` is mixed practice across the subject's units (the subject page's "בחירת נושאים למבחן" card) |
| `js/catalog.js` | the manifest as the pages see it: one cached fetch, plus pure helpers (find a subject, its quizzes, counts, links) |
| `js/nav.js` | the top bar and side menu on every page (a modal `<dialog>`), built from the manifest and the summaries list |
| `js/stats-transfer.js` | export / import of statistics (home page) |
| `memory.html`, `css/memory.css`, `games/drugs.json` | the drug memory game and its cards |
| `js/memory-core.js` | pure game logic: dealing, matching, scoring, mastery, XP, streaks, achievements |
| `js/memory.js` | hub, collection, achievements and result screens; `memory-pairs.js` and `memory-speed.js` are the two modes; `memory-fx.js` sound, vibration, confetti; `memory-dom.js`, `memory-detail.js` helpers |
| `summaries/`, `css/summary.css` | short summaries, the hub and the combined print page |
| `js/summary-interactive.js` | the study-hub layer (tabs, flip cards, scale switch, mini quiz) |
| `js/summary-list.js` | the list of summaries (no DOM); `js/summaries.js`, `js/summary.js`, `js/summaries-all.js` drive the pages |
| `scripts/` | manifest, validate (quizzes, summaries, and that every page has the toolbar, menu and footer), and a tiny static dev server |
| `css/style.css` | the whole site's styles; follows `design/STYLE.md` |
| `design/` | design spec (`STYLE.md`) and the reference page it was taken from. Not used by the site |
| `fonts/` | self-hosted Rubik and Frank Ruhl Libre (SIL OFL, licenses included) |
| `test/` | unit tests. `test/fixtures/` holds placeholder content only |
