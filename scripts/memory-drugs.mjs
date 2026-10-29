// Drug cards for the memory game (games/drugs.json): conversion from the authoring file and checks.
// The authoring file also carries sources, lecturers and exam statistics; none of that is published.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const DRUGS_FILE = fileURLToPath(new URL('../games/drugs.json', import.meta.url));

const TEXT_FIELDS = ['name', 'family', 'topic', 'indication', 'explanation', 'association'];

export function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Keeps only what the game shows; throws on a source that is not the expected shape. */
export function buildDrugs(source) {
  if (!source || !Array.isArray(source.drugs)) throw new Error('source has no "drugs" array');
  const drugs = source.drugs.map((d, i) => {
    for (const f of TEXT_FIELDS) {
      if (typeof d[f] !== 'string' || d[f].trim() === '') throw new Error(`drug #${i + 1}: missing "${f}"`);
    }
    if (!Array.isArray(d.side_effects)) throw new Error(`drug #${i + 1}: missing "side_effects"`);
    return {
      id: slug(d.name),
      rank: Number.isInteger(d.rank) ? d.rank : i + 1,
      name: d.name.trim(),
      family: d.family.trim(),
      topic: d.topic.trim(),
      indication: d.indication.trim(),
      sideEffects: d.side_effects.map((s) => String(s).trim()).filter(Boolean),
      explanation: d.explanation.trim(),
      association: d.association.trim(),
    };
  });
  drugs.sort((a, b) => a.rank - b.rank);
  return { drugs };
}

const ALLOWED_KEYS = ['id', 'rank', 'name', 'family', 'topic', 'indication', 'sideEffects', 'explanation', 'association'];

/** Every problem with a published drugs file. */
export function drugErrors(data) {
  const errors = [];
  if (!data || !Array.isArray(data.drugs) || data.drugs.length < 8) return ['"drugs" must be an array of at least 8 drugs'];
  const ids = new Set();
  const names = new Set();
  data.drugs.forEach((d, i) => {
    const label = `drug #${i + 1}${d && d.name ? ` (${d.name})` : ''}`;
    for (const f of TEXT_FIELDS) {
      if (typeof d[f] !== 'string' || d[f].trim() === '') errors.push(`${label}: missing "${f}"`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.id ?? '')) errors.push(`${label}: bad id "${d.id}"`);
    if (ids.has(d.id)) errors.push(`${label}: duplicate id "${d.id}"`);
    ids.add(d.id);
    if (names.has(d.name)) errors.push(`${label}: duplicate name`);
    names.add(d.name);
    if (!Array.isArray(d.sideEffects) || d.sideEffects.some((s) => typeof s !== 'string' || !s.trim())) {
      errors.push(`${label}: "sideEffects" must be an array of non-empty strings`);
    }
    for (const key of Object.keys(d)) {
      if (!ALLOWED_KEYS.includes(key)) errors.push(`${label}: unexpected field "${key}" (only game fields are published)`);
    }
  });
  return errors;
}

export async function loadDrugs(file = DRUGS_FILE) {
  return JSON.parse(await readFile(file, 'utf8'));
}
