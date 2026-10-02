// The demo is local to this page. It never changes the downloadable RTF.
'use strict';
const sample = document.getElementById('rtf-live');
const original = sample.innerHTML;
const status = document.getElementById('sample-status');
sample.contentEditable = 'true';
sample.setAttribute('aria-readonly', 'false');
document.getElementById('sample-reset').addEventListener('click', () => {
  sample.innerHTML = original;
  status.textContent = 'Original sample restored.';
});
sample.addEventListener('input', () => {
  status.textContent = 'Preview edited. Changes are not saved.';
});
// Paste plain text, retaining the surrounding sample formatting.
sample.addEventListener('paste', event => {
  event.preventDefault();
  const text = event.clipboardData.getData('text/plain');
  const selection = window.getSelection();
  if (!selection.rangeCount || !sample.contains(selection.anchorNode) ||
      !sample.contains(selection.focusNode)) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  status.textContent = 'Preview edited. Changes are not saved.';
});
sample.addEventListener('drop', event => event.preventDefault());
