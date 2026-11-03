import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LINE_CHARS, MAX_SECONDS, buildVocabulary, isKnown, mergeWords, pendingVideos, reviewReport, reviewWords, splitLines, timestamp, toVtt, wordsToCues,
} from '../scripts/captions.mjs';

// Placeholder words, one per second, 0.5s long, with a leading space like faster-whisper's.
const words = (texts, { from = 0, step = 1, probability = 0.9 } = {}) =>
  texts.map((t, i) => ({ start: from + i * step, end: from + i * step + 0.5, word: ` ${t}`, probability }));

test('pendingVideos lists videos with no .vtt of the same name', () => {
  assert.deepEqual(pendingVideos([
    'pharmacology/א/1 - סרטון.mp4', 'pharmacology/א/1 - סרטון.vtt', 'pharmacology/א/2.webm', 'pharmacology/א/3.png',
  ]), ['pharmacology/א/2.webm']);
});

test('timestamp is HH:MM:SS.mmm', () => {
  assert.equal(timestamp(0), '00:00:00.000');
  assert.equal(timestamp(3725.4567), '01:02:05.457');
});

test('splitLines keeps short text, splits long text at the space nearest the middle', () => {
  assert.deepEqual(splitLines('מילה אחת'), ['מילה אחת']);
  const long = 'אאאא בבבב גגגג דדדד הההה וווו זזזז חחחח טטטט יייי';
  const lines = splitLines(long);
  assert.equal(lines.length, 2);
  assert.equal(lines.join(' '), long);
  assert.ok(lines.every((l) => l.length <= LINE_CHARS));
  assert.deepEqual(splitLines('א'.repeat(50)), ['א'.repeat(50)]);
});

test('wordsToCues breaks at pauses, sentence ends, and the length and time limits', () => {
  // A pause of 2s between the third and fourth word.
  const paused = [...words(['א', 'ב', 'ג']), ...words(['ד', 'ה'], { from: 4.5 })];
  assert.deepEqual(wordsToCues(paused).map((c) => c.lines.join(' ')), ['א ב ג', 'ד ה']);

  // A sentence end splits once the cue is long enough, not after a short one.
  const sentence = words(['ראשונה', 'שנייה', 'שלישית', 'רביעית.', 'חמישית', 'קצר.', 'שביעית'], { step: 0.6 });
  assert.deepEqual(wordsToCues(sentence).map((c) => c.lines.join(' ')), ['ראשונה שנייה שלישית רביעית.', 'חמישית קצר. שביעית']);

  // Twenty words, one every 0.5s: no cue over two lines or MAX_SECONDS.
  const cues = wordsToCues(words(Array.from({ length: 20 }, (_, i) => `מילה${i}`), { step: 0.5 }));
  assert.ok(cues.length > 1);
  for (const c of cues) {
    assert.ok(c.lines.length <= 2 && c.lines.every((l) => l.length <= LINE_CHARS));
    assert.ok(c.end - c.start <= MAX_SECONDS);
  }
  assert.equal(cues.flatMap((c) => c.lines).join(' ').split(' ').length, 20);
});

test('mergeWords and wordsToCues glue a split word back together', () => {
  const split = [
    { start: 0, end: 0.2, word: ' מצב', probability: 0.9 },
    { start: 0.2, end: 0.3, word: ' ה', probability: 0.9 },
    { start: 0.3, end: 0.6, word: '-chill', probability: 0.9 },
  ];
  assert.deepEqual(mergeWords(split).map((w) => [w.word, w.start, w.end]), [[' מצב', 0, 0.2], [' ה-chill', 0.2, 0.6]]);
  assert.deepEqual(wordsToCues(split).map((c) => c.lines), [['מצב ה-chill']]);
  assert.equal(split[1].word, ' ה');
});

test('wordsToCues keeps a short cue up a second, without overlapping the next', () => {
  const [a, b] = wordsToCues([...words(['א']), ...words(['ב'], { from: 1.5 })]);
  assert.equal(a.end, 1);
  assert.ok(a.end <= b.start);
  const [c, d] = wordsToCues([{ start: 0, end: 0.1, word: ' א' }, ...words(['ב'], { from: 0.9 })]);
  assert.equal(c.end, 0.9);
  assert.equal(d.start, 0.9);
});

test('toVtt writes a WEBVTT file, right-to-left lines, escaped text', () => {
  const vtt = toVtt([{ start: 1, end: 2.5, lines: ['ACE <מעכבי>', 'שורה & שנייה'] }]);
  assert.equal(vtt, 'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\n‏ACE &lt;מעכבי&gt;\n‏שורה &amp; שנייה\n');
});

test('isKnown finds a word in the vocabulary, also behind a prefix and punctuation', () => {
  const vocab = buildVocabulary(['{"q": "תאים, דופמין (DA)."}', 'קולטנים']);
  for (const w of [' תאים', 'הדופמין,', 'והקולטנים.', 'DA', '-', '']) assert.ok(isKnown(w, vocab), w);
  for (const w of [' טעים', 'בהקפות']) assert.ok(!isKnown(w, vocab), w);
});

test('reviewWords and reviewReport list unknown words with their time and context', () => {
  const vocab = buildVocabulary(['א ב ד ה']);
  const ws = words(['א', 'ב', 'ג', 'ד', 'ה'], { from: 60 });
  assert.deepEqual(reviewWords(ws, vocab), [{ time: '01:02', word: 'ג', context: 'א ב ג ד ה' }]);
  const report = reviewReport([{ video: 'media/pharmacology/א/1.mp4', words: ws }, { video: 'media/pharmacology/ב.mp4', words: words(['א']) }], vocab);
  assert.match(report, /### `media\/pharmacology\/א\/1\.vtt`\n\n\| זמן/);
  assert.match(report, /\| 01:02 \| ג \| א ב ג ד ה \|/);
  assert.match(report, /`media\/pharmacology\/ב\.vtt`\n\nאין מילים לבדיקה/);
});
