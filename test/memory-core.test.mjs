import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACHIEVEMENTS,
  DAILY_BONUS,
  DAILY_GOAL,
  SPEED_MS,
  answerSpeed,
  applyResult,
  buildQuestion,
  clearMismatch,
  comboMultiplier,
  createPairs,
  createSpeed,
  dayDiff,
  dealBoard,
  emptyProgress,
  finishPairs,
  finishSpeed,
  flip,
  levelOf,
  listTopicGroups,
  liveStreak,
  normalizeProgress,
  pairStars,
  pickDistractors,
  pickDrugs,
  playerLevel,
  primaryTopic,
  timeBonus,
  topicMap,
  touchStreak,
  weakDrugs,
  xpForLevel,
} from '../js/memory-core.js';
import { overlaps } from '../js/drugs-core.js';

const data = JSON.parse(readFileSync(new URL('../games/drugs.json', import.meta.url), 'utf8'));
const drugs = data.drugs;

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ids = (n) => drugs.slice(0, n).map((d) => d.id);
const indexOf = (state, drugId, kind) => state.cards.findIndex((c) => c.drugId === drugId && c.kind === kind);

/** Plays a whole board without mistakes; returns the final state. */
function playPerfect(state) {
  let s = state;
  for (const drugId of [...new Set(s.cards.map((c) => c.drugId))]) {
    s = flip(s, indexOf(s, drugId, 'name')).state;
    s = flip(s, indexOf(s, drugId, 'use')).state;
  }
  return s;
}

// ---------- topics ----------

test('primaryTopic takes the first part of a combined topic', () => {
  assert.equal(primaryTopic('פרקינסון/דיכאון'), 'פרקינסון');
  assert.equal(primaryTopic('חרדה'), 'חרדה');
});

test('small topics fold into "שונות", which is listed last', () => {
  const sample = [
    { id: 'a', rank: 1, topic: 'X' }, { id: 'b', rank: 2, topic: 'X' }, { id: 'c', rank: 3, topic: 'X' },
    { id: 'd', rank: 4, topic: 'Y' }, { id: 'e', rank: 5, topic: 'Z/X' },
  ];
  assert.deepEqual(topicMap(sample), { a: 'X', b: 'X', c: 'X', d: 'שונות', e: 'שונות' });
  assert.deepEqual(listTopicGroups(sample).map((g) => g.name), ['X', 'שונות']);
});

test('every real topic group has at least three drugs', () => {
  const groups = listTopicGroups(drugs);
  assert.equal(groups.flatMap((g) => g.ids).length, drugs.length);
  for (const g of groups) assert.ok(g.ids.length >= 3, g.name);
});

// ---------- picking ----------

test('pickDrugs returns distinct ids and never more than the pool', () => {
  const picked = pickDrugs(drugs, emptyProgress(), 8, seeded(1));
  assert.equal(new Set(picked).size, 8);
  assert.equal(pickDrugs(drugs.slice(0, 3), emptyProgress(), 8, seeded(1)).length, 3);
});

test('pickDrugs favours drugs that are not mastered yet', () => {
  const progress = emptyProgress();
  for (const d of drugs.slice(0, 60)) progress.drugs[d.id] = { level: 3, seen: 5, right: 5, wrong: 0 };
  const rng = seeded(7);
  let fromRest = 0;
  const rest = new Set(drugs.slice(60).map((d) => d.id));
  for (let i = 0; i < 200; i++) fromRest += pickDrugs(drugs, progress, 6, rng).filter((id) => rest.has(id)).length;
  // 10 new drugs (weight 3) against 60 mastered (weight 1): 6 picks should hold far more than a uniform 0.86.
  assert.ok(fromRest / 200 > 2, `new drugs per pick: ${fromRest / 200}`);
});

test('weakDrugs lists seen drugs at level 1 or below, most mistakes first', () => {
  const progress = emptyProgress();
  progress.drugs[drugs[0].id] = { level: 1, seen: 2, right: 1, wrong: 1 };
  progress.drugs[drugs[1].id] = { level: 1, seen: 3, right: 0, wrong: 3 };
  progress.drugs[drugs[2].id] = { level: 2, seen: 3, right: 3, wrong: 0 };
  assert.deepEqual(weakDrugs(drugs, progress).map((d) => d.id), [drugs[1].id, drugs[0].id]);
});

