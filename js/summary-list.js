// The short summaries list lives in summaries/list.json (machine-editable, so the admin panel can add
// entries). Order = the order the hub and the combined print show. Each id is a page summaries/<id>.html
// whose <article class="summary" data-system="<id>"> holds the content. No DOM here.

export const LIST_FILE = 'list.json';

/** Page file for a summary, relative to the summaries/ folder. */
export const summaryFile = (id) => `${id}.html`;

/** Problems with the parsed list.json. */
export function listErrors(list) {
  if (!list || !Array.isArray(list.summaries)) return ['"summaries" must be an array'];
  const errors = [];
  const ids = list.summaries.map((s) => s?.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate id');
  for (const s of list.summaries) {
    if (typeof s?.id !== 'string' || !/^[a-z0-9-]+$/.test(s.id)) errors.push(`bad id "${s?.id}"`);
    if (typeof s?.title !== 'string' || !s.title.trim() || typeof s?.blurb !== 'string' || !s.blurb.trim()) {
      errors.push(`${s?.id}: needs a title and a blurb`);
    }
  }
  return errors;
}

/** Browser: loads the list relative to the current summaries/ page. */
export async function loadSummaries() {
  const res = await fetch(LIST_FILE, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${LIST_FILE}: HTTP ${res.status}`);
  const list = await res.json();
  const errors = listErrors(list);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return list.summaries;
}
