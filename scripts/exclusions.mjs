import { canonicalJobUrl } from '../app/intake/jobUrl.js';

const normalized = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function excludedJobs(jobs, history) {
  const previous = history.jobs || [];
  const urls = new Set([...previous.flatMap(j => [j.sourceUrl, ...(j.links || []).map(l => l.url)]), ...(history.previousReportLinks || [])].filter(Boolean).map(canonicalJobUrl));
  return jobs.filter(job => {
    const company = normalized(job.company);
    if ((history.excludedCompanies || []).some(name => {
      const excluded = normalized(name);
      return excluded && (company === excluded || company.startsWith(excluded + ' '));
    })) return true;
    const links = [job.sourceUrl, ...(job.links || []).map(l => l.url)].filter(Boolean);
    if (links.some(url => urls.has(canonicalJobUrl(url)))) return true;
    // Ignore location variants for an exact employer/title match: repeat listings
    // in Dubai vs United Arab Emirates must not create a fresh recommendation.
    return previous.some(old => normalized(old.company) && normalized(old.company) === normalized(job.company) && normalized(old.title) === normalized(job.title));
  });
}
