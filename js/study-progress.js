// Pure logic of the "chapter done" tracker shared by the interactive summaries (no DOM, no storage;
// checked by the Node tests).

/**
 * What the progress tracker shows. `saved` is whatever came out of storage (it can be anything, or from an
 * older version of the page), `sectionIds` are the chapters on the page now. Marks for chapters that no
 * longer exist are dropped.
 */
export function studyProgress(saved, sectionIds) {
  const known = new Set(sectionIds);
  const done = [...new Set(Array.isArray(saved) ? saved : [])].filter((id) => known.has(id));
  const total = sectionIds.length;
  return { done, count: done.length, total, percent: total === 0 ? 0 : Math.round((done.length / total) * 100) };
}

/** Marks with `id` switched on or off; keeps the page's chapter order so the saved list is stable. */
export function toggleDone(done, id, checked, sectionIds) {
  const next = new Set(done);
  if (checked) next.add(id);
  else next.delete(id);
  return sectionIds.filter((s) => next.has(s));
}
