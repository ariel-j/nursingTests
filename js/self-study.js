// Self-study page: loads each prompt file into its preview and wires its copy button.
const statusEl = document.getElementById('copy-status');

async function setup(section) {
  const pre = section.querySelector('.doc-text');
  const copy = section.querySelector('.copy');
  pre.dir = section.dataset.dir;

  let text;
  try {
    const res = await fetch(section.dataset.src, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    console.error(err);
    pre.textContent = 'לא הצלחנו לטעון את הקובץ. אפשר להוריד אותו בכפתור למעלה.';
    return;
  }
  pre.textContent = text;
  if (!navigator.clipboard) return;
  copy.disabled = false;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      statusEl.textContent = 'הועתק ללוח.';
    } catch {
      statusEl.textContent = 'ההעתקה נכשלה. אפשר להוריד את הקובץ במקום.';
    }
  });
}

document.querySelectorAll('.doc-file').forEach(setup);
