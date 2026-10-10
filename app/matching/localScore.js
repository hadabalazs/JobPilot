/** Deterministic 0–100 pre-filter. Triage, not judgment. Returns a breakdown for the UI. */
import { extractKeywords } from './keywords.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const has = (text, needle) => needle && String(text).toLowerCase().includes(String(needle).toLowerCase());

export function localScore(job, cv) {
  const jd = job.jdClean || job.jdRaw || '';
  const head = `${job.title || ''}\n${jd.slice(0, 600)}`;
  const { terms, competencyHits } = extractKeywords(jd, cv);
  const cvBlob = [
    ...(cv.competencies || []).flatMap(c => [c.label, ...(c.aliases || [])]),
    ...(cv.skills?.groups || []).flatMap(g => g.items || []),
    ...(cv.experience || []).flatMap(e => (e.bullets || []).flatMap(b => [b.text, ...(b.keywords || [])])),
    ...(cv.certifications || []).map(c => c.name),
  ].join(' \n ').toLowerCase();

  // 1. Keyword coverage (0–55): weighted share of JD terms present anywhere in the CV
  // Alias/skill terms come from the CV's own vocabulary, so they always match; weight them down
  // and let JD-native phrases carry the signal, otherwise every JD scores 100%.
  let wTotal = 0, wHit = 0; const hit = [], miss = [];
  for (const t of terms) {
    const w = t.source === 'phrase' ? t.weight : t.weight * 0.5;
    wTotal += w;
    if (cvBlob.includes(t.term)) { wHit += w; hit.push(t.term); } else miss.push(t.term);
  }
  const coverage = wTotal ? wHit / wTotal : 0;
  const kw = Math.round(coverage * 55);

  // 2. Competency breadth (0–15): how many distinct competencies the JD touched that the CV has bullets for
  const cvComp = new Set((cv.experience || []).flatMap(e => (e.bullets || []).flatMap(b => b.competencies || [])));
  const jdComp = Object.keys(competencyHits);
  const compCovered = jdComp.filter(c => cvComp.has(c)).length;
  const comp = jdComp.length ? Math.round((compCovered / jdComp.length) * 15) : 8;

  // 3. Title match (0–15)
  const pref = cv.preferences || {};
  const titleHit = (pref.target_titles || []).find(t => has(head, t));
  const title = titleHit ? 15 : ((pref.target_titles || []).some(t => t.split(' ').some(w => w.length > 4 && has(head, w))) ? 7 : 0);

  // 4. Location (0–10)
  const locHit = (pref.target_locations || []).find(l => has(`${job.location || ''} ${jd.slice(0, 800)}`, l));
  const loc = locHit ? 10 : (job.location ? 0 : 5);

  // 5. Industry (+5) and penalties
  const ind = (pref.industries_preferred || []).some(i => has(jd, i)) ? 5 : 0;
  const avoid = (pref.industries_avoid || []).filter(i => has(jd, i));
  const deal = (pref.deal_breakers || []).filter(d => has(jd, d));
  const penalty = avoid.length * 20 + deal.length * 40;

  const score = clamp(Math.round(kw + comp + title + loc + ind - penalty), 0, 100);
  return {
    score,
    breakdown: { keywordCoverage: kw, coveragePct: Math.round(coverage * 100), competencies: comp, title, location: loc, industry: ind, penalty },
    hits: hit.slice(0, 25), misses: miss.slice(0, 25), titleHit: titleHit || null, locationHit: locHit || null, avoid, dealBreakers: deal,
  };
}
export function bandFor(score) { return score >= 75 ? 'strong' : score >= 55 ? 'good' : score >= 35 ? 'stretch' : 'poor'; }
