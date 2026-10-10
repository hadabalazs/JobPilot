/** Map cloud choices to local workflow without rolling back application progress. */
export function isUntailored(job) {
  return !job || (!job.bestRunId && job.fitScore == null && job.aiScore == null && !job.archived && ['inbox','scored'].includes(job.status));
}
export function decisionPatch(job, row) {
  if (row.revision <= (job.cloudReviewRevision || 0)) return null;
  const progress = !['inbox','scored','selected','archived'].includes(job.status) || !!job.bestRunId;
  const manualArchive = job.archived && job.cloudReviewDecision !== 'pass';
  if (progress || manualArchive) return {cloudReviewRevision:row.revision};
  const status = row.decision === 'keep' ? 'selected' : row.decision === 'pass' ? 'archived' : 'scored';
  return {status,archived:status==='archived'?1:0,cloudReviewRevision:row.revision,cloudReviewDecision:row.decision};
}
