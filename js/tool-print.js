// Turns an interactive summary (tools/<name>.html) into a plain article for the combined print page
// (summaries/all.html). The tool page stays the only copy of its content: this reads its sections
// and opens what the script would otherwise reveal on a click (every drug tab, every flip answer)
// and writes the sorting game out as a list. No scripts run in a DOMParser document.

/** The sorter's items as printable rows: { prompt, label, why }. Pure, so the tests cover it. */
export function sorterRows(json) {
  const { labels, items } = typeof json === 'string' ? JSON.parse(json) : json;
  return items.map(([prompt, correct, why]) => ({ prompt, label: labels[correct], why: why ?? '' }));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function openTabs(root) {
  for (const box of root.querySelectorAll('.tabbox')) {
    const names = [...box.querySelectorAll('.tabs [role=tab]')].map((tab) => tab.textContent);
    box.querySelectorAll('.drug').forEach((panel, i) => {
      panel.hidden = false;
      if (names[i]) panel.before(el('h3', 'tab-title', names[i]));
    });
    box.querySelector('.tabs')?.remove();
  }
}

function writeOutSorters(root) {
  for (const sorter of root.querySelectorAll('.sorter')) {
    const list = el('ul', 'sorter-rows');
    for (const { prompt, label, why } of sorterRows(sorter.dataset.s)) {
      const item = el('li');
      item.append(`${prompt}: `, el('b', null, label));
      if (why) item.append(` · ${why}`);
      list.append(item);
    }
    sorter.replaceChildren(el('h3', 'tab-title', 'מיון: לאיזו קבוצה שייך כל פריט'), list);
  }
}

/** Builds the <article> for one interactive summary from its parsed tool page. */
export function toolArticle(doc, entry) {
  const article = el('article', 'summary tool-print');
  article.dataset.system = entry.id;
  const header = el('header');
  header.append(el('p', 'kicker', `${entry.unit ?? ''} · סיכום אינטראקטיבי`), el('h1', null, entry.title), el('p', 'lede', entry.blurb));
  article.append(header);
  for (const section of doc.querySelectorAll('main .tool-section')) {
    if (section.id === 'quiz') continue; // a link to the quiz page, nothing to print
    openTabs(section);
    writeOutSorters(section);
    for (const detail of section.querySelectorAll('.flip-detail')) detail.hidden = false;
    section.querySelector('.sec-tag')?.remove();
    article.append(document.adoptNode(section));
  }
  return article;
}
