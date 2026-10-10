import { test, assert } from './harness.js';
import { loadCV, GOOD_RESULT } from './fixtures/load.js';
import { buildRenderModel } from '../app/render/cvModel.js';
import { roleHeaderLayout } from '../app/render/pdfDoc.js';

test('long role metadata is wrapped separately from the reserved date column', () => {
  const split = (text, width) => text.length <= width ? [text] : [text.slice(0, width), text.slice(width)];
  const h = roleHeaderLayout({ title: 'Senior Software Project Manager', employer: 'Abu Dhabi Commercial Bank (ADCB), Abu Dhabi, UAE', dates: 'Dec 2024 – Present' }, 24, split);
  assert.equal(h.dates, 'Dec 2024 – Present');
  assert.ok(h.titleLines.length > 1);
  assert.ok(h.metaLines.length > 1);
  assert.ok(h.metaLines.every(x => !x.includes('Dec 2024')));
});

// buildPdfBlob touches window/document (loads the vendored jsPDF script), so it
// only runs meaningfully in the browser test runner (tests/run.html), not under
// Node. Guarded rather than split out, so it still shows up in one test list.
test('buildPdfBlob produces a real application/pdf blob', async () => {
  if (typeof window === 'undefined') return; // covered by the browser runner instead
  const { buildPdfBlob } = await import('../app/render/pdfDoc.js');
  const cv = await loadCV();
  const model = buildRenderModel(cv, GOOD_RESULT('j'));
  const blob = await buildPdfBlob(model);
  assert.ok(blob instanceof Blob, 'expected a Blob');
  assert.equal(blob.type, 'application/pdf');
  assert.ok(blob.size > 1000, `expected a real PDF, got ${blob.size} bytes`);
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  assert.equal(String.fromCharCode(...head), '%PDF-');
});

test('buildCoverLetterPdfBlob produces a separate application/pdf blob', async () => {
  if (typeof window === 'undefined') return; // covered by the browser runner instead
  const { buildCoverLetterPdfBlob } = await import('../app/render/pdfDoc.js');
  const cv = await loadCV();
  const result = GOOD_RESULT('j');
  result.cover_letter = {
    subject: 'Application for Delivery Manager',
    paragraphs: ['I am applying for the Delivery Manager role.', 'My experience matches the role requirements.'],
  };
  const model = buildRenderModel(cv, result, { includeCover: true, jobMeta: { company: 'Example Co', title: 'Delivery Manager' } });
  const blob = await buildCoverLetterPdfBlob(model);
  assert.ok(blob instanceof Blob, 'expected a Blob');
  assert.equal(blob.type, 'application/pdf');
  assert.ok(blob.size > 1000, `expected a real PDF, got ${blob.size} bytes`);
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  assert.equal(String.fromCharCode(...head), '%PDF-');
});
