import { canonicalJobUrl } from '../intake/jobUrl.js';
export const decisionNames = ['unseen','keep','pass'];
export function swipeDirection(dx, dy, width = 360) {
  return Math.abs(dx) >= Math.min(100, width * 0.25) && Math.abs(dx) > Math.abs(dy) * 1.4 ? (dx > 0 ? 'keep' : 'pass') : null;
}
export function matchingJob(job, existing) {
  const role = j => [j.company,j.title,j.location].map(s => String(s || '').toLowerCase().replace(/\s+/g,' ').trim()).join('|');
  return existing.find(j => (job.sourceUrl && canonicalJobUrl(j.sourceUrl) === canonicalJobUrl(job.sourceUrl)) || role(j) === role(job));
}
export function reviewError(error) {
  if (error?.code === '42501') return 'This account does not have access to JobPilot.';
  if (error?.code === '40001') return 'This job changed on another device. The queue has been refreshed; please check it before trying again.';
  if (error?.code === 'PGRST301' || error?.code === 'PGRST303') return 'Your session has expired. Please sign in again.';
  return 'Could not confirm with the server. Check your connection and refresh before trying again.';
}
export async function reviewFeed(client) {
  const rows = []; let cursor = '0'; let latestRun = null;
  for (let page = 0; page < 100; page++) {
    const {data,error} = await client.rpc('jobpilot_review_feed',{p_after:cursor}).abortSignal(AbortSignal.timeout(20000));
    if (error) throw Object.assign(new Error(reviewError(error)),{code:error.code});
    if (!data || !Array.isArray(data.jobs)) throw new Error('Unexpected review queue response.');
    for (const row of data.jobs) {
      if (!/^\d+$/.test(row.id) || BigInt(row.id) <= BigInt(cursor) || !decisionNames.includes(row.decision) || !Number.isInteger(row.revision)) throw new Error('Unexpected review queue order.');
      cursor = row.id; rows.push(row);
    }
    latestRun = data.latestRun;
    if (data.jobs.length < 100) return {jobs:rows,latestRun,checkedAt:new Date().toISOString()};
  }
  throw new Error('The review queue is too large to load. Please contact support.');
}
export async function saveDecision(client,row,decision,mutationId = crypto.randomUUID()) {
  if (!decisionNames.includes(decision)) throw new Error('Invalid swipe decision.');
  const {data,error} = await client.rpc('jobpilot_decide',{p_job_id:row.id,p_decision:decision,p_revision:row.revision,p_mutation_id:mutationId}).abortSignal(AbortSignal.timeout(20000));
  if (error) throw Object.assign(new Error(reviewError(error)),{code:error.code});
  if (data?.id !== row.id || data?.decision !== decision || !Number.isInteger(data?.revision)) throw new Error('Could not confirm the saved decision. Please refresh.');
  return {...row,...data};
}
