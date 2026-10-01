# Nursing exam practice quizzes

A Hebrew (RTL) quiz site for nursing exam prep, grouped by subject, served as static files from GitHub Pages:
https://ariel-j.github.io/nursingTests/

No build step and no runtime dependencies. Node is only needed for the tests and scripts.

## How a quiz plays

- The home page lists quizzes grouped by subject. Each quiz opens on a start screen where you resume
  an unfinished session, or start a new one over all topics or only the ones you tick.
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
- An unfinished session is saved in `localStorage` and resumes after a refresh.
  The quiz list shows which quizzes are in progress and your best first-try score
  (best score counts only runs over the whole quiz).
- **Printable exam** (`print.html?id=…`, linked from the start screen): pick topics, a question count
  (default 100, sampled in proportion to each topic's size) and an order (mixed, or grouped by topic).
  Options are shuffled once and lettered א–ד. The answer key, optionally with explanations, starts on
  a new page. Printing uses the browser's print dialog, so "Save as PDF" gives a file.
- Keyboard: `1`–`4` choose, `S` skips, `Enter` continues. These use key codes, so they also work with a Hebrew layout.

## Adding a quiz

Writing guidelines, plus a brief you can paste into the session that writes the questions, are in
[docs/quiz-authoring.md](docs/quiz-authoring.md).

1. Make sure the quiz's `subject` (and `unit`, if that subject has units) exist in
   `quizzes/subjects.json`. Add them there first if needed.
2. Save the quiz as `quizzes/<id>.json`. The file name must match `id`. If you were given the quiz in
   the authoring format (options as plain strings + `correctIndex` + `wrongExplanations`, or its variant
   `stem` + `answer` + `notes` with one note per option and `null` for the correct one, or no `notes` at all), convert it:
   `npm run import -- <src.json> --id <id> --subject "<subject>" --unit "<unit>" --title "<title>"`.
3. `npm run manifest` to regenerate `quizzes/manifest.json`.
4. `npm run validate` to check everything.
5. Commit the quiz, the catalog and the manifest together.

`quizzes/subjects.json` is the hand-written catalog: an ordered list of subjects, each with an optional
ordered list of units. It sets the sections and their order on the home page; empty units show as "בקרוב".

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

The home page links to `summaries/`, a hub with one condensed summary per body system. Each summary is a
static page, `summaries/<id>.html`, with a print button; the browser's print dialog saves it as a PDF
(light colors, A4, rows kept whole across pages). `summaries/all.html` loads every summary into one page,
so they print as a single PDF.

To add a summary:

1. Save it as `summaries/<id>.html`, copying the structure of an existing one: its content goes in
   `<article class="summary" data-system="<id>">` and uses the same classes (`rel`, `def`, `call`, `flags`, `exam`).
2. Add `{ id, title, blurb }` to `js/summary-list.js` (this sets the order on the hub and in the combined PDF).
3. Give it accent colors in `css/summary.css` (a `[data-system="<id>"]` rule with light and dark values).
4. `npm run validate` checks it: listed, self-hosted only, no inline styles or handlers, toolbar and footer present.

## Development

```sh
npm test          # unit tests for js/core.js and the scripts (node:test)
npm run validate  # validate all quizzes and summaries, and check the manifest is current
npm run manifest  # regenerate quizzes/manifest.json
npm run serve     # http://localhost:8000 (fetch() does not work over file://)
```

| Path | Role |
| --- | --- |
| `js/core.js` | pure logic: queue, scoring, stats, validation. No DOM, no storage |
| `js/storage.js` | guarded `localStorage` wrapper (prefix `anatomy-quizzes:v1:`) |
| `js/index.js`, `js/quiz.js`, `js/print.js` | page UI (`js/load-quiz.js`: quiz loading shared by quiz.js and print.js). `quiz.html?id=<quiz>` plays one quiz; `quiz.html?subject=<name>` is mixed practice across the subject's units (the home page's "בחירת נושאים למבחן" card) |
| `summaries/`, `css/summary.css` | short summaries, the hub and the combined print page |
| `js/summary-list.js` | the list of summaries (no DOM); `js/summaries.js`, `js/summary.js`, `js/summaries-all.js` drive the pages |
| `scripts/` | manifest, validate, and a tiny static dev server |
| `css/style.css` | the whole site's styles; follows `design/STYLE.md` |
| `design/` | design spec (`STYLE.md`) and the reference page it was taken from. Not used by the site |
| `fonts/` | self-hosted Rubik and Frank Ruhl Libre (SIL OFL, licenses included) |
| `test/` | unit tests. `test/fixtures/` holds placeholder content only |
