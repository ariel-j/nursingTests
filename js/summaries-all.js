// All summaries on one page (summaries/all.html), for printing them as a single PDF.
// Each summary page stays the only copy of its content: this fetches the pages and moves their
// <article> in with the DOM APIs (DOMParser does not run their scripts). Opened with #print, it
// opens the print dialog once everything, fonts included, has loaded. ?subject=<id> keeps only
// that subject's summaries.
import { SUMMARIES, summariesFor, summaryFile } from './summary-list.js';

const statusEl = document.getElementById('status');
const listEl = document.getElementById('all-summaries');
const printBtn = document.getElementById('print-all');

async function loadArticle(id) {
  const res = await fetch(summaryFile(id), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const article = doc.querySelector('article.summary');
  if (!article) throw new Error(`${id}: no article.summary`);
  return document.adoptNode(article);
}

async function main() {
  printBtn.disabled = true;
  const subjectId = new URLSearchParams(location.search).get('subject');
  const chosen = subjectId === null ? SUMMARIES : summariesFor(subjectId);
  if (subjectId !== null) document.getElementById('back-link').href = `./?subject=${encodeURIComponent(subjectId)}`;
  if (chosen.length === 0) {
    statusEl.textContent = 'אין סיכומים להדפסה.';
    return;
  }
  let articles;
  try {
    articles = await Promise.all(chosen.map((s) => loadArticle(s.id)));
  } catch (err) {
    console.error(err);
    statusEl.textContent = location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את הסיכומים.';
    return;
  }
  listEl.replaceChildren(...articles);
  statusEl.textContent = `${articles.length} סיכומים מוכנים להדפסה.`;
  printBtn.disabled = false;
  printBtn.addEventListener('click', () => window.print());

  if (location.hash === '#print') {
    await document.fonts.ready;
    window.print();
  }
}

main();
