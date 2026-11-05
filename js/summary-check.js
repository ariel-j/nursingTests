// Pure checks for a summary page's HTML. Shared by `npm run validate`, the tests and the admin panel.
//
// A published summary is stored-XSS surface (it is served as-is, and all.html adopts its <article>
// into another page), so this is an allowlist-minded check: only the scripts the site ships, no
// embedding/forms/inline code, no script-capable URLs, nothing loaded from another origin.

const ALLOWED_SCRIPTS = new Set(['../js/summary.js', '../js/a11y.js']);

// Elements that can run code, embed another document, or collect input.
const FORBIDDEN_TAGS = [
  'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'textarea', 'select',
  'base', 'style', 'meta http-equiv', 'foreignobject', 'animate', 'set', 'animatetransform', 'handler',
  'audio', 'video', 'source', 'track', 'img', 'image', 'math',
];

const URL_ATTRS = /\b(?:href|src|xlink:href|action|formaction|poster|srcset|data|background|ping)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

const normalizeUrl = (raw) =>
  raw.replace(/^["']|["']$/g, '').replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();

/** Problems with one page's HTML. `isSummary` adds the checks for a summary's content page. */
export function pageErrors(html, { id, isSummary }) {
  const errors = [];

  if (/\b(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html) || /url\(\s*["']?(?:https?:)?\/\//i.test(html)) {
    errors.push('loads an external resource (fonts and assets must be self-hosted)');
  }
  if (/<[^>]*[\s/"']on[a-z]+\s*=/i.test(html) || /<[^>]+[\s/"']style\s*=/i.test(html)) {
    errors.push('inline style or event handler attribute');
  }
  if (/<[^>]*[\s/"']srcdoc\s*=/i.test(html)) errors.push('srcdoc attribute is not allowed');

  for (const tag of FORBIDDEN_TAGS) {
    const name = tag.split(' ')[0];
    if (new RegExp(`<\\s*${name}[\\s/>]`, 'i').test(html)) {
      if (tag === 'meta http-equiv' && !/<\s*meta[^>]*http-equiv/i.test(html)) continue;
      errors.push(`<${name}> is not allowed in a summary`);
    }
  }

  for (const [, raw] of html.matchAll(URL_ATTRS)) {
    const value = normalizeUrl(raw);
    if (/^(?:javascript|data|vbscript|blob|file):/.test(value) || value.includes('&#') || value.includes('&colon;')) {
      errors.push(`script-capable or obfuscated URL: ${raw.slice(0, 40)}`);
    }
  }

  const scripts = [...html.matchAll(/<\s*script\b([^>]*)>([\s\S]*?)<\s*\/\s*script\s*>/gi)];
  const openScripts = (html.match(/<\s*script\b/gi) ?? []).length;
  if (openScripts !== scripts.length) errors.push('malformed <script> tag');
  for (const [, attrs, body] of scripts) {
    const src = /\bsrc\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    const own = isSummary ? ALLOWED_SCRIPTS.has(src) : /^\.\.\/js\/[a-z0-9-]+\.js$/.test(src ?? '');
    if (body.trim() !== '' || !own) {
      errors.push('only the site\'s own scripts (../js/summary.js, ../js/a11y.js) are allowed');
    }
  }

  for (const [, attrs] of html.matchAll(/<\s*link\b([^>]*)>/gi)) {
    const rel = /\brel\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]?.toLowerCase();
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
    if (!['stylesheet', 'preload'].includes(rel) || !href.startsWith('../')) {
      errors.push('<link> may only load the site\'s own stylesheet or fonts');
    }
  }

  if (!html.includes('src="../js/a11y.js"')) errors.push('missing the accessibility toolbar (../js/a11y.js)');
  for (const page of ['../accessibility.html', '../privacy.html']) {
    if (!html.includes(`href="${page}"`)) errors.push(`footer is missing the link to ${page}`);
  }
  if (isSummary) {
    const articles = html.match(/<article class="summary" data-system="[^"]*">/g) ?? [];
    if (articles.length !== 1 || articles[0] !== `<article class="summary" data-system="${id}">`) {
      errors.push(`needs exactly one <article class="summary" data-system="${id}">`);
    }
    if (!html.includes('data-print')) errors.push('missing the print / PDF button');
  }
  return [...new Set(errors)];
}