// ---------- pairs ----------

test('dealBoard makes a name card and a use card for every drug', () => {
  const cards = dealBoard(ids(8), seeded(3));
  assert.equal(cards.length, 16);
  for (const id of ids(8)) {
    assert.equal(cards.filter((c) => c.drugId === id && c.kind === 'name').length, 1);
    assert.equal(cards.filter((c) => c.drugId === id && c.kind === 'use').length, 1);
  }
});

test('a match scores with a growing combo and is capped', () => {
  assert.equal(comboMultiplier(1), 1);
  assert.equal(comboMultiplier(3), 2);
  assert.equal(comboMultiplier(5), 3);
  assert.equal(comboMultiplier(9), 3);
  const end = playPerfect(createPairs(ids(6), seeded(2)));
  assert.equal(end.done, true);
  assert.equal(end.bestCombo, 6);
  assert.equal(end.score, 100 + 150 + 200 + 250 + 300 + 300);
});

test('flipping reports events and ignores invalid flips', () => {
  const s0 = createPairs(ids(4), seeded(2));
  const a = indexOf(s0, drugs[0].id, 'name');
  const first = flip(s0, a);
  assert.deepEqual(first.events.map((e) => e.type), ['flip']);
  assert.deepEqual(flip(first.state, a).events, [], 'same card twice');
  assert.deepEqual(flip(s0, 99).events, []);
  assert.deepEqual(flip(s0, -1).events, []);
  const match = flip(first.state, indexOf(s0, drugs[0].id, 'use'));
  assert.deepEqual(match.events.map((e) => e.type), ['flip', 'match']);
  assert.equal(match.events[1].drugId, drugs[0].id);
  assert.deepEqual(flip(match.state, a).events, [], 'matched cards stay put');
  assert.equal(s0.faceUp.length, 0, 'input state is not mutated');
});

test('a mismatch locks the board until it is cleared', () => {
  const s0 = createPairs(ids(4), seeded(2));
  let s = flip(s0, indexOf(s0, drugs[0].id, 'name')).state;
  const bad = flip(s, indexOf(s0, drugs[1].id, 'use'));
  assert.deepEqual(bad.events.map((e) => e.type), ['flip', 'mismatch']);
  assert.equal(bad.state.locked, true);
  assert.deepEqual(flip(bad.state, indexOf(s0, drugs[2].id, 'name')).events, [], 'locked');
  const cleared = clearMismatch(bad.state);
  assert.equal(cleared.locked, false);
  assert.deepEqual(cleared.faceUp, []);
  assert.equal(flip(cleared, indexOf(s0, drugs[2].id, 'name')).events.length, 1);
});

test('guessing at unseen cards costs the combo but no points', () => {
  const s0 = createPairs(ids(4), seeded(2));
  let s = flip(s0, indexOf(s0, drugs[0].id, 'name')).state;
  const bad = flip(s, indexOf(s0, drugs[1].id, 'use'));
  const mismatch = bad.events[1];
  assert.equal(mismatch.avoidable, false);
  assert.equal(bad.state.misses, 0);
  assert.equal(bad.state.mistakes, 1);
  assert.equal(bad.state.score, 0);
});

test('missing a pair whose partner was already seen is a real miss with a penalty', () => {
  let s = createPairs(ids(4), seeded(2));
  const [d0, d1, d2] = ids(3);
  // Show d0's use (then flip it back by pairing it wrongly with d1's name).
  s = flip(s, indexOf(s, d0, 'use')).state;
  s = clearMismatch(flip(s, indexOf(s, d1, 'name')).state);
  // Earn some score first so the penalty is visible.
  s = flip(s, indexOf(s, d2, 'name')).state;
  s = flip(s, indexOf(s, d2, 'use')).state;
  assert.equal(s.score, 100);
  // Now d0's name is flipped next to the wrong card although d0's use is known.
  s = flip(s, indexOf(s, d0, 'name')).state;
  const bad = flip(s, indexOf(s, ids(4)[3], 'use'));
  assert.equal(bad.events[1].avoidable, true);
  assert.equal(bad.state.misses, 1);
  assert.equal(bad.state.score, 50);
  assert.ok(bad.state.missedIds.includes(d0));
});

