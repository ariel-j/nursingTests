# Quiz & game content spec (template for a new project)

Draft, generalized from this repo's quiz format. Machine-checkable rules live in
[quiz-games.schema.json](quiz-games.schema.json); this file holds what a schema can't say
(content rules) plus a brief to paste into the AI session that writes the content.

## Design principles

1. **Content is data, the engine is code.** One JSON file per activity, no logic inside it.
2. **Author-friendly, engine-shuffled.** Authors write the correct answer / correct order first. The engine
   randomizes on every display, so authors never think about position.
3. **Stable ids.** Saved progress is keyed by item id. Never renumber, never reuse a deleted id.
4. **Strict by default.** Unknown fields are rejected (catches `explenation`). Validate in CI.
5. **Plain text only.** No HTML/Markdown in strings; render with `textContent`. Unicode for symbols (O₂, Na⁺, →).
6. **Public repo = original content only.** No copied course material or past exam questions.

## File shape

```json
{
  "schemaVersion": 1,
  "id": "heart-1",
  "kind": "quiz",
  "subject": "אנטומיה ופיזיולוגיה",
  "unit": "הלב",
  "title": "מבחן 1",
  "description": "optional",
  "lang": "he",
  "items": [ ... shape depends on kind ... ]
}
```

`kind` is one of `quiz | match | order | categorize | truefalse | flashcards`. File name = `<id>.json`.
`subject` / `unit` must exist in a hand-written catalog (`subjects.json`), same as in this repo.

## Item shapes (summary; the schema is authoritative)

| kind | Item fields | Engine does |
| --- | --- | --- |
| `quiz` | `id, topic, question, options[4]{text, note?}, correct, explanation` | shuffles options |
| `match` | `id, topic, prompt?, pairs[4-8]{left, right, explanation?}` | shuffles right column |
| `order` | `id, topic, prompt, steps[3-8] (correct order), explanation` | shuffles steps |
| `categorize` | `id, topic, prompt, categories[2-4], entries[4-12]{text, category}, explanation` | shuffles entries |
| `truefalse` | `id, topic, statement, correct (bool), explanation` | shuffles items |
| `flashcards` | `id, topic, front, back, hint?` | spaced repetition / shuffle |

Examples (placeholder text):

```json
{ "id": "q001", "topic": "T1", "question": "Q?", "options": [
    { "text": "right" }, { "text": "wrong A", "note": "why wrong" },
    { "text": "wrong B", "note": "why wrong" }, { "text": "wrong C", "note": "why wrong" } ],
  "correct": 0, "explanation": "why right" }

{ "id": "m001", "topic": "T1", "prompt": "Match each X to Y", "pairs": [
    { "left": "a1", "right": "b1" }, { "left": "a2", "right": "b2" },
    { "left": "a3", "right": "b3" }, { "left": "a4", "right": "b4" } ] }

{ "id": "o001", "topic": "T1", "prompt": "Order the steps", "steps": ["first", "second", "third"],
  "explanation": "why this order" }

{ "id": "c001", "topic": "T1", "prompt": "Sort", "categories": ["A", "B"], "entries": [
    { "text": "x1", "category": 0 }, { "text": "x2", "category": 1 },
    { "text": "x3", "category": 0 }, { "text": "x4", "category": 1 } ], "explanation": "..." }

{ "id": "t001", "topic": "T1", "statement": "S", "correct": false, "explanation": "..." }

{ "id": "f001", "topic": "T1", "front": "term", "back": "definition" }
```

## Rules the schema can't express (validator must check)

- Item ids unique within a file; file name equals `id`.
- `quiz`: option texts distinct (trimmed); **no positional options** ("א+ב נכונות", "תשובה ג", "all of the above"),
  because options are shuffled.
- `match`: all `left` distinct and all `right` distinct (otherwise the match is ambiguous).
- `order`: steps distinct; every sequence has exactly one correct order. Don't use steps that are interchangeable.
- `categorize`: every category used at least once; `category < categories.length`; entry texts distinct.
- `truefalse`: keep a balance close to 50/50 across the file, or students learn to guess "true".
- Every `topic` string comes from a fixed list per file (about 5-15 topics, each ≥ 3 items), exact string match.
  The end screen groups weak topics by exact match.

## Engine rules to carry over (from this project)

- Wrong/skipped items re-queue 2-5 positions later, never immediately next (unless last).
- Mastery: first-try correct = mastered; after a miss needs 2 correct in a row.
- Modes: `full` (counts toward best score), `topics`, `retry`. In-progress state persists and resumes;
  discard saved state that no longer matches the file's item ids.
- Pure logic module (queue, scoring, validation) with injected `rng`, no DOM/storage, unit-tested.
- Games reuse the same queue/mastery engine: an "item" is one match set / one sequence / one sort / one statement.
  Partial credit is not first-try credit: any error on a game item counts as a miss.

## Brief to paste into the content-writing session

```text
You are writing study content as JSON files for <SITE DESCRIPTION> in <LANGUAGE>.
Work only from the course material I give you. Add no facts that aren't in it. If something is
ambiguous, list it for me in chat. Never put it in the file.

OUTPUT
- One UTF-8 JSON file per activity. File name = id + ".json" (id: lowercase English with hyphens).
- Follow quiz-games.schema.json exactly. No extra fields. schemaVersion is 1.
- "subject" / "unit": exactly the strings from my catalog.
- Before writing, propose a topic list (5-15 topics, ≥ 3 items each) and wait for my OK.
  Use each topic string exactly, character for character.

IDS
- Prefix per kind: q (quiz), m (match), o (order), c (categorize), t (truefalse), f (flashcards),
  then a zero-padded number: q001, q002 ... Never renumber after delivery. New items take the next unused number.

QUALITY
- Exactly one unambiguous correct answer / order / category per item, according to the material.
- Distractors are plausible, same category, similar length and grammar. The correct answer must not stand out.
- Write the correct option first (and steps in correct order). The site shuffles.
- Never reference other options by position. Never write "all/none of the above".
- Each item stands alone: no references to other items or figures.
- Test understanding (cause → effect, function, clinical relevance), not only definitions.
- "explanation": 1-3 sentences, why the answer is right. "note" on each distractor: the misconception behind it.
- Text: plain only, no HTML/Markdown. Unicode for symbols. First mention of a term: add the English/Latin term in parentheses.
- True/false: about half false; false statements must be false for a clear reason, not a trick of wording.
- Original wording. Do not copy passages or past exam questions.

BEFORE HANDING OVER, CHECK
- Valid JSON against the schema; ids unique; topics from the agreed list; distinct options/pairs/steps.
- Then list in chat any item you are not fully sure about, with the reason.
```

## Workflow in the new project

1. Copy `quiz-games.schema.json` + this file into `docs/`.
2. Write `scripts/validate.mjs`: JSON-Schema check (e.g. `ajv` as a **dev** dependency) plus the extra rules above.
3. Write `core.js` per kind as pure functions; one test file per kind.
4. Add content, run `validate`, play it locally, commit.
