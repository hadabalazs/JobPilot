import { test, assert } from './harness.js';

// Only meaningful in the browser (needs IndexedDB); skipped under Node like pdfDoc.
test('backfillBestRunIds reconnects a pre-existing passed run to its job', async () => {
  if (typeof indexedDB === 'undefined') return;
  const store = await import('../app/ui/store.js');
  const { ulid } = await import('../app/ids.js');
  const jobId = ulid();
  await store.db.put('jobs', { id: jobId, title: 'Backfill test', jdClean: 'x', status: 'tailored', archived: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const runId = ulid();
  await store.db.put('tailorRuns', { id: runId, jobId, createdAt: new Date().toISOString(), provider: 'Manual', result: { fit: { score: 70 } }, report: { passed: true, hardFailures: [], warnings: [] } });
  const n = await store.backfillBestRunIds();
  assert.ok(n >= 1);
  const job = await store.loadJob(jobId);
  assert.equal(job.bestRunId, runId);
  // idempotent: second call touches nothing further for this job
  const n2 = await store.backfillBestRunIds();
  const job2 = await store.loadJob(jobId);
  assert.equal(job2.bestRunId, runId);
});
