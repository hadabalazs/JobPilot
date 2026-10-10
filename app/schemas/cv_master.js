/** Master CV schema v2: validation, lossless v1→v2 migration, fact counts. */
import { slug } from '../ids.js';
import { DEFAULT_COMPETENCIES, TAG_TO_COMPETENCY } from './competency_vocab.js';

const PLACEHOLDER_RX = /NEEDS_DETAIL|\bTODO\b|\bTBD\b|placeholder/i;
const STRENGTH_BY_PRIORITY = { high: 3, medium: 2, low: 1 };
/** Expansions for common role slugs found in _meta.target_roles. */
const ROLE_SLUGS = { pm: 'Project Manager', delivery: 'Delivery Manager', delivery_manager: 'Delivery Manager', engagement_manager: 'Engagement Manager', scrum_master: 'Scrum Master', agile_coach: 'Agile Coach', senior_po: 'Senior Product Owner', po: 'Product Owner', program_manager: 'Programme Manager', programme_manager: 'Programme Manager' };

/** Normalises a metrics value of any shape into {key: value} with numbers preserved. */
function normalizeMetrics(m) {
  if (!m) return {};
  if (Array.isArray(m)) { const out = {}; m.forEach((v, i) => { out[`m_${String(i + 1).padStart(2, '0')}`] = v; }); return out; }
  if (typeof m === 'object') return m;
  return { m_01: m };
}

/** @returns {{ok:boolean, errors:string[]}} */
export function validateCVMaster(cv) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };
  req(cv && typeof cv === 'object', 'root must be an object');
  if (!cv || typeof cv !== 'object') return { ok: false, errors };
  req(cv.schema_version === 2, 'schema_version must be 2');
  req(cv.identity && typeof cv.identity.full_name === 'string' && cv.identity.full_name.trim(), 'identity.full_name required');
  req(Array.isArray(cv.summary_variants), 'summary_variants must be an array');
  req(Array.isArray(cv.competencies), 'competencies must be an array');
  req(Array.isArray(cv.experience), 'experience must be an array');
  const ids = new Set();
  const uniq = (id, where) => { if (!id) errors.push(`${where}: missing id`); else if (ids.has(id)) errors.push(`${where}: duplicate id ${id}`); else ids.add(id); };
  (cv.summary_variants || []).forEach((s, i) => { uniq(s.id, `summary_variants[${i}]`); req(typeof s.text === 'string', `summary_variants[${i}].text required`); });
  const compIds = new Set();
  (cv.competencies || []).forEach((c, i) => { uniq(c.id, `competencies[${i}]`); compIds.add(c.id); req(typeof c.label === 'string', `competencies[${i}].label required`); });
  (cv.experience || []).forEach((e, i) => {
    uniq(e.id, `experience[${i}]`);
    req(e.employer && e.title, `experience[${i}] needs employer and title`);
    req(Array.isArray(e.bullets), `experience[${i}].bullets must be an array`);
    (e.bullets || []).forEach((b, j) => {
      uniq(b.id, `experience[${i}].bullets[${j}]`);
      req(typeof b.text === 'string' && b.text.trim(), `bullet ${b.id || j}: text required`);
      (b.competencies || []).forEach(cid => req(compIds.has(cid), `bullet ${b.id}: unknown competency ${cid}`));
      (b.variants || []).forEach(v => uniq(v.id, `bullet ${b.id} variant`));
    });
  });
  (cv.education || []).forEach((e, i) => uniq(e.id, `education[${i}]`));
  (cv.certifications || []).forEach((c, i) => uniq(c.id, `certifications[${i}]`));
  return { ok: errors.length === 0, errors };
}

/** Counts facts so a migration can prove it lost nothing. */
export function factCounts(cv) {
  const exp = cv.experience || [];
  return {
    roles: exp.length,
    bullets: exp.reduce((n, e) => n + (e.bullets || []).length, 0),
    summaries: (cv.summary_variants || []).length,
    education: (cv.education || []).length,
    certifications: (cv.certifications || []).length,
    skills: (cv.skills?.groups || []).reduce((n, g) => n + (g.items || []).length, 0),
    competencies: (cv.competencies || []).length,
  };
}

