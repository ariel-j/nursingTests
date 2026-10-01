// Summary pages: the print button opens the browser's print dialog, where "Save as PDF" makes the
// PDF (no library needed). css/summary.css holds the print layout.

for (const btn of document.querySelectorAll('[data-print]')) {
  btn.addEventListener('click', () => window.print());
}