test('the penalty never takes the score below zero', () => {
  let s = createPairs(ids(4), seeded(2));
  s = flip(s, indexOf(s, drugs[0].id, 'use')).state;
  s = clearMismatch(flip(s, indexOf(s, drugs[1].id, 'name')).state);
  s = flip(s, indexOf(s, drugs[0].id, 'name')).state;
  const bad = flip(s, indexOf(s, drugs[2].id, 'use'));
  assert.equal(bad.state.score, 0);
});

test('stars and time bonus', () => {
  assert.equal(pairStars(8, 0), 3);
  assert.equal(pairStars(8, 2), 3);
  assert.equal(pairStars(8, 3), 2);
  assert.equal(pairStars(8, 8), 2);
  assert.equal(pairStars(8, 9), 1);
  assert.equal(timeBonus(8, 40000), 240);
  assert.equal(timeBonus(8, 200000), 0);
});

test('finishPairs adds the bonuses and lists one outcome per drug', () => {
  const end = playPerfect(createPairs(ids(6), seeded(2)));
  const result = finishPairs(end, 30000);
  assert.equal(result.perfectBonus, 200);
  assert.equal(result.timeBonus, (48 - 30) * 10);
  assert.equal(result.score, end.score + result.timeBonus + 200);
  assert.equal(result.stars, 3);
  assert.equal(result.outcomes.length, 6);
  assert.ok(result.outcomes.every((o) => o.ok));
});

// ---------- speed ----------

test('pickDistractors prefers the same topic and never includes the drug', () => {
  const topics = topicMap(drugs);
  const drug = drugs.find((d) => d.name === 'Levodopa');
  const near = pickDistractors(drug, drugs, topics, seeded(4));
  assert.equal(near.length, 3);
  assert.ok(!near.includes(drug.id));
  assert.ok(near.every((id) => topics[id] === topics[drug.id]), 'Parkinson drugs with a different use fill the options');
});

test('wrong options never share a use with the right one', () => {
  const topics = topicMap(drugs);
  const byId = new Map(drugs.map((d) => [d.id, d]));
  const rng = seeded(11);
  for (const drug of drugs) {
    for (const id of pickDistractors(drug, drugs, topics, rng)) {
      assert.ok(!overlaps(drug.indication, byId.get(id).indication), `${drug.name} / ${byId.get(id).name}`);
    }
  }
});

test('a round avoids drugs whose uses overlap while the pool allows it', () => {
  const byId = new Map(drugs.map((d) => [d.id, d]));
  const rng = seeded(21);
  for (let i = 0; i < 100; i++) {
    const picked = pickDrugs(drugs, emptyProgress(), 8, rng).map((id) => byId.get(id));
    for (let a = 0; a < picked.length; a++) {
      for (let b = a + 1; b < picked.length; b++) {
        assert.ok(!overlaps(picked[a].indication, picked[b].indication), `${picked[a].name} / ${picked[b].name}`);
      }
    }
  }
});

test('a narrow pool still fills the round, even when every use overlaps', () => {
  const epilepsy = drugs.filter((d) => /status|סטטוס/i.test(d.indication)).slice(0, 4);
  assert.equal(pickDrugs(epilepsy, emptyProgress(), 4, seeded(3)).length, 4);
});

test('buildQuestion has four distinct options with the right one marked', () => {
  const topics = topicMap(drugs);
  const rng = seeded(5);
  for (const drug of drugs) {
    const q = buildQuestion(drug, drugs, topics, rng);
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.equal(q.options[q.correctIndex], drug.id);
    assert.equal(q.ms, SPEED_MS[q.direction]);
  }
});