/** Detects a loose "v1" shape and migrates to v2 without dropping facts. Idempotent on v2 input. */
export function migrateV1toV2(input) {
  if (input && input.schema_version === 2) return structuredClone(input);
  const src = structuredClone(input || {});
  const idn = src.identity || src.personal || src.contact || {};
  const nameParts = [idn.full_name, idn.name, [idn.first_name, idn.last_name].filter(Boolean).join(' ')].filter(Boolean);
  const out = {
    schema_version: 2,
    identity: {
      full_name: nameParts[0] || src.name || '',
      headline: idn.headline || idn.title || src.headline || '',
      location: idn.location || src.location || '',
      email: idn.email || src.email || '',
      phone: idn.phone || src.phone || '',
      links: Array.isArray(idn.links) ? idn.links : (idn.linkedin ? [{ label: 'LinkedIn', url: idn.linkedin }] : []),
      work_authorization: idn.work_authorization || '',
      languages: idn.languages || src.languages || [],
    },
    summary_variants: [],
    competencies: [],
    experience: [],
    education: [],
    certifications: [],
    skills: { groups: [] },
    preferences: src.preferences || {
      target_titles: (src._meta?.target_roles || []).map(r => ROLE_SLUGS[r] || r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
      target_locations: String(src._meta?.target_geography || '').replace(/\(.*?\)/g, '').split(/[\/,]/).map(x => x.trim()).filter(Boolean),
      industries_preferred: [], industries_avoid: [], seniority: '', must_haves: [], deal_breakers: [],
    },
  };
  // summaries — accepts an array, an object keyed by audience, or a single string
  const rawSums = src.summary_variants || src.summaries || (src.summary ? [src.summary] : []);
  const sums = Array.isArray(rawSums)
    ? rawSums
    : Object.entries(rawSums || {}).map(([audience, text]) => (typeof text === 'string' ? { id: `sum_${slug(audience, 20)}`, audience, text } : { audience, ...text }));
  sums.forEach((s, i) => out.summary_variants.push(typeof s === 'string'
    ? { id: `sum_${String(i + 1).padStart(2, '0')}`, audience: 'general', text: s }
    : { id: s.id || `sum_${String(i + 1).padStart(2, '0')}`, audience: s.audience || 'general', text: s.text || '' }));
  // competencies (from explicit list or from tags found on bullets)
  const compMap = new Map();
  const addComp = (label) => { const id = 'c_' + slug(label, 24); if (!compMap.has(id)) compMap.set(id, { id, label, aliases: [] }); return id; };
  (src.competencies || []).forEach(c => { if (typeof c === 'string') addComp(c); else compMap.set(c.id || 'c_' + slug(c.label, 24), { id: c.id || 'c_' + slug(c.label, 24), label: c.label, aliases: c.aliases || [] }); });
  const usedVocab = new Set();
  /** Maps a free-text tag onto the default vocabulary; unmatched tags become bullet keywords. */
  const mapTag = (t) => { const id = TAG_TO_COMPETENCY.get(String(t).toLowerCase()); if (id) { usedVocab.add(id); return id; } return null; };
  // experience
  const roles = src.experience || src.roles || src.work || [];
  roles.forEach((r, i) => {
    const eid = r.id || `exp_${slug(r.employer || r.company || `role${i + 1}`, 16)}`;
    const bullets = (r.bullets || r.achievements || r.highlights || []).map((b, j) => {
      const text = typeof b === 'string' ? b : (b.text || '');
      const rawTags = typeof b === 'string' ? [] : (b.competencies || b.tags || []);
      const comps = [], leftover = [];
      for (const t of rawTags) { if (compMap.has(t)) comps.push(t); else { const v = mapTag(t); if (v) comps.push(v); else leftover.push(t); } }
      return {
        id: (typeof b === 'object' && b.id) || `b_${slug(r.employer || r.company || `role${i + 1}`, 12)}_${String(j + 1).padStart(2, '0')}`,
        text,
        competencies: [...new Set(comps)],
        keywords: [...new Set([...((typeof b === 'object' && b.keywords) || []), ...leftover])],
        metrics: normalizeMetrics(typeof b === 'object' ? b.metrics : null),
        strength: (typeof b === 'object' && (b.strength || STRENGTH_BY_PRIORITY[b.keep_priority])) || 2,
        placeholder: PLACEHOLDER_RX.test(text) || PLACEHOLDER_RX.test((typeof b === 'object' && b.improvement_note) || '') || undefined,
        variants: (typeof b === 'object' && b.variants) || [],
      };
    });
    out.experience.push({
      id: eid, employer: r.employer || r.company || '', title: r.title || r.role || '', location: r.location || '',
      start: r.start || r.start_date || '', end: r.end === undefined ? (r.end_date ?? null) : r.end,
      industry: r.industry || '', context: r.context || r.description || '', bullets,
    });
  });
  // side projects become a role so ids, metrics, guardrails and rendering all apply unchanged
  (src.side_projects || src.projects || []).forEach((sp, i) => {
    const sid = sp.id || `exp_side_${slug(sp.name || `project${i + 1}`, 16)}`;
    const rawTags = sp.tags || [];
    const comps = [], leftover = [];
    for (const t of rawTags) { const v = mapTag(t); if (v) comps.push(v); else leftover.push(t); }
    out.experience.push({
      id: sid, employer: sp.name || '', title: sp.role || 'Side project', location: '', start: sp.start || '', end: sp.end === undefined ? null : sp.end,
      industry: 'side project', context: sp.url || '', kind: 'side_project',
      bullets: [{ id: `b_side_${slug(sp.name || `project${i + 1}`, 12)}_01`, text: sp.summary || '', competencies: [...new Set(comps)], keywords: [...new Set(leftover)], metrics: normalizeMetrics(sp.metrics), strength: 2, variants: [] }],
    });
  });
  out.competencies = [...DEFAULT_COMPETENCIES.filter(c => usedVocab.has(c.id)).map(({ id, label, aliases }) => ({ id, label, aliases })), ...compMap.values()];
  (src.education || []).forEach((e, i) => out.education.push({ id: e.id || `edu_${i + 1}`, institution: e.institution || e.school || '', degree: e.degree || '', start: e.start || '', end: e.end || '' }));
  (src.certifications || src.certs || []).forEach((c, i) => out.certifications.push(typeof c === 'string' ? { id: `cert_${i + 1}`, name: c, issuer: '', year: null } : { id: c.id || `cert_${i + 1}`, name: c.name || '', issuer: c.issuer || '', year: c.year || null }));
  const sk = src.skills;
  if (Array.isArray(sk)) out.skills.groups = [{ label: 'Skills', items: sk }];
  else if (sk && Array.isArray(sk.groups)) out.skills.groups = sk.groups;
  else if (sk && typeof sk === 'object') out.skills.groups = Object.entries(sk).map(([label, items]) => ({ label, items: Array.isArray(items) ? items : [String(items)] }));
  return out;
}

/** Index every referenceable id → object, for guardrails and rendering. */
export function indexCV(cv) {
  const bullets = new Map(), roles = new Map(), summaries = new Map(), variants = new Map();
  for (const e of cv.experience || []) { roles.set(e.id, e); for (const b of e.bullets || []) { bullets.set(b.id, { ...b, roleId: e.id }); for (const v of b.variants || []) variants.set(v.id, { ...v, bulletId: b.id }); } }
  for (const s of cv.summary_variants || []) summaries.set(s.id, s);
  return { bullets, roles, summaries, variants };
}
