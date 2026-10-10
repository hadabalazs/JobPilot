/** Local diagnostics, not an employer's ATS score or hiring prediction. */
import { sectionWeights } from './keywords.js';
import { cleanJD } from '../intake/clean.js';
const STOP = new Set('a an the and or of to in on for with at by from as is are be will you your our we this that these those it its their they them can may must should have has had not no than more most very into over under about across within without per each all any some such other also etc including includes include ability able strong excellent good great proven experience experienced years year skills skill knowledge working work team teams role roles business company candidate ideal required requirement requirements responsibilities responsibility responsible ensure ensuring deliver delivering drive driving manage managing lead leading build building help helping join looking seeking opportunity opportunities environment organisation organization plus who what when where preferred desirable essential qualifications benefits degree'.split(' '));
const TERMS = [
  [/\b(jira|confluence|azure devops|ms project|microsoft project|monday\.com|asana|smartsheet|servicenow|sap|salesforce|tableau|power ?bi|looker|sql|python|excel|miro|figma|slack|planview|rally|trello|notion|sharepoint|workday|kubernetes|docker|aws|java|javascript|typescript|react|snowflake|airflow)\b/gi, 'tool'],
  [/\b(pmp|prince2|pmi-acp|csm|cspo|psm ?i{1,3}|safe agilist|itil)\b/gi, 'cert'],
  [/\b(safe|scaled agile framework|scrum|kanban|agile|waterfall|devops|ci\/cd|okrs?|kpis?|lean|six sigma|design thinking|sprint planning|pi planning|backlog refinement|retrospectives?)\b/gi, 'method'],
  [/\b(project management|program(?:me)? management|stakeholder management|risk management|change management|software implementation|digital transformation|resource allocation|budget management|cross-functional|vendor management|product ownership|release management|data analysis|machine learning|customer success|financial services|regulatory compliance)\b/gi, 'phrase'],
];
// Editorial noise is not a skill. Keep fallback extraction conservative and inspectable.
for (const word of 'ideally track record multiple similar safe level executives run party third end own scale highly demonstrated minimum relevant ability mandatory qualifications required requirements experienced experience excellent strong skills responsibilities preferred seeking looking candidate candidates company join senior junior'.split(' ')) STOP.add(word);
const PHRASE_END = /^(management|delivery|planning|analysis|engineering|development|design|ownership|negotiation|coordination|banking|services|compliance|transformation|architecture|security|operations|testing|research|support|marketing|sales|leadership|allocation|onboarding|metrics|time|journeys|stakeholders|pipelines|agile)$/;
export const normalizeTerm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim().replace(/\s+/g, ' ');
const esc = s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
export function termCount(text, term) {
  const t = normalizeTerm(term);
  if (!t) return 0;
  return [...normalizeTerm(text).matchAll(new RegExp('(?:^| )' + esc(t) + '(?= |$)', 'gu'))].length;
}
export const hasTerm = (text, term) => termCount(text, term) > 0;
export const cleanJobTitle = title => String(title || '').split(/\s*\|\s*/)[0].trim();
export function extractAtsKeywords(jd, { jobTitle = '', excludedTerms = [] } = {}) {
  const scores = new Map(), excluded = new Set(excludedTerms.map(normalizeTerm));
  const bump = (raw, weight, type, line, required = false, preferred = false) => {
    const term = normalizeTerm(raw);
    if (!term || term.length < 2 || excluded.has(term)) return;
    const cur = scores.get(term) || { term, weight: 0, count: 0, type, sources: [], inRequirements: false, preferred: false };
    cur.weight += weight; cur.count++;
    if (type !== 'phrase') cur.type = type;
    cur.inRequirements ||= required; cur.preferred ||= preferred;
    if (line && !cur.sources.includes(line)) cur.sources.push(line);
    scores.set(term, cur);
  };
  for (const { line, weight } of sectionWeights(cleanJD(jd))) {
    if (!line.trim() || weight < 1 || /^(requirements?|qualifications?|responsibilities|nice to have|preferred|essential)\s*:?$/i.test(line.trim())) continue;
    if (/^(join|at)\s/i.test(line.trim())) continue;
    const preferred = /\b(preferred|desirable|bonus|nice to have|not required)\b/i.test(line) || weight === 1.2;
    const required = !preferred && (weight === 2 || /\b(must|required|essential|mandatory)\b/i.test(line));
    const w = preferred ? 1 : required ? 2 : weight;
    for (const [rx, type] of TERMS) for (const m of line.matchAll(rx)) {
      if (m[0].toLowerCase() === 'safe' && m[0] !== 'SAFe' && !/agile|scrum|framework/i.test(line)) continue;
      bump(m[0], w * 3, type, line, required, preferred);
    }
    // Do not form phrases across punctuation or remove stopwords before pairing.
    for (const clause of line.split(/[.,;:()[\]]/)) {
      const tokens = normalizeTerm(clause).split(' ');
      for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (STOP.has(t) || t.length < 4 || /^\d/.test(t)) continue;
      bump(t, w * .4, 'phrase', line, required, preferred);
      const next = tokens[i + 1];
      if (next && PHRASE_END.test(next) && !STOP.has(next)) bump(t + ' ' + next, w, 'phrase', line, required, preferred);
      }
    }
  }
  const title = cleanJobTitle(jobTitle);
  if (title) bump(title, 8, 'title', 'Job title: ' + title);
  return [...scores.values()].sort((a, b) => b.weight - a.weight).slice(0, 40).map(k => ({ ...k,
    weight: Math.round(k.weight * 10) / 10,
    priority: k.inRequirements && k.weight >= 5 ? 'critical' : k.weight >= 3 && !k.preferred ? 'high' : 'normal',
  }));
}
export function renderedZones(model) {
  return {
    summary: model.summary || '',
    skills: (model.skills || []).flatMap(g => [g.label, ...(g.items || [])]).join('\n'),
    experience: (model.experience || []).flatMap(e => [e.title, e.employer, e.context || '', ...(e.bullets || []).map(b => b.text)]).join('\n'),
    rest: [model.identity?.headline, model.identity?.location,
      ...(model.education || []).map(e => e.degree + ' ' + e.institution),
      ...(model.certifications || []).map(c => c.name + ' ' + (c.issuer || '')),
      ...(model.languages || []).map(l => typeof l === 'string' ? l : l.name + ' ' + (l.level || '')),
    ].filter(Boolean).join('\n'),
  };
}
/** Actual CV content only. Taxonomy, aliases and placeholders are not evidence. */
export function masterEvidence(cv) {
  if (!cv) return [];
  return [
    { label: 'Headline', text: cv.identity?.headline || '' },
    { label: 'Location', text: cv.identity?.location || '' },
    ...(cv.summary_variants || []).map(s => ({ label: 'Summary', text: s.text })),
    ...(cv.skills?.groups || []).flatMap(g => (g.items || []).map(text => ({ label: 'Skills: ' + g.label, text }))),
    ...(cv.experience || []).flatMap(e => [
      { label: e.employer, text: e.title + ' ' + (e.context || '') },
      ...(e.bullets || []).filter(b => !b.placeholder).flatMap(b => [
        { label: e.employer + ' · ' + b.id, text: b.text },
        ...(b.variants || []).map(v => ({ label: e.employer + ' · ' + b.id + ' variant', text: v.text })),
      ]),
    ]),
    ...(cv.education || []).map(e => ({ label: 'Education', text: e.degree + ' ' + e.institution })),
    ...(cv.certifications || []).map(c => ({ label: 'Certification', text: c.name + ' ' + (c.issuer || '') })),
    ...(cv.identity?.languages || []).map(l => ({ label: 'Language', text: typeof l === 'string' ? l : l.name + ' ' + (l.level || '') })),
  ].filter(e => e.text);
}
export function screeningRequirements(jd) {
  return [...new Set(cleanJD(jd).split('\n').filter(l => /\b(work authori[sz]ation|right to work|visa|sponsor(?:ship)?|relocat\w*|on[- ]site|hybrid|travel|clearance|licen[cs]e|certif\w*|degree|bachelor|master'?s degree|fluent|fluency|\d+\+?\s*years|salary|notice period)\b/i.test(l)))].slice(0, 16);
}
export function plainCvText(model) {
  const i = model.identity || {};
  return [i.full_name, i.headline, [i.location, i.email, i.phone, ...(i.links || []).map(l => l.url), i.linkedin].filter(Boolean).join(' · '),
    'SUMMARY', model.summary, 'SKILLS', ...(model.skills || []).map(g => g.label + ': ' + g.items.join(', ')),
    'WORK EXPERIENCE', ...(model.experience || []).flatMap(e => [e.title + ' — ' + e.employer, [e.location, e.dates].filter(Boolean).join(' · '), e.context, ...e.bullets.map(b => '• ' + b.text)]),
    'EDUCATION', ...(model.education || []).map(e => [e.degree, e.institution, e.start, e.end].filter(Boolean).join(' — ')),
    'CERTIFICATIONS', ...(model.certifications || []).map(c => [c.name, c.issuer, c.year].filter(Boolean).join(' — ')),
    'LANGUAGES', ...(model.languages || []).map(l => typeof l === 'string' ? l : l.name + (l.level ? ' — ' + l.level : '')),
  ].filter(Boolean).join('\n');
}
export function atsAudit(model, jd, { jobTitle = '', pageEstimate = null, masterCv = null, excludedTerms = [] } = {}) {
  const keywords = extractAtsKeywords(jd, { jobTitle, excludedTerms });
  const z = renderedZones(model), evidence = masterEvidence(masterCv);
  const hits = keywords.map(k => {
    const zones = Object.keys(z).filter(zone => hasTerm(z[zone], k.term));
    const sources = evidence.filter(e => hasTerm(e.text, k.term));
    return { ...k, present: zones.length > 0, zones, occurrences: Object.values(z).reduce((n, t) => n + termCount(t, k.term), 0), supportable: sources.length > 0, evidence: sources.slice(0, 3) };
  });
  const present = hits.filter(k => k.present), missing = hits.filter(k => !k.present);
  const keywordScore = hits.length ? Math.round(present.length / hits.length * 100) : null;
  const missingFixable = missing.filter(k => k.supportable), genuineGaps = missing.filter(k => !k.supportable);
  const stuffed = hits.filter(k => termCount(z.summary, k.term) > 4 || termCount(z.skills, k.term) > 4);
  const bullets = (model.experience || []).flatMap(e => (e.bullets || []).map(b => b.text));
  const quantified = bullets.filter(t => /\d/.test(t));
  const checks = [
    { id: 'single_column', label: 'Single-column export template', pass: true, note: 'This app uses a linear layout; complex columns and tables can impair parsing.' },
    { id: 'standard_headings', label: 'Conventional section headings', pass: true, note: 'The template labels work experience, skills and education.' },
    { id: 'contact_in_body', label: 'Name and contact details in document body', pass: !!(model.identity?.full_name && (model.identity?.email || model.identity?.phone)), note: 'Check these fields again after uploading to the employer.' },
    { id: 'selectable_text', label: 'Text-based export design', pass: true, note: 'Template check only. Open the downloaded PDF and test copying its text; this is not an external parser test.' },
    { id: 'dates', label: 'Readable employment dates', pass: !!model.experience?.length && model.experience.every(e => /^(?:[A-Z][a-z]{2} )?\d{4} – (?:(?:[A-Z][a-z]{2} )?\d{4}|Present)$/.test(e.dates || '')), note: 'Consistent month/year or year-only ranges. Never invent missing dates.' },
    { id: 'skills_section', label: 'Named skills section included', pass: (model.skills || []).some(g => g.items?.length), note: 'Keep relevant, defensible skills. There is no universal ideal count.' },
  ];
  if (pageEstimate) checks.push({ id: 'length', label: 'Within your page target', pass: pageEstimate.pages <= pageEstimate.target, note: 'A readability preference, not a universal ATS rule.' });
  const contentChecks = [{ id: 'no_stuffing', label: 'Review excessive local repetition', pass: !stuffed.length, note: 'A writing heuristic only; repetition across roles can be legitimate. No ATS penalty is assumed.' }];
  return { score: keywordScore ?? 0, keywordScore, structureScore: Math.round(checks.filter(c => c.pass).length / checks.length * 100),
    keywords: hits, present, missing, missingFixable, genuineGaps,
    missingCritical: missing.filter(k => k.priority === 'critical'), missingHigh: missing.filter(k => k.priority === 'high'),
    unverifiedAdditions: present.filter(k => masterCv && !k.supportable), stuffed,
    quantified: { count: quantified.length, total: bullets.length, ratio: bullets.length ? quantified.length / bullets.length : 0 },
    checks: [...checks, ...contentChecks], screening: screeningRequirements(jd),
  };
}
