import { canonicalJobUrl } from '../intake/jobUrl.js';
import { prepareJobImport } from '../intake/jobImport.js';
export const DEFAULT_ENDPOINT = 'https://ljgkuuhhnivdnfejitjj.supabase.co/functions/v1/jobpilot-inbox';
export const CONNECTION_KEY = 'jobpilot-daily-inbox-v1';
export function validateConnection(config) {
  if (!config || config.endpoint !== DEFAULT_ENDPOINT || !/^jp_[A-Za-z0-9_-]{43}$/.test(config.readKey || ''))
    throw new Error('Choose your JobPilot connection file.');
  return {endpoint:config.endpoint, readKey:config.readKey};
}
export function loadConnection(storage = localStorage) {
  try { return validateConnection(JSON.parse(storage.getItem(CONNECTION_KEY))); } catch { return null; }
}
export async function getFeed(config, after = '0', fetchImpl = fetch) {
  validateConnection(config);
  if (!/^\d{1,18}$/.test(String(after))) throw new Error('Invalid saved inbox cursor.');
  const response = await fetchImpl(`${config.endpoint}?after=${after}`, {
    headers:{Authorization:`Bearer ${config.readKey}`}, cache:'no-store', signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'Reconnect daily matches: your connection key is no longer valid.' : 'Daily matches could not be reached. Your saved jobs are still available.');
  const data = await response.json();
  if (!data || !Array.isArray(data.jobs) || data.jobs.length > 100) throw new Error('Unexpected inbox response. No jobs were imported.');
  let cursor = BigInt(after);
  for (const row of data.jobs) {
    if (!/^\d{1,18}$/.test(row.id) || BigInt(row.id) <= cursor) throw new Error('Unexpected inbox order. Try again later.');
    cursor = BigInt(row.id);
    const p = prepareJobImport({jobs:[row.job]});
    if (p.invalid) throw new Error('A daily match is incomplete. No sync progress was saved.');
  }
  return data;
}
const roleKey = j => [j.company,j.title,j.location].map(s=>String(s || '').toLowerCase().replace(/\s+/g,' ').trim()).join('|');
export function unseenJobs(rows, existing) {
  const urls = new Set(existing.map(j=>canonicalJobUrl(j.sourceUrl)));
  const roles = new Set(existing.map(roleKey));
  return rows.flatMap(({job})=> {
    const url = canonicalJobUrl(job.sourceUrl); const role = roleKey(job);
    if (urls.has(url) || roles.has(role)) return [];
    urls.add(url); roles.add(role); return [job];
  });
}
// Advance only AFTER a successful local import. A retry is safe even after a crash.
export async function syncFeed({config, getState, saveState, loadJobs, importJobs, cv, fetchImpl = fetch}) {
  let state = await getState() || {cursor:'0'}; let added = 0;
  for (let page = 0; page < 100; page++) {
    const feed = await getFeed(config, state.cursor, fetchImpl);
    const newJobs = unseenJobs(feed.jobs, await loadJobs());
    if (newJobs.length) { const result = await importJobs(newJobs, cv); added += result.added; }
    state = {...state, cursor:feed.jobs.at(-1)?.id || state.cursor, checkedAt:new Date().toISOString(), latestRun:feed.latestRun};
    await saveState(state);
    if (feed.jobs.length < 100) return {...state, added};
  }
  throw new Error('More matches remain. Check again to continue importing.');
}
