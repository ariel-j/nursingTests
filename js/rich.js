// The tiny markup the interactive summaries' widget text uses (no DOM; checked by the Node tests), so
// the DOM code can build nodes instead of innerHTML:
//   **bold**   `Latin text` (kept left-to-right, shown in the .en style)   \n (line break)
// The two can nest: **`Neostigmine`** is bold and Latin.

/** Split a marked-up string into segments: { text, bold, en } or { br: true }. */
export function parseRich(source) {
  const segments = [];
  let bold = false;
  let en = false;
  let text = '';
  const flush = () => {
    if (text !== '') segments.push({ text, bold, en });
    text = '';
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '*' && source[i + 1] === '*') {
      flush();
      bold = !bold;
      i++;
    } else if (ch === '`') {
      flush();
      en = !en;
    } else if (ch === '\n') {
      flush();
      segments.push({ br: true });
    } else {
      text += ch;
    }
  }
  flush();
  return segments;
}

/** True when every ** and ` in the string is closed (a typo would otherwise bold the rest of the page). */
export function isBalanced(source) {
  const bolds = source.split('**').length - 1;
  const ticks = source.split('`').length - 1;
  return bolds % 2 === 0 && ticks % 2 === 0;
}