test('answerSpeed scores by speed and streak, timeouts count as wrong', () => {
  let s = createSpeed(ids(4), drugs, seeded(6));
  const right = s.questions[0].correctIndex;
  const full = answerSpeed(s, right, s.questions[0].ms);
  assert.equal(full.event.points, 200);
  s = full.state;
  const fast = answerSpeed(s, s.questions[1].correctIndex, 0);
  assert.equal(fast.event.points, 125, 'no time left, streak of one');
  s = fast.state;
  const wrongIndex = (s.questions[2].correctIndex + 1) % 4;
  const wrong = answerSpeed(s, wrongIndex, 5000);
  assert.equal(wrong.event.type, 'wrong');
  assert.equal(wrong.state.streak, 0);
  assert.equal(wrong.state.bestStreak, 2);
  const timeout = answerSpeed(wrong.state, null, 0);
  assert.equal(timeout.event.type, 'timeout');
  assert.equal(timeout.state.done, true);
  const result = finishSpeed(timeout.state);
  assert.equal(result.correct, 2);
  assert.equal(result.total, 4);
  assert.deepEqual(result.outcomes.map((o) => o.ok), [true, true, false, false]);
  assert.deepEqual(answerSpeed(timeout.state, 0, 0).event, null, 'a finished game ignores answers');
});

// ---------- progress ----------

const fakeResult = (mode, outcomes, extra = {}) => ({ mode, score: 1000, stars: 2, outcomes, misses: 1, bestCombo: 2, ...extra });

test('pairs lifts a drug to familiar at most; speed can master it', () => {
  const id = drugs[0].id;
  let p = emptyProgress();
  const run = (mode, ok) => { p = applyResult(p, fakeResult(mode, [{ drugId: id, ok }]), '2026-10-01', drugs).progress; };
  run('pairs', true);
  assert.equal(levelOf(p, id), 1);
  run('pairs', true);
  assert.equal(levelOf(p, id), 2);
  run('pairs', true);
  assert.equal(levelOf(p, id), 2, 'pairs stops at 2');
  run('speed', true);
  assert.equal(levelOf(p, id), 3);
  run('pairs', true);
  assert.equal(levelOf(p, id), 3, 'pairs never lowers a mastered drug on success');
  run('speed', false);
  assert.equal(levelOf(p, id), 2);
  assert.deepEqual(p.drugs[id], { level: 2, seen: 6, right: 5, wrong: 1 });
});

test('a miss never drops a seen drug below level 1', () => {
  const id = drugs[0].id;
  const p = applyResult(emptyProgress(), fakeResult('pairs', [{ drugId: id, ok: false }]), '2026-10-01', drugs).progress;
  assert.equal(levelOf(p, id), 1);
});

test('applyResult is pure and reports promotions, XP and bests', () => {
  const before = emptyProgress();
  const frozen = structuredClone(before);
  const { progress, report } = applyResult(before, fakeResult('pairs', [{ drugId: drugs[0].id, ok: true }, { drugId: drugs[1].id, ok: false }]), '2026-10-01', drugs);
  assert.deepEqual(before, frozen);
  assert.equal(progress.xp, 1000);
  assert.equal(progress.rounds, 1);
  assert.equal(progress.best.pairs, 1000);
  assert.equal(report.isBest, true);
  assert.deepEqual(report.promoted.sort(), [drugs[0].id, drugs[1].id].sort());
  assert.ok(report.newAchievements.includes('first-round'));
});

test('player level thresholds', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 500);
  assert.equal(xpForLevel(3), 1500);
  assert.equal(playerLevel(0).level, 1);
  assert.equal(playerLevel(499).level, 1);
  assert.equal(playerLevel(500).level, 2);
  const mid = playerLevel(1000);
  assert.equal(mid.level, 2);
  assert.equal(mid.into, 500);
  assert.equal(mid.need, 1000);
  assert.ok(playerLevel(1e8).title);
});

test('level-up is reported', () => {
  const { report } = applyResult(emptyProgress(), fakeResult('pairs', [], { score: 600 }), '2026-10-01', drugs);
  assert.equal(report.leveledUp, true);
  assert.equal(report.levelAfter, 2);
});

