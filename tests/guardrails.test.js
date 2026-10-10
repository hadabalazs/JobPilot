import { test, assert } from './harness.js';
import { loadCV, GOOD_RESULT } from './fixtures/load.js';
import { evaluate } from '../app/guardrails/report.js';
import { extractNumbers } from '../app/guardrails/traceability.js';

test('clean result passes guardrails', async () => { const r = evaluate(GOOD_RESULT('j'), await loadCV()); assert.ok(r.passed, r.hardFailures.join('; ')); assert.equal(r.warnings.length, 0, r.warnings.join('; ')); });
test('fabricated number is a hard fail', async () => { const g = GOOD_RESULT('j'); g.rewrites[0].text = 'Cut release lead time from 6 weeks to 2 weeks across 12 squads.'; const r = evaluate(g, await loadCV()); assert.ok(!r.passed); assert.ok(r.hardFailures.some(f => f.includes('"12"'))); });
test('changed percentage is a hard fail', async () => { const g = GOOD_RESULT('j'); g.rewrites.push({ bullet_id: 'b_retail_01', text: 'Delivered relaunch 15% under budget', reason: '', keywords_injected: [] }); const r = evaluate(g, await loadCV()); assert.ok(!r.passed); assert.ok(r.hardFailures.some(f => f.includes('"15"'))); });
test('dropping a number is allowed', async () => { const g = GOOD_RESULT('j'); g.rewrites[0].text = 'Own end-to-end delivery of the mobile onboarding programme across 6 squads.'; assert.ok(evaluate(g, await loadCV()).passed); });
test('unknown bullet id is a hard fail', async () => { const g = GOOD_RESULT('j'); g.selection.bullet_ids_in_order.exp_bank.push('b_ghost'); assert.ok(!evaluate(g, await loadCV()).passed); });
test('bullet under wrong role is a hard fail', async () => { const g = GOOD_RESULT('j'); g.selection.bullet_ids_in_order.exp_retail.push('b_bank_02'); assert.ok(!evaluate(g, await loadCV()).passed); });
test('unknown summary variant is a hard fail', async () => { const g = GOOD_RESULT('j'); g.selection.summary_variant_id = 'sum_nope'; assert.ok(!evaluate(g, await loadCV()).passed); });
test('new proper noun is a warning, not a fail', async () => { const g = GOOD_RESULT('j'); g.rewrites[0].text = 'Led the Falcon Bank onboarding programme across 6 squads.'; const r = evaluate(g, await loadCV()); assert.ok(r.passed); assert.ok(r.warnings.some(w => w.includes('Falcon Bank'))); });
test('forbidden claim is a hard fail', async () => { const g = GOOD_RESULT('j'); g.rewrites[0].text = 'Fluent Arabic speaker leading 6 squads.'; const r = evaluate(g, await loadCV(), { forbiddenClaims: ['fluent Arabic'] }); assert.ok(!r.passed); });
test('summary_override with invented number fails', async () => { const g = GOOD_RESULT('j'); g.selection.summary_override = 'Delivery manager with 25 years in banking.'; const r = evaluate(g, await loadCV()); assert.ok(!r.passed); });
test('extractNumbers handles %, k and currency', () => { const n = extractNumbers('Saved AED 1.2M, 8% under budget, 45 engineers, 6–2 weeks'); assert.ok(n.has('1.2')); assert.ok(n.has('8')); assert.ok(n.has('45')); assert.ok(n.has('6')); assert.ok(n.has('2')); });
test('proper noun right after a sentence-initial verb is still caught', async () => { const g = GOOD_RESULT('j'); g.rewrites[0].text = 'Led Falcon Bank delivery across 6 squads.'; const r = evaluate(g, await loadCV()); assert.ok(r.warnings.some(w => w.includes('Falcon Bank'))); });
test('numbers inside string metric values are allowed', async () => {
  const cv = await loadCV();
  cv.experience[0].bullets[0].metrics = { m_01: '90+ people', m_02: '7 scrum masters' };
  const g = GOOD_RESULT('j'); g.rewrites[0].text = 'Coordinated a 90 person organisation with 7 scrum masters.';
  const r = evaluate(g, cv); assert.ok(r.passed, r.hardFailures.join('; '));
});
