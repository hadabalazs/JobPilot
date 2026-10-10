/** Deterministic fabrication defence. Every referenced id must exist; no new numbers; no new proper nouns. */
import { indexCV } from '../schemas/cv_master.js';

const NUM_RX = /(?:AED|USD|EUR|GBP|SAR|\$|€|£)?\s?\d[\d,]*(?:\.\d+)?\s?(?:%|k|K|M|m|bn|x|\+)?/g;
export function extractNumbers(text) {
  const out = new Set();
  for (const m of String(text || '').match(NUM_RX) || []) {
    const n = m.replace(/[^\d.]/g, '');
    if (n) out.add(n.replace(/\.$/, ''));
  }
  return out;
}
/** Capitalised phrases that are not at the start of a sentence. */
const properNouns = text => {
  const out = new Set();
  const rx = /(^|[.!?]\s+|\s)([A-Z][A-Za-z0-9&.'-]{2,}(?:\s+[A-Z][A-Za-z0-9&.'-]+)*)/g;
  let m; const t = String(text || '');
  while ((m = rx.exec(t))) { const sentenceStart = m[1] === '' || /[.!?]\s+/.test(m[1]); const words = m[2].split(/\s+/); if (!sentenceStart) out.add(m[2]); else if (words.length > 1) out.add(words.slice(1).join(' ')); }
  return out;
};
const allWordsLower = text => new Set(String(text || '').toLowerCase().match(/[a-z0-9&.'-]+/g) || []);

export function checkTraceability(result, cv) {
  const idx = indexCV(cv);
  const hard = [], warn = [];
  const sel = result.selection || {};
  for (const [rid, ids] of Object.entries(sel.bullet_ids_in_order || {})) {
    if (!idx.roles.has(rid)) hard.push(`Unknown experience id "${rid}" in bullet_ids_in_order`);
    for (const bid of ids) { if (!idx.bullets.has(bid)) hard.push(`Unknown bullet id "${bid}"`); else if (idx.bullets.get(bid).roleId !== rid) hard.push(`Bullet "${bid}" does not belong to "${rid}"`); }
  }
  for (const rid of sel.omit_experience_ids || []) if (!idx.roles.has(rid)) hard.push(`Unknown experience id "${rid}" in omit_experience_ids`);
  if (sel.summary_variant_id && !idx.summaries.has(sel.summary_variant_id)) hard.push(`Unknown summary_variant_id "${sel.summary_variant_id}"`);
  for (const m of result.fit?.matched_requirements || []) for (const bid of m.evidence_bullet_ids || []) if (!idx.bullets.has(bid)) hard.push(`Evidence references unknown bullet "${bid}"`);

  // Numbers and proper nouns in rewrites
  const cvText = JSON.stringify(cv); const cvWords = allWordsLower(cvText);
  const knownNoun = pn => { const l = pn.toLowerCase(); return cvText.toLowerCase().includes(l) || l.split(/\s+/).every(w => cvWords.has(w)); };
  for (const w of result.rewrites || []) {
    const src = idx.bullets.get(w.bullet_id);
    if (!src) { hard.push(`Rewrite references unknown bullet "${w.bullet_id}"`); continue; }
    const allowed = new Set([...extractNumbers(src.text), ...Object.values(src.metrics || {}).flatMap(v => [String(v), ...extractNumbers(String(v))]), ...(src.variants || []).flatMap(v => [...extractNumbers(v.text)])]);
    // include role context numbers (team size etc.)
    for (const n of extractNumbers(idx.roles.get(src.roleId)?.context || '')) allowed.add(n);
    for (const n of extractNumbers(w.text)) if (!allowed.has(n)) hard.push(`Rewrite of ${w.bullet_id} introduces number "${n}" not in source`);
    for (const pn of properNouns(w.text)) if (!knownNoun(pn)) warn.push(`Rewrite of ${w.bullet_id} mentions "${pn}" — not found in source CV; confirm it is true`);
  }
  // skills_selected must be real skills from the master CV — an ATS keyword is
  // never a reason to claim a skill the source does not list.
  const cvSkills = new Set((cv.skills?.groups || []).flatMap(g => (g.items || []).map(i => String(i).toLowerCase().trim())));
  for (const sk of sel.skills_selected || []) {
    if (!cvSkills.has(String(sk).toLowerCase().trim())) (result.tailoringMode === 'enhance' ? warn : hard).push(`skills_selected contains "${sk}", which is not in your master CV skills — verify supporting experience before exporting`);
  }

  // summary_override overlap
  if (sel.summary_override) {
    const base = [...idx.summaries.values()].map(s => s.text).join(' ') + ' ' + [...idx.bullets.values()].map(b => b.text).join(' ');
    const baseToks = new Set(base.toLowerCase().match(/[a-z0-9]{4,}/g) || []);
    const toks = sel.summary_override.toLowerCase().match(/[a-z0-9]{4,}/g) || [];
    const overlap = toks.length ? toks.filter(t => baseToks.has(t)).length / toks.length : 0;
    if (overlap < 0.6) warn.push(`summary_override shares only ${Math.round(overlap * 100)}% of its vocabulary with the source — check for invented claims`);
    for (const n of extractNumbers(sel.summary_override)) if (!extractNumbers(base).has(n)) hard.push(`summary_override introduces number "${n}" not in source`);
  }
  return { hard, warn };
}
