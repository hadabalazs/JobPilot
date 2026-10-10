/** Build a compact subset of the master CV for a given JD, within a character budget. */
import { extractKeywords } from '../matching/keywords.js';
import { extractAtsKeywords, hasTerm } from '../matching/ats.js';

const yearOf = s => parseInt(String(s || '').slice(0, 4), 10) || 0;

export function buildSlice(cv, jd, { charBudget = 14000, recentRoles = 3, olderCap = 4 } = {}) {
  const { terms, competencyHits } = extractKeywords(jd, cv);
  const termSet = new Set(terms.map(t => t.term));
  const hitComp = new Set(Object.keys(competencyHits));
  const roleTerms = extractAtsKeywords(jd);
  const roles = [...(cv.experience || [])].sort((a, b) => (b.end === null ? 9999 : yearOf(b.end)) - (a.end === null ? 9999 : yearOf(a.end)));
  const relevance = b => roleTerms.reduce((sum, k) => sum + (hasTerm(b.text, k.term) ? (k.priority === 'critical' ? 3 : 1) : 0), 0) + (b.competencies || []).filter(c => hitComp.has(c)).length * 2 + (b.keywords || []).filter(k => termSet.has(k.toLowerCase())).length + (b.strength || 1);
  const experience = roles.map((r, i) => {
    let bullets = (r.bullets || []).filter(b => !b.placeholder).map(b => ({ id: b.id, text: b.text, competencies: b.competencies || [], keywords: b.keywords || [], metrics: b.metrics || {}, variants: (b.variants || []).map(v => ({ id: v.id, text: v.text })) }));
    if (i >= recentRoles) bullets = bullets.map(b => ({ b, s: relevance(r.bullets.find(x => x.id === b.id) || {}) })).sort((x, y) => y.s - x.s).slice(0, olderCap).map(x => x.b);
    return { id: r.id, employer: r.employer, title: r.title, location: r.location, start: r.start, end: r.end, industry: r.industry, context: r.context, bullets };
  });
  const slice = {
    identity: { full_name: cv.identity.full_name, headline: cv.identity.headline, location: cv.identity.location, languages: cv.identity.languages || [] },
    summary_variants: cv.summary_variants || [],
    competencies: (cv.competencies || []).map(c => ({ id: c.id, label: c.label, aliases: c.aliases || [] })),
    experience,
    education: cv.education || [],
    certifications: cv.certifications || [],
    skills: cv.skills || { groups: [] },
    tailoring_context: cv.tailoring_context || { certifications: [], professional_context: '' },
  };
  // Trim the least relevant evidence, not simply the oldest. Preserve a recent-role floor.
  let text = JSON.stringify(slice);
  while (text.length > charBudget) {
    const candidates = slice.experience.flatMap((r, ri) => r.bullets.length > (ri < recentRoles ? 2 : 0) ? r.bullets.map((b, bi) => ({ ri, bi, score: relevance(b) + (ri < recentRoles ? 1 : 0) })) : []);
    candidates.sort((a, b) => a.score - b.score || b.ri - a.ri || b.bi - a.bi);
    if (!candidates.length) break;
    const { ri, bi } = candidates[0]; slice.experience[ri].bullets.splice(bi, 1);
    text = JSON.stringify(slice);
  }
  return { slice, chars: text.length, estTokens: Math.ceil(text.length / 4), includedBulletIds: slice.experience.flatMap(e => e.bullets.map(b => b.id)) };
}
