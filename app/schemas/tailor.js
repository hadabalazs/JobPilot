/** TailorResult contract: the JSON the AI must return. Single source of truth for prompts and validation. */
export const TAILOR_RESULT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['schema_version', 'job_id', 'fit', 'selection', 'rewrites', 'cover_letter', 'ai_notes', 'self_check'],
  properties: {
    schema_version: { type: 'string', const: 'tailor_result_v1' },
    job_id: { type: 'string' },
    fit: {
      type: 'object', required: ['verdict', 'score', 'matched_requirements', 'missing_requirements', 'keywords_present', 'keywords_absent', 'red_flags'],
      properties: {
        verdict: { type: 'string', enum: ['strong', 'good', 'stretch', 'poor'] },
        score: { type: 'integer', minimum: 0, maximum: 100 },
        matched_requirements: { type: 'array', items: { type: 'object', required: ['requirement', 'evidence_bullet_ids'], properties: { requirement: { type: 'string' }, evidence_bullet_ids: { type: 'array', items: { type: 'string' } } } } },
        missing_requirements: { type: 'array', items: { type: 'object', required: ['requirement', 'severity'], properties: { requirement: { type: 'string' }, severity: { type: 'string', enum: ['must', 'nice'] }, mitigation: { type: ['string', 'null'] } } } },
        keywords_present: { type: 'array', items: { type: 'string' } },
        keywords_absent: { type: 'array', items: { type: 'string' } },
        red_flags: { type: 'array', items: { type: 'string' } },
      },
    },
    selection: {
      type: 'object', required: ['summary_variant_id', 'summary_override', 'bullet_ids_in_order', 'skills_order', 'omit_experience_ids'],
      properties: {
        summary_variant_id: { type: ['string', 'null'] },
        summary_override: { type: ['string', 'null'] },
        bullet_ids_in_order: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
        skills_order: { type: 'array', items: { type: 'string' } },
        skills_selected: { type: ['array', 'null'], items: { type: 'string' }, description: 'Flat, ATS-ordered list of 8-14 skills copied verbatim from the source CV skills, most JD-relevant first. null keeps the original grouping.' },
        omit_experience_ids: { type: 'array', items: { type: 'string' } },
      },
    },
    rewrites: { type: 'array', items: { type: 'object', required: ['bullet_id', 'text', 'reason', 'keywords_injected'], properties: { bullet_id: { type: 'string' }, text: { type: 'string' }, reason: { type: 'string' }, keywords_injected: { type: 'array', items: { type: 'string' } } } } },
    cover_letter: { type: ['object', 'null'], properties: { subject: { type: 'string' }, body_paragraphs: { type: 'array', items: { type: 'string' } }, tone: { type: 'string' } } },
    ai_notes: { type: 'array', items: { type: 'string' } },
    self_check: { type: 'object', properties: { all_ids_exist: { type: 'boolean' }, no_new_numbers: { type: 'boolean' } } },
  },
};

const isStrArr = a => Array.isArray(a) && a.every(x => typeof x === 'string');
const isObject = a => !!a && typeof a === 'object' && !Array.isArray(a);

/** Close the dynamic role map for this particular request, for strict API output. */
export function strictTailorSchema(req) {
  const schema = structuredClone(TAILOR_RESULT_SCHEMA);
  const map = schema.properties.selection.properties.bullet_ids_in_order;
  map.properties = Object.fromEntries((req.slice?.experience || []).map(r => [r.id, { type: 'array', items: { type: 'string' }, description: 'Ordered source bullet IDs; use an empty array if omitted.' }]));
  const close = node => {
    if (node.properties) {
      node.additionalProperties = false;
      node.required = Object.keys(node.properties);
      Object.values(node.properties).forEach(close);
    }
    if (node.items) close(node.items);
  };
  close(schema);
  return schema;
}

const rewriteText = w => w?.text ?? w?.new_text ?? w?.rewritten_text ?? w?.revised_text ?? w?.rewrite;
const rewriteId = w => w?.bullet_id ?? w?.bulletId ?? w?.target_bullet_id ?? w?.targetBulletId ?? w?.source_bullet_id;

/**
 * Recover common model representation differences without inventing content.
 * An unusable rewrite is omitted rather than making an otherwise valid tailored
 * selection fail; wording without a source bullet id cannot safely be applied.
 */
