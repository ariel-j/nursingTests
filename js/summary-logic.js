// Pure helpers for the summary study tools (search, learned-checklist). No DOM, no storage, so
// the Node tests can cover them. js/summary-tools.js wires them to the page.

/** Collapse whitespace so the same text always gives the same key. */
const normalize = (text) => String(text).replace(/\s+/g, ' ').trim();

/** Short, stable key for a line of text (djb2, base 36). Lets a checked item survive reordering. */
export function textKey(text) {
  let h = 5381;
  for (const ch of normalize(text)) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}

/** Does `text` match the search `query`? Case-insensitive; an empty query matches everything. */
export function matchesQuery(text, query) {
  const q = normalize(query).toLowerCase();
  return q === '' || normalize(text).toLowerCase().includes(q);
}

/** Whole-number percent done; 0 when there is nothing to do. */
export function percent(done, total) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/** The saved keys that still exist on the page, as a Set. Ignores anything that is not a string list. */
export function validChecks(saved, currentKeys) {
  const present = new Set(currentKeys);
  return new Set(Array.isArray(saved) ? saved.filter((k) => present.has(k)) : []);
}
