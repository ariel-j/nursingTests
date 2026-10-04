// The subjects as the pages see them: quizzes/manifest.json (generated from quizzes/subjects.json)
// and helpers over it. Everything except loadManifest is pure, so the Node tests can import it.
import { isValidQuizId } from './core.js';

/** Subject ids go in URLs (?subject=<id>) and tie summaries to their subject: same rule as quiz ids. */
export const isValidSubjectId = isValidQuizId;

/** A subject by its id, or by its name (links made before subjects had ids). */
export function findSubject(manifest, key) {
  if (typeof key !== 'string' || key === '') return null;
  return (manifest?.subjects ?? []).find((s) => s.id === key || s.name === key) ?? null;
}

/** The subject a quiz id belongs to, or null. */
export function subjectOfQuiz(manifest, quizId) {
  return (manifest?.subjects ?? []).find((s) => subjectQuizzes(s).some((q) => q.id === quizId)) ?? null;
}

/** Every quiz of a subject in home-page order: quizzes placed on the subject, then each unit's. */
export function subjectQuizzes(subject) {
  return [...subject.quizzes, ...subject.units.flatMap((u) => u.quizzes)].filter((q) => isValidQuizId(q.id));
}

/**
 * Counts for the subject cards and the side menu. A group is a unit with quizzes, or a quiz placed
 * directly on the subject; mixed practice only makes sense with more than one group to mix.
 */
export function subjectStats(subject) {
  const quizzes = subjectQuizzes(subject);
  const groupCount = subject.quizzes.length + subject.units.filter((u) => u.quizzes.length > 0).length;
  return {
    quizCount: quizzes.length,
    questionCount: quizzes.reduce((n, q) => n + q.questionCount, 0),
    groupCount,
    canMix: groupCount > 1,
  };
}

/** Where each part of a subject lives, relative to the site root. */
export function subjectPaths(id) {
  const q = `?subject=${encodeURIComponent(id)}`;
  return {
    home: `./${q}`,
    practice: `quiz.html${q}`,
    print: `print.html${q}`,
    summaries: `summaries/${q}`,
  };
}

/** Anchor of a unit's section on the subject page. */
export const unitAnchor = (index) => `unit-${index + 1}`;

const MANIFEST_URL = new URL('../quizzes/manifest.json', import.meta.url);
let pending = null;

/** The manifest, fetched once per page however many modules ask for it. */
export function loadManifest() {
  pending ??= fetch(MANIFEST_URL, { cache: 'no-cache' }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${MANIFEST_URL}`);
    return res.json();
  });
  return pending;
}