export function repairTailorShape(input, req = {}) {
  if (!isObject(input)) return { value: input, repairs: [] };
  const value = structuredClone(input), repairs = [];
  let rewrites = value.rewrites ?? value.bullet_rewrites ?? value.rewrite;
  if (typeof rewrites === 'string' && /^[\[{]/.test(rewrites.trim())) {
    try { rewrites = JSON.parse(rewrites); } catch { /* validation reports it */ }
  }
  if (rewrites === null || rewrites === undefined || rewrites === '') rewrites = [];
  else if (isObject(rewrites)) {
    const nested = rewrites.items ?? rewrites.rewrites ?? rewrites.bullet_rewrites;
    if (Array.isArray(nested)) rewrites = nested;
    else if (typeof rewriteId(rewrites) === 'string' && typeof rewriteText(rewrites) === 'string') rewrites = [rewrites];
    else {
      const entries = Object.entries(rewrites);
      if (entries.every(([, w]) => typeof w === 'string' || (isObject(w) && typeof rewriteText(w) === 'string'))) {
        rewrites = entries.map(([id, w]) => typeof w === 'string' ? { bullet_id: id, text: w } : { ...w, bullet_id: rewriteId(w) || id });
      }
    }
  }
  const selectedIds = Object.values(req?.slice?.experience?.length
    ? Object.fromEntries(req.slice.experience.map(role => [role.id, (role.bullets || []).map(b => b.id)]))
    : (value.selection?.bullet_ids_in_order || {})).flat().filter(Boolean);
  if (Array.isArray(rewrites)) {
    let omitted = 0;
    rewrites = rewrites.map((w, i) => {
      if (typeof w === 'string') return selectedIds.length === rewrites.length ? { bullet_id: selectedIds[i], text: w } : null;
      if (!isObject(w)) return null;
      const bullet_id = rewriteId(w), text = rewriteText(w);
      if (typeof bullet_id !== 'string' || typeof text !== 'string' || !text.trim()) return null;
      return { ...w, bullet_id, text, reason: w.reason ?? w.rationale ?? w.why ?? '', keywords_injected: w.keywords_injected ?? w.keywords ?? [] };
    }).filter(w => w || (++omitted && false));
    if (!Array.isArray(value.rewrites) || JSON.stringify(rewrites) !== JSON.stringify(value.rewrites)) repairs.push('Normalised the rewrite list while preserving every rewrite tied to a source bullet.');
    if (omitted) repairs.push(`Ignored ${omitted} rewrite entr${omitted === 1 ? 'y' : 'ies'} that had no usable source bullet id and text.`);
    value.rewrites = rewrites;
  } else {
    value.rewrites = [];
    repairs.push('Ignored an unusable rewrite value because it could not be tied safely to a source bullet.');
  }
  return { value, repairs };
}

/** Structural validation only (no CV knowledge). Guardrails do the semantic checks. */
export function validateTailorResult(r) {
  const errors = [];
  const e = m => errors.push(m);
  if (!isObject(r)) return { ok: false, errors: ['result must be an object'] };
  if (r.schema_version !== 'tailor_result_v1') e('schema_version must be "tailor_result_v1"');
  if (typeof r.job_id !== 'string') e('job_id must be a string');
  const f = r.fit;
  if (!f || typeof f !== 'object') e('fit missing');
  else {
    if (!['strong', 'good', 'stretch', 'poor'].includes(f.verdict)) e('fit.verdict invalid');
    if (!Number.isInteger(f.score) || f.score < 0 || f.score > 100) e('fit.score must be integer 0–100');
    if (!Array.isArray(f.matched_requirements)) e('fit.matched_requirements must be array');
    else f.matched_requirements.forEach((m, i) => { if (!isObject(m) || typeof m.requirement !== 'string' || !isStrArr(m.evidence_bullet_ids)) e(`fit.matched_requirements[${i}] malformed`); });
    if (!Array.isArray(f.missing_requirements)) e('fit.missing_requirements must be array');
    else f.missing_requirements.forEach((m, i) => { if (!isObject(m) || typeof m.requirement !== 'string' || !['must', 'nice'].includes(m.severity)) e(`fit.missing_requirements[${i}] malformed`); });
    ['keywords_present', 'keywords_absent', 'red_flags'].forEach(k => { if (!isStrArr(f[k])) e(`fit.${k} must be string array`); });
  }
  const s = r.selection;
  if (!s || typeof s !== 'object') e('selection missing');
  else {
    if (s.summary_variant_id !== null && typeof s.summary_variant_id !== 'string') e('selection.summary_variant_id must be string|null');
    if (s.summary_override !== null && s.summary_override !== undefined && typeof s.summary_override !== 'string') e('selection.summary_override must be string|null');
    if (!s.bullet_ids_in_order || typeof s.bullet_ids_in_order !== 'object' || Array.isArray(s.bullet_ids_in_order)) e('selection.bullet_ids_in_order must be an object');
    else Object.entries(s.bullet_ids_in_order).forEach(([k, v]) => { if (!isStrArr(v)) e(`selection.bullet_ids_in_order.${k} must be string array`); });
    if (!isStrArr(s.skills_order || [])) e('selection.skills_order must be string array');
    if (s.skills_selected !== null && s.skills_selected !== undefined && !isStrArr(s.skills_selected)) e('selection.skills_selected must be string array or null');
    if (!isStrArr(s.omit_experience_ids || [])) e('selection.omit_experience_ids must be string array');
  }
  if (!Array.isArray(r.rewrites)) e('rewrites must be array');
  else r.rewrites.forEach((w, i) => {
    if (!isObject(w) || typeof w.bullet_id !== 'string' || typeof w.text !== 'string' || !w.text.trim()) e(`rewrites[${i}] needs bullet_id and non-empty text`);
    else {
      if (w.reason !== undefined && typeof w.reason !== 'string') e(`rewrites[${i}].reason must be a string`);
      if (w.keywords_injected !== undefined && !isStrArr(w.keywords_injected)) e(`rewrites[${i}].keywords_injected must be a string array`);
    }
  });
  if (r.cover_letter !== null && r.cover_letter !== undefined) {
    const c = r.cover_letter;
    if (typeof c !== 'object' || typeof c.subject !== 'string' || !isStrArr(c.body_paragraphs)) e('cover_letter malformed');
  }
  if (r.ai_notes !== undefined && !isStrArr(r.ai_notes)) e('ai_notes must be string array');
  return { ok: errors.length === 0, errors };
}

/** Fill optional fields with safe defaults after validation. */
export function normalizeTailorResult(r) {
  return {
    ...r,
    selection: { summary_override: null, skills_order: [], skills_selected: null, omit_experience_ids: [], ...r.selection },
    rewrites: (r.rewrites || []).map(w => ({ reason: '', keywords_injected: [], ...w })),
    cover_letter: r.cover_letter ?? null,
    ai_notes: r.ai_notes || [],
    self_check: r.self_check || {},
  };
}
