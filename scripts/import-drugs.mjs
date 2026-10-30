// Usage: npm run import-drugs -- <source.json>
// Converts the authoring file of drug cards into games/drugs.json (game fields only).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DRUGS_FILE, buildDrugs, drugErrors } from './memory-drugs.mjs';

const src = process.argv[2];
if (!src) {
  console.error('Usage: npm run import-drugs -- <source.json>');
  process.exit(1);
}

try {
  const data = buildDrugs(JSON.parse(await readFile(src, 'utf8')));
  const errors = drugErrors(data);
  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  await mkdir(path.dirname(DRUGS_FILE), { recursive: true });
  await writeFile(DRUGS_FILE, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${data.drugs.length} drugs to ${path.relative(process.cwd(), DRUGS_FILE)}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
