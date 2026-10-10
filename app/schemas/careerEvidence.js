import { ulid, nowIso } from '../ids.js';
import { validateCVMaster } from './cv_master.js';

/** Explicit user-confirmed additions; never populated from AI suggestions automatically. */
export function addCareerEvidence(cv, { roleId, text, tools = '', source = '', confirmed }) {
  if (!confirmed) throw new Error('Confirm the facts are accurate before adding them.');
  const fact = String(text || '').trim();
  if (fact.length < 20) throw new Error('Describe a specific achievement with enough context (at least 20 characters).');
  if (/\b(TODO|TBD|NEEDS_DETAIL)\b|\[(?:insert|metric|number)/i.test(fact)) throw new Error('Replace placeholders with verified facts or leave them out.');
  const next = structuredClone(cv);
  const role = next.experience.find(e => e.id === roleId);
  if (!role) throw new Error('Choose the role where this happened.');
  if (role.bullets.some(b => b.text.trim().toLowerCase() === fact.toLowerCase())) throw new Error('This achievement is already recorded.');
  const items = [...new Set(String(tools).split(/[,\n]/).map(t => t.trim()).filter(Boolean))];
  role.bullets.push({ id: 'b_' + ulid(), text: fact, competencies: [], keywords: items, metrics: {}, strength: 2, variants: [], evidenceSource: String(source).trim(), confirmedAt: nowIso() });
  const known = new Set((next.skills?.groups || []).flatMap(g => g.items).map(s => s.toLowerCase()));
  const extra = items.filter(t => !known.has(t.toLowerCase()));
  if (extra.length) {
    next.skills ||= { groups: [] };
    let group = next.skills.groups.find(g => g.label === 'Additional verified tools');
    if (!group) { group = { label: 'Additional verified tools', items: [] }; next.skills.groups.push(group); }
    group.items.push(...extra);
  }
  const valid = validateCVMaster(next);
  if (!valid.ok) throw new Error(valid.errors.join('; '));
  return next;
}
