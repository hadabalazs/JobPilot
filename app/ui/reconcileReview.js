import { importJobs, loadJobs, loadCV, loadSettings, loadRuns } from './store.js';
import { updateJobWithEvents } from '../db.js';
import { transition } from '../tracker/pipeline.js';
import { matchingJob } from '../cloud/review.js';
import { decisionPatch } from '../cloud/reviewStatus.js';

/** Retryable projection of acknowledged cloud decisions; never invokes tailoring. */
export async function reconcileReview(rows) {
  const run = async () => {
    const [cv,settings] = await Promise.all([loadCV(),loadSettings()]);
    let jobs=await loadJobs(); let changed=false;
    for (const row of rows) {
      let job=matchingJob(row.job,jobs);
      if (!job) {
        await importJobs([row.job],cv); jobs=await loadJobs(); job=matchingJob(row.job,jobs); changed=true;
      }
      if (!job) throw new Error('Could not sync this job to the inbox. Refresh to retry.');
      const runs=await loadRuns(job.id);
      // A run is protected even if an old record has no bestRunId.
      const updated=await updateJobWithEvents(job.id,current => {
        const patch=decisionPatch(runs.length ? {...current,bestRunId:current.bestRunId || 'existing-run'} : current,row);
        if (!patch) return null;
        const next=patch.status && patch.status!==current.status ? transition(current,patch.status,{force:true,followUpDays:settings.followUpDays}) : {job:current,events:[]};
        return {job:{...next.job,...patch,updatedAt:new Date().toISOString()},events:next.events};
      });
      if (updated) { changed=true; jobs=jobs.map(j=>j.id===updated.id ? updated : j); }
    }
    return changed;
  };
  if (globalThis.navigator?.locks) return navigator.locks.request('jobpilot-daily-import',run);
  return run();
}
