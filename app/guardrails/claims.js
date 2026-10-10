/** User-defined forbidden claims (e.g. "fluent Arabic", "PMP"). Hard fail if present in any output text. */
export function checkClaims(result, forbidden = []) {
  const hard = [];
  const texts = [
    ...(result.rewrites || []).map(w => w.text),
    result.selection?.summary_override || '',
    ...(result.selection?.skills_selected || []),
    ...(result.cover_letter?.body_paragraphs || []),
    result.cover_letter?.subject || '',
  ].join('\n').toLowerCase();
  for (const f of forbidden) { const s = String(f || '').trim().toLowerCase(); if (s && texts.includes(s)) hard.push(`Forbidden claim present: "${f}"`); }
  return { hard, warn: [] };
}
