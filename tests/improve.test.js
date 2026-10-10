import { test, assert } from './harness.js';
import { parseCvImprovements } from '../app/ui/store.js';

test('CV improvement parser accepts safe, verify and build suggestions', () => {
  const raw = JSON.stringify({ suggestions: [
    { tier: 'safe', title: 'Lead with delivery scope', recommendation: 'Move the 6-squad outcome higher.', why: 'It mirrors the role scope.', evidence_needed: '', next_step: 'Use it in the next summary.' },
    { tier: 'verify', title: 'Confirm Jira ownership', recommendation: 'Add Jira only if you used it.', why: 'The posting requests it.', evidence_needed: 'A project or tool record.', next_step: 'Check your project notes.' },
    { tier: 'build', title: 'Build API delivery evidence', recommendation: 'Create a small portfolio case study.', why: 'The role needs API delivery.', evidence_needed: 'A completed case study.', next_step: 'Outline one project.' },
  ] });
  const r = parseCvImprovements(raw);
  assert.ok(r.ok, r.error); assert.equal(r.suggestions.length, 3); assert.equal(r.suggestions[1].tier, 'verify');
});

test('safe improvement preserves a concrete job-specific rewrite proposal', () => {
  const raw = JSON.stringify({ suggestions: [{ tier: 'safe', title: 'Clarify delivery scope', recommendation: 'Use clearer wording.', why: 'The job prioritises scale.', evidence_needed: '', next_step: 'Review the replacement.', proposal: { kind: 'bullet_rewrite', target_bullet_id: 'b_adcb_01', text: 'Led delivery across product, engineering and risk teams.' } }] });
  const r = parseCvImprovements(raw);
  assert.ok(r.ok, r.error); assert.deepEqual(r.suggestions[0].proposal, { kind: 'bullet_rewrite', targetBulletId: 'b_adcb_01', text: 'Led delivery across product, engineering and risk teams.' });
});
