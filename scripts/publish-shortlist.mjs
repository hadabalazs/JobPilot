import fs from 'node:fs/promises';
import path from 'node:path';
import { excludedJobs } from './exclusions.mjs';
const [connectionPath, packagePath] = process.argv.slice(2);
if (!connectionPath || !packagePath) throw new Error('Usage: node scripts/publish-shortlist.mjs CONNECTION_FILE SHORTLIST_FILE');
const config = JSON.parse(await fs.readFile(connectionPath,'utf8'));
const endpoint = new URL(config.endpoint);
if (endpoint.origin !== 'https://ljgkuuhhnivdnfejitjj.supabase.co' || endpoint.pathname !== '/functions/v1/jobpilot-inbox') throw new Error('Unexpected publish destination');
if (!/^jp_[A-Za-z0-9_-]{43}$/.test(config.writeKey || '')) throw new Error('Missing private publisher key');
const batch = JSON.parse(await fs.readFile(packagePath,'utf8'));
if (!batch.runId || !Array.isArray(batch.jobs) || batch.jobs.length > 5 || typeof batch.summary !== 'string') throw new Error('Expected runId, summary and up to five jobs');
const exclusionsPath = config.exclusionsPath || path.join(path.dirname(connectionPath), 'jobpilot-existing-jobs.json');
// Missing history is an error: publishing without deduplication is not a safe fallback.
const history = JSON.parse(await fs.readFile(exclusionsPath, 'utf8'));
const excluded = excludedJobs(batch.jobs, history);
if (excluded.length) throw new Error(`Package contains ${excluded.length} previously included job(s); research replacements before publishing.`);
const body = JSON.stringify(batch);
let response;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    response = await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${config.writeKey}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(30000)});
    if (response.status < 500 && response.status !== 429) break;
  } catch { if (attempt === 2) throw new Error('Publish connection failed; package retained for retry.'); }
  if (attempt < 2) await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
}
const result = await response.json();
if (!response.ok) throw new Error(`Publish failed (${response.status}): ${result.error || 'unknown error'}`);
if (result.runId !== batch.runId || !Number.isInteger(result.added)) throw new Error('Import was not confirmed');
await fs.writeFile(path.resolve(packagePath)+'.receipt.json',JSON.stringify({...result,confirmedAt:new Date().toISOString()},null,2));
console.log(JSON.stringify(result));
