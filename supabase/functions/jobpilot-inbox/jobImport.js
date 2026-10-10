/** Jobs-only intake. Never trusts imported ids, scores, statuses, settings or CVs. */
import { canonicalJobUrl } from './jobUrl.js';
export const JOB_IMPORT_EXAMPLE = { jobs: [{ title: 'Delivery Manager', company: 'Example company', location: 'Dubai, UAE', sourceUrl: 'https://example.com/jobs/123', description: 'Paste the full responsibilities and requirements from the posting here. Include enough detail to assess the role.', postingAgeText: '1 day ago (checked today)', notes: 'Why this looks suitable and any requirements to verify.' }] };

const text = (v, max = 2000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const webUrl = v => {
  const s = text(v, 4000);
  if (!s) return '';
  try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; }
  catch { return null; }
};

export function prepareJobImport(payload, existingJobs = []) {
  if (typeof payload === 'string') {
    if (payload.length > 2_000_000) throw new Error('Import is too large. Use a batch under 2 MB.');
    try { payload = JSON.parse(payload); } catch { throw new Error('This is not valid JSON. Paste the complete jobs package or choose its JSON file.'); }
  }
  const entries = Array.isArray(payload) ? payload : payload?.jobs ?? payload?.stores?.jobs;
  if (!Array.isArray(entries) || !entries.length) throw new Error('Expected a non-empty jobs array. Use the example format below.');
  if (entries.length > 200) throw new Error('Import up to 200 jobs at a time.');
  const known = new Set(existingJobs.map(j => canonicalJobUrl(j.sourceUrl)).filter(Boolean));
  const seen = new Set();
  const rows = entries.map((entry, index) => {
    const errors = [];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) entry = {};
    const rawValue = entry.description ?? entry.raw ?? entry.jdRaw ?? entry.jdClean;
    const raw = text(rawValue, 60_000);
    const title = text(entry.title, 300);
    const sourceUrl = webUrl(entry.sourceUrl ?? entry.url ?? entry.link);
    if (!title) errors.push('Title is missing');
    if (raw.length < 80) errors.push('Full job description is missing or too short');
    if (typeof rawValue === 'string' && rawValue.length > 60_000) errors.push('Description is too long (maximum 60,000 characters)');
    if (!sourceUrl) errors.push(sourceUrl === null ? 'Posting link must be a normal http/https URL' : 'Posting link is missing');
    const key = canonicalJobUrl(sourceUrl || '');
    const duplicate = known.has(key) ? 'Already saved' : seen.has(key) ? 'Repeated in this package' : '';
    // Invalid rows must not make a later valid row look like a duplicate.
    if (key && !errors.length) seen.add(key);
    const postingAgeText = text(entry.postingAgeText ?? entry.posted, 200);
    const postedAt = text(entry.postedAt, 100);
    const sourcedAt = text(entry.sourcedAt, 100);
    const links = Array.isArray(entry.links) ? entry.links.slice(0, 20).flatMap(l => {
      const url = webUrl(l?.url); return url ? [{ label: text(l.label, 200) || 'Related link', url }] : [];
    }) : [];
    const notes = text(entry.notes ?? entry.fitNotes, 20_000);
    const input = { title, company: text(entry.company, 300), location: text(entry.location, 300), raw, sourceUrl: sourceUrl || '',
      source: 'job-import', notes, links, postingAgeText,
      postedAt: postedAt && Number.isFinite(Date.parse(postedAt)) ? postedAt : '',
      sourcedAt: sourcedAt && Number.isFinite(Date.parse(sourcedAt)) ? sourcedAt : '' };
    return { index, input, errors, duplicate, ready: !errors.length && !duplicate };
  });
  return { rows, ready: rows.filter(r => r.ready).length, duplicates: rows.filter(r => r.duplicate).length, invalid: rows.filter(r => r.errors.length).length };
}
