export function searchBatches(batch) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(batch.runId || '') || typeof batch.summary !== 'string' || !Array.isArray(batch.jobs) || batch.jobs.length > 20) throw new Error('Expected a safe runId, summary, and at most 20 researched jobs.');
  const n = Math.max(1, Math.ceil(batch.jobs.length / 5));
  return Array.from({length:n}, (_,i) => ({runId:`${batch.runId}-part${i+1}`, summary:batch.summary, jobs:batch.jobs.slice(i*5,i*5+5)}));
}
