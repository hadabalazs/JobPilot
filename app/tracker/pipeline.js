/** Status transitions with event logging and follow-up scheduling. Pure functions; caller persists. */
import { canTransition } from '../schemas/job.js';
import { ulid, nowIso } from '../ids.js';
/** @param force skip the suggested-path check — the user may move a job anywhere they like. */
export function transition(job, to, { followUpDays = 7, note = '', force = false } = {}) {
  if (job.status === to) throw new Error(`Already in ${to}`);
  if (!force && !canTransition(job.status, to)) throw new Error(`Cannot move ${job.status} → ${to}`);
  const at = nowIso();
  const skipped = force && !canTransition(job.status, to);
  const events = [{ id: ulid(), jobId: job.id, at, kind: 'status_change', fromStatus: job.status, toStatus: to, payload: { ...(note ? { note } : {}), ...(skipped ? { skippedStages: true } : {}) } }];
  if (to === 'applied') {
    const due = new Date(Date.now() + followUpDays * 864e5).toISOString();
    events.push({ id: ulid(), jobId: job.id, at: due, kind: 'follow_up_due', fromStatus: null, toStatus: null, payload: { scheduledAt: at } });
  }
  return { job: { ...job, status: to, updatedAt: at, archived: to === 'archived' ? 1 : 0 }, events };
}
export function digest(jobs, events, now = Date.now()) {
  const counts = {};
  for (const j of jobs) counts[j.status] = (counts[j.status] || 0) + 1;
  const untailored = jobs.filter(j => ['inbox', 'scored', 'selected'].includes(j.status)).sort((a, b) => (b.localScore || 0) - (a.localScore || 0)).slice(0, 5);
  const due = events.filter(e => e.kind === 'follow_up_due' && new Date(e.at).getTime() <= now);
  return { counts, untailored, followUpsDue: due };
}
