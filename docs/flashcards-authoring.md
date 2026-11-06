# Writing flashcard decks

A deck is one JSON file in `flashcards/`. Like quizzes, deck content is written outside this repo (usually with Claude,
working from your own notes) and only the finished JSON is added, either with the admin panel (tab "כרטיסיות") or by
committing the file. The exact field rules are in [README.md](../README.md#flashcards-כרטיסיות); `npm run validate` and the
panel enforce them. A ready example: [`templates/flashcards.json`](../templates/flashcards.json).

## Brief to paste

```text
You are writing a flashcard deck (JSON) for a Hebrew nursing exam-prep site.
Work only from the material I give you. Do not add facts that are not in it. If something is unclear, list it
for me in chat. Never put it in the file.

OUTPUT: one UTF-8 JSON file, no comments:
{
  "id": "<lowercase english with single hyphens, e.g. heart-cards-1>",
  "subject": "<course name, exactly as in the site, e.g. אנטומיה ופיזיולוגיה>",
  "unit": "<unit name, exactly as in the site; omit if the course has no units>",
  "title": "<Hebrew title>",
  "description": "<one Hebrew sentence, optional>",
  "cards": [
    { "id": "c001", "front": "<question or term>", "back": "<answer>", "topic": "<short topic, optional>" }
  ]
}

CARD RULES
- One idea per card. The front is a short question, term or situation; the back is the answer and nothing else.
- Front at most 500 characters, back at most 2000 (shorter is better: aim for a sentence or a short list).
- Plain text only. No HTML or markdown: it is shown literally. Line breaks (\n) are kept.
- Do not refer to other cards ("see the previous card"): cards are shuffled and come back at random.
- Give every card an id that is unique inside the deck (c001, c002, ...).
- "topic" groups cards so students can practise one topic at a time. Use a small, consistent set of exact strings.
  A card without a topic is grouped as "כללי".
- No lecturer names, no copied slides or long quotations from course materials: write short cards in your own words.
```

## After you have the file

1. Open the panel, tab "כרטיסיות", choose the file, check the subject/unit and id, then "בדיקה ותצוגה מקדימה".
2. Confirm that the content is yours to publish (the repo is public) and publish. One commit is created with the deck
   and the refreshed manifest.
3. To fix a card later: edit the file and upload it again with "החלפה" ticked. The id never changes, so learners'
   saved progress stays attached to the deck.