test('the daily goal pays its bonus once a day', () => {
  let p = emptyProgress();
  let last;
  for (let i = 0; i < DAILY_GOAL + 2; i++) {
    last = applyResult(p, fakeResult('pairs', [], { score: 100 }), '2026-10-01', drugs);
    p = last.progress;
    const expected = i === DAILY_GOAL - 1 ? DAILY_BONUS : 0;
    assert.equal(last.report.dailyBonus, expected, `round ${i + 1}`);
  }
  const nextDay = applyResult(p, fakeResult('pairs', [], { score: 100 }), '2026-10-02', drugs);
  assert.equal(nextDay.progress.daily.rounds, 1);
  assert.equal(nextDay.progress.daily.bonusPaid, false);
});

test('day streaks grow on consecutive days and reset after a gap', () => {
  assert.equal(dayDiff('2026-02-28', '2026-03-01'), 1);
  assert.equal(dayDiff('2026-03-28', '2026-03-30'), 2);
  let s = touchStreak({ days: 0, last: null }, '2026-10-01');
  assert.deepEqual(s, { days: 1, last: '2026-10-01' });
  assert.equal(touchStreak(s, '2026-10-01'), s, 'same day is a no-op');
  s = touchStreak(s, '2026-10-02');
  assert.equal(s.days, 2);
  assert.equal(touchStreak(s, '2026-10-05').days, 1);
  assert.equal(liveStreak(s, '2026-10-03'), 2, 'yesterday still counts');
  assert.equal(liveStreak(s, '2026-10-04'), 0);
  assert.equal(liveStreak({ days: 0, last: null }, '2026-10-04'), 0);
});

test('achievements unlock once and carry their date', () => {
  const perfect = fakeResult('pairs', [], { misses: 0, stars: 3, bestCombo: 6 });
  const first = applyResult(emptyProgress(), perfect, '2026-10-01', drugs);
  for (const id of ['first-round', 'perfect', 'combo-5', 'three-stars']) {
    assert.ok(first.report.newAchievements.includes(id), id);
    assert.equal(first.progress.achievements[id], '2026-10-01');
  }
  const second = applyResult(first.progress, perfect, '2026-10-02', drugs);
  assert.deepEqual(second.report.newAchievements, []);
  assert.equal(second.progress.achievements.perfect, '2026-10-01');
});

test('collection achievements follow drug levels', () => {
  const progress = emptyProgress();
  for (const d of drugs.slice(0, 9)) progress.drugs[d.id] = { level: 1, seen: 1, right: 1, wrong: 0 };
  const result = fakeResult('pairs', [{ drugId: drugs[9].id, ok: true }]);
  const { report } = applyResult(progress, result, '2026-10-01', drugs);
  assert.ok(report.newAchievements.includes('seen-10'));
  assert.ok(!report.newAchievements.includes('seen-all'));
});

test('achievement ids are unique', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
});

test('normalizeProgress repairs bad stored data', () => {
  assert.deepEqual(normalizeProgress(null), emptyProgress());
  assert.deepEqual(normalizeProgress('x'), emptyProgress());
  const messy = normalizeProgress({
    xp: -5, rounds: 'many', streak: { days: 3, last: 'yesterday' },
    drugs: { a: { level: 9, seen: 2, right: 1, wrong: 1 }, b: 7, c: { level: 'x' } },
    achievements: { ok: '2026-10-01', bad: 5 }, settings: { effects: 'yes', relaxed: true },
  });
  assert.equal(messy.xp, 0);
  assert.equal(messy.rounds, 0);
  assert.deepEqual(messy.streak, { days: 3, last: null });
  assert.equal(messy.drugs.a.level, 3);
  assert.equal(messy.drugs.b, undefined);
  assert.equal(messy.drugs.c.level, 0);
  assert.deepEqual(messy.achievements, { ok: '2026-10-01' });
  assert.deepEqual(messy.settings, { effects: false, relaxed: true });
  const good = applyResult(emptyProgress(), fakeResult('pairs', [{ drugId: 'x', ok: true }]), '2026-10-01', drugs).progress;
  assert.deepEqual(normalizeProgress(JSON.parse(JSON.stringify(good))), good);
});
