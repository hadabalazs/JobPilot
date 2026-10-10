/** TailorResult + CVMaster → plain RenderModel used by HTML and DOCX renderers. */
import { indexCV } from '../schemas/cv_master.js';
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function fmtDate(s) {
  if (!s) return 'Present';
  const raw = String(s).trim();
  if (/^(present|current|now|ongoing)$/i.test(raw)) return 'Present';   // parsers expect one consistent token
  const [y, m] = raw.split('-');
  return m ? `${MON[+m - 1]} ${y}` : y;
}

export function buildRenderModel(cv, result, { includeCover = false, jobMeta = {} } = {}) {
  const idx = indexCV(cv);
  const sel = result.selection || {};
  const rewrites = new Map((result.rewrites || []).map(w => [w.bullet_id, w.text]));
  const omit = new Set(sel.omit_experience_ids || []);
  const chosen = sel.bullet_ids_in_order || {};
  const summary = sel.summary_override || idx.summaries.get(sel.summary_variant_id)?.text || (cv.summary_variants?.[0]?.text ?? '');
  const experience = (cv.experience || []).filter(e => !omit.has(e.id)).map(e => {
    const ids = chosen[e.id] && chosen[e.id].length ? chosen[e.id] : (e.bullets || []).filter(b => !b.placeholder).slice(0, 3).map(b => b.id);
    return { id: e.id, employer: e.employer, title: e.title, location: e.location, dates: `${fmtDate(e.start)} – ${fmtDate(e.end)}`, context: e.context,
      bullets: ids.map(id => idx.bullets.get(id)).filter(b => b && !b.placeholder).map(b => ({ id: b.id, text: rewrites.get(b.id) || b.text })) };
  });
  const order = sel.skills_order || [];
  let groups = [...(cv.skills?.groups || [])].sort((a, b) => { const ia = order.indexOf(a.label), ib = order.indexOf(b.label); return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib); });
  // An explicit ATS-ordered skills list replaces the grouping: a single flat,
  // JD-relevant list is what parsers index most cleanly.
  if ((sel.skills_selected || []).length) {
    const known = new Map((cv.skills?.groups || []).flatMap(g => (g.items || []).map(i => [String(i).toLowerCase().trim(), i])));
    const picked = sel.skills_selected.map(x => known.get(String(x).toLowerCase().trim()) || (result.tailoringMode === 'enhance' ? x : null)).filter(Boolean);
    if (picked.length) groups = [{ label: 'Core Skills', items: [...new Set(picked)] }];
  }
  const cover = includeCover && result.cover_letter ? { subject: result.cover_letter.subject, paragraphs: result.cover_letter.body_paragraphs, ...jobMeta } : null;
  return { identity: cv.identity, summary, experience, skills: groups, education: cv.education || [], certifications: cv.certifications || [], languages: cv.identity.languages || [], cover, jobMeta };
}
