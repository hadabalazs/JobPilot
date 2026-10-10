/**
 * Turn a posting link into a stable comparison key. Job-identifying query
 * parameters are preserved; fragments and common tracking parameters are not.
 */
export function canonicalJobUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    // LinkedIn uses several locale hosts, slugs and search URLs for one posting.
    if (/(^|\.)linkedin\.com$/i.test(url.hostname)) {
      const id = url.searchParams.get('currentJobId') || url.searchParams.get('jobId') ||
        url.pathname.match(/\/jobs\/view\/(?:.*-)?(\d+)\/?$/)?.[1];
      if (id && /^\d+$/.test(id)) return `https://linkedin.com/jobs/view/${id}`;
    }
    url.hash = '';
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';

    const tracking = /^(utm_.+|trk|trackingid|ref|refid|source|src|campaign|campaignid)$/i;
    const kept = [...url.searchParams.entries()]
      .filter(([key]) => !tracking.test(key))
      .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv));
    url.search = '';
    for (const [key, val] of kept) url.searchParams.append(key, val);
    return url.toString();
  } catch {
    return value.replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

/** Return the ids of every saved job whose posting link appears more than once. */
export function duplicateJobIds(jobs) {
  const groups = new Map();
  for (const job of jobs || []) {
    const key = canonicalJobUrl(job.sourceUrl);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job.id);
  }
  return new Set([...groups.values()].filter(ids => ids.length > 1).flat());
}
