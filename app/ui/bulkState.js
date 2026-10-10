/** Pure queue helpers; a schema-valid response can still require evidence review. */
export const needsReview = row => row.state === 'done' && (!row.passed || row.hardFailures?.length > 0 || row.warnings?.length > 0);
export const pendingRow = row => ['queued', 'cancelled', 'skipped'].includes(row.state);
export function completedRow(run) {
  return { state: 'done', score: run.fitScore?.score ?? run.result.fit.score, verdict: run.fitScore?.band ?? run.result.fit.verdict, modelScore: run.fitScore?.modelOpinion ?? run.result.fit.score, passed: run.report.passed,
    hardFailures: run.report.hardFailures || [], warnings: run.report.warnings || [], repair: run.repair, cost: run.costUsd };
}
export function queueSummary(rows) {
  return { ready: rows.filter(r => r.state === 'done' && !needsReview(r)).length,
    review: rows.filter(needsReview).length, failed: rows.filter(r => r.state === 'error').length,
    pending: rows.filter(pendingRow).length, processed: rows.filter(r => ['done', 'error'].includes(r.state)).length };
}
