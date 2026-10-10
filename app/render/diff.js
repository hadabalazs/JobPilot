/** Word-level diff used to show what the AI changed in a bullet. No dependencies. */
const tok = s => String(s || '').split(/(\s+)/).filter(x => x !== '');

/** Longest common subsequence over word tokens. */
function lcs(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'removed', text: a[i] }); i++; }
    else { out.push({ type: 'added', text: b[j] }); j++; }
  }
  while (i < n) out.push({ type: 'removed', text: a[i++] });
  while (j < m) out.push({ type: 'added', text: b[j++] });
  return out;
}

/**
 * Groups the raw LCS output so a changed passage reads as one struck-through run
 * followed by one green run, instead of alternating word by word.
 * @returns {Array<{type:'same'|'added'|'removed', text:string}>}
 */
export function diffWords(before, after) { return coalesce(lcs(tok(before), tok(after))); }

function coalesce(parts) {
  // 1. merge neighbours of the same type
  const merged = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if (last && last.type === p.type) last.text += p.text; else merged.push({ ...p });
  }
  // 2. within a changed passage, put all removals before all additions
  const out = [];
  for (let i = 0; i < merged.length; i++) {
    if (merged[i].type === 'same') { out.push(merged[i]); continue; }
    let j = i, rem = '', add = '';
    while (j < merged.length && merged[j].type !== 'same') { (merged[j].type === 'removed' ? rem += merged[j].text : add += merged[j].text); j++; }
    if (rem.trim()) out.push({ type: 'removed', text: rem.trim() });
    if (add.trim()) out.push({ type: 'added', text: add.trim() });
    i = j - 1;
  }
  return out;
}

/** Share of the new text that is new wording, 0–1. Counts words, not merged blocks. */
export function changeRatio(before, after) {
  const d = lcs(tok(before), tok(after));
  const added = d.filter(x => x.type === 'added' && x.text.trim()).length;
  const kept = d.filter(x => x.type === 'same' && x.text.trim()).length;
  return added + kept === 0 ? 0 : added / (added + kept);
}

/** Everything the tailoring changed, for the Changes view. */
export function buildChangeSet(cv, result) {
  const bullets = new Map(), roles = new Map();
  for (const e of cv.experience || []) { roles.set(e.id, e); for (const b of e.bullets || []) bullets.set(b.id, { ...b, roleId: e.id }); }
  const sel = result.selection || {};
  const rewrites = (result.rewrites || []).map(w => {
    const src = bullets.get(w.bullet_id);
    return src ? { bulletId: w.bullet_id, role: roles.get(src.roleId), before: src.text, after: w.text, reason: w.reason || '', keywords: w.keywords_injected || [], diff: diffWords(src.text, w.text), ratio: changeRatio(src.text, w.text) } : null;
  }).filter(Boolean);
  const chosen = sel.bullet_ids_in_order || {};
  const included = new Set(Object.values(chosen).flat());
  const dropped = [];
  for (const [rid, r] of roles) {
    if ((sel.omit_experience_ids || []).includes(rid)) continue;
    for (const b of r.bullets || []) if (!b.placeholder && chosen[rid] && chosen[rid].length && !included.has(b.id)) dropped.push({ bulletId: b.id, role: r, text: b.text });
  }
  const reordered = Object.entries(chosen).filter(([rid, ids]) => {
    const orig = (roles.get(rid)?.bullets || []).filter(b => included.has(b.id)).map(b => b.id);
    return orig.length === ids.length && orig.some((id, i) => id !== ids[i]);
  }).map(([rid, ids]) => ({ role: roles.get(rid), order: ids }));
  const summary = sel.summary_override
    ? { kind: 'override', text: sel.summary_override }
    : sel.summary_variant_id ? { kind: 'variant', id: sel.summary_variant_id, text: (cv.summary_variants || []).find(s => s.id === sel.summary_variant_id)?.text || '' } : null;
  const notes = {};
  for (const w of rewrites) notes[w.bulletId] = shortReason(w);
  return {
    notes, summary, rewrites, dropped, reordered,
    omittedRoles: (sel.omit_experience_ids || []).map(id => roles.get(id)).filter(Boolean),
    skillsOrder: sel.skills_order || [],
    rewrittenIds: new Set(rewrites.map(r => r.bulletId)),
  };
}

/** One short line explaining a rewrite, for the margin note beside the bullet. */
export function shortReason(w) {
  const kw = (w.keywords || []).filter(Boolean);
  const reason = (w.reason || '').replace(/^mirrors\s+/i, 'mirrors ').trim().replace(/[.\s]+$/, '');
  const pct = Math.round((w.ratio || 0) * 100);
  const parts = [];
  if (kw.length) parts.push(`added ${kw.slice(0, 3).map(k => `"${k}"`).join(', ')}`);
  // Skip the model's stated reason when it just repeats the keywords we already listed.
  const reasonAddsInfo = reason && !kw.some(k => reason.toLowerCase().includes(k.toLowerCase()));
  if (reasonAddsInfo) parts.push(reason.charAt(0).toLowerCase() + reason.slice(1));
  if (!parts.length) parts.push(reason || 'reworded for this job');
  return `${parts.join(' — ')} · ${pct}% new wording`;
}
