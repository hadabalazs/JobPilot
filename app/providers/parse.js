/** Tolerant JSON extraction from an AI paste-back. */
export function extractJSON(raw) {
  let s = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!s) return { ok: false, error: 'Empty response', value: null };
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const attempts = [];
  const first = s.indexOf('{'), firstArr = s.indexOf('[');
  const startsArr = firstArr !== -1 && (first === -1 || firstArr < first);
  const start = startsArr ? firstArr : first;
  if (start === -1) return { ok: false, error: 'No JSON object found', value: null };
  const body = s.slice(start);
  const closeIdx = startsArr ? body.lastIndexOf(']') : body.lastIndexOf('}');
  attempts.push(closeIdx !== -1 ? body.slice(0, closeIdx + 1) : body);
  attempts.push(body);
  const repair = t => t
    .replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\/\/[^\n]*\n/g, '\n');
  for (const cand of [...attempts, ...attempts.map(repair)]) {
    try { return { ok: true, value: JSON.parse(cand), error: null }; } catch (e) { /* next */ }
  }
  // Truncated array / object: try to close it
  const closed = closeUnbalanced(repair(body));
  if (closed) { try { return { ok: true, value: JSON.parse(closed), error: null, truncated: true }; } catch (e) { /* fallthrough */ } }
  let pos = 0; try { JSON.parse(body); } catch (e) { const m = /position (\d+)/.exec(e.message); pos = m ? +m[1] : 0; }
  return { ok: false, error: `Could not parse JSON near: …${body.slice(Math.max(0, pos - 80), pos + 80)}…`, value: null };
}

/** Drop a trailing partial item and close all open brackets/braces. */
function closeUnbalanced(t) {
  // cut back to last complete item boundary
  let cut = Math.max(t.lastIndexOf('},'), t.lastIndexOf('],'), t.lastIndexOf('"},'));
  if (cut === -1) cut = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (cut === -1) return null;
  let s = t.slice(0, cut + 1);
  const stack = []; let inStr = false, esc = false;
  for (const ch of s) {
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (inStr) return null;
  s = s.replace(/,\s*$/, '');
  while (stack.length) s += stack.pop() === '{' ? '}' : ']';
  return s;
}
