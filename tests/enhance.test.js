import { test, assert } from './harness.js';
import { loadCV, GOOD_RESULT, JD_DELIVERY } from './fixtures/load.js';
import { getProvider } from '../app/providers/registry.js';
import { buildRequest, saveRun, db, backfillBestRunIds } from '../app/ui/store.js';
import { evaluate } from '../app/guardrails/report.js';
import { buildRenderModel } from '../app/render/cvModel.js';
import { renderCvHtml } from '../app/render/cvHtml.js';
import * as original from '../app/prompts/tailor_v3.js';
const settings = { sliceCharBudget: 14000, pageTarget: 2, providers: [{ id: 'manual', kind: 'manual' }] };
const job = { id: 'enhance-test', title: 'Delivery Manager', jdClean: JD_DELIVERY, status: 'scored' };

test('Tailor preserves strict mode with evidence-informed prompt and enhancement works across all providers', async () => {
  const cv = await loadCV();
  for (const kind of ['manual', 'anthropic', 'openai_compatible']) {
    const p = getProvider({ kind, name: kind });
    const normal = buildRequest(job, cv, settings);
    const enhanced = buildRequest(job, cv, settings, { mode: 'enhance', includeCover: true });
    assert.equal(p.prepare(normal).promptVersion, 'tailor_v3');
    assert.equal(p.prepare(normal).promptText, kind === 'manual' ? original.render(normal) : original.userText(normal));
    assert.equal(p.prepare(enhanced).promptVersion, 'enhance_v2');
    assert.ok(p.prepare(enhanced).promptText.includes('Tailor & enhance'));
    assert.equal(p.ingest(enhanced, JSON.stringify(GOOD_RESULT(job.id))).result.tailoringMode, 'enhance');
    const forged = { ...GOOD_RESULT(job.id), tailoringMode: 'enhance' };
    assert.equal(p.ingest(normal, JSON.stringify(forged)).result.tailoringMode, 'tailor');
  }
});
test('Enhanced skill proposals render but require review; original mode still blocks them', async () => {
  const cv = await loadCV();
  const result = GOOD_RESULT(job.id);
  result.selection.skills_selected = ['Cross-team delivery coordination'];
  assert.ok(!evaluate(result, cv).passed);
  result.tailoringMode = 'enhance';
  const report = evaluate(result, cv);
  assert.ok(report.passed); assert.ok(report.warnings.length >= 2);
  const model = buildRenderModel(cv, result);
  assert.equal(model.skills[0].items[0], 'Cross-team delivery coordination');
  assert.ok(renderCvHtml(model, '', { highlightSkills: true }).includes('skills tailored'));
});
test('Enhanced mode still catches invented metrics and unknown IDs', async () => {
  const cv = await loadCV();
  const result = { ...GOOD_RESULT(job.id), tailoringMode: 'enhance' };
  result.rewrites[0].text = 'Delivered 98765 projects.';
  result.selection.bullet_ids_in_order.exp_bank.push('invented-id');
  const report = evaluate(result, cv);
  assert.ok(!report.passed);
  assert.ok(report.hardFailures.some(x => x.includes('98765')));
  assert.ok(report.hardFailures.some(x => x.includes('invented-id')));
});
test('Enhanced API run uses enhancement prompt and marks result for review', async () => {
  const cv = await loadCV(); const calls = [];
  for (const kind of ['anthropic', 'openai_compatible']) {
    const p = getProvider({ kind, name: kind, model: 'test', apiKey: 'fake', jsonMode: 'json_object' }, async (url, o) => {
      calls.push(JSON.parse(o.body));
      const raw = JSON.stringify(GOOD_RESULT(job.id));
      return { ok: true, json: async () => ({ choices: [{ message: { content: raw } }], content: [{ type: 'text', text: raw }] }) };
    });
    const out = await p.run(buildRequest(job, cv, settings, { mode: 'enhance' }));
    assert.equal(out.result.tailoringMode, 'enhance');
    assert.ok(JSON.stringify(calls.at(-1)).includes('transferable'));
  }
});
test('Browser: saving and backfilling cannot auto-approve an enhanced draft', async () => {
  if (typeof indexedDB === 'undefined') return;
  const cv = await loadCV(); const provider = getProvider({ id: 'manual', name: 'Manual', kind: 'manual' });
  const testJob = { ...job, id: 'enhance-' + Date.now() };
  const req = buildRequest(testJob, cv, settings, { mode: 'enhance' });
  const { run } = await saveRun({ job: testJob, cv, settings, provider, req, result: GOOD_RESULT(testJob.id) });
  assert.equal(run.accepted, false); assert.equal(run.promptVersion, 'enhance_v2');
  await backfillBestRunIds();
  assert.ok(!(await db.get('jobs', testJob.id)).bestRunId);
});
