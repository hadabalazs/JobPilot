import { test, assert } from './harness.js';
import { loadCV, JD_DELIVERY, GOOD_RESULT } from './fixtures/load.js';
import { repairTailorShape, strictTailorSchema, validateTailorResult } from '../app/schemas/tailor.js';
import { getProvider } from '../app/providers/registry.js';
import { needsReview, pendingRow, queueSummary } from '../app/ui/bulkState.js';
import { buildRequest, runAutomatic, runBulk, db, loadUsage } from '../app/ui/store.js';

const settings = { sliceCharBudget: 14000, pageTarget: 2, monthlyCapUsd: 0, forbiddenClaims: [], activeProviderId: 'test-provider', providers: [{ id: 'test-provider', kind: 'openai_compatible', name: 'Test', model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1', jsonMode: 'json_object', maxTokens: 4000, pricing: { inPerM: 1, outPerM: 1 } }] };
const job = id => ({ id, title: 'Delivery Manager', jdClean: JD_DELIVERY, status: 'scored' });
const response = (result, finish_reason = 'stop') => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(result) }, finish_reason }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) });
test('rewrite shape repair preserves IDs and wording in maps, singleton and encoded arrays', () => {
  const w = GOOD_RESULT('JOB1').rewrites[0];
  for (const value of [{ [w.bullet_id]: w.text }, { [w.bullet_id]: w }, w, JSON.stringify([w])]) {
    const original = { ...GOOD_RESULT('JOB1'), rewrites: value };
    const repaired = repairTailorShape(original);
    assert.equal(repaired.value.rewrites[0].bullet_id, w.bullet_id);
    assert.equal(repaired.value.rewrites[0].text, w.text);
    assert.equal(repaired.repairs.length, 1);
    assert.ok(validateTailorResult(repaired.value).ok);
    assert.deepEqual(original.rewrites, value);
  }
  for (const value of [null, {}]) assert.deepEqual(repairTailorShape({ rewrites: value }).value.rewrites, []);
});
test('unusable rewrites are safely omitted instead of failing the whole tailored result', () => {
  for (const rewrites of [undefined, 'unstructured prose', { unexpected: { paragraph: 'No source id' } }, [null]]) {
    const repaired = repairTailorShape({ ...GOOD_RESULT('JOB1'), rewrites });
    assert.ok(validateTailorResult(repaired.value).ok);
    assert.deepEqual(repaired.value.rewrites, []);
  }
  const alias = repairTailorShape({ ...GOOD_RESULT('JOB1'), rewrites: { items: [{ target_bullet_id: 'b_bank_01', revised_text: 'Supported wording', rationale: 'Closer match', keywords: ['delivery'] }] } });
  assert.ok(validateTailorResult(alias.value).ok);
  assert.equal(alias.value.rewrites[0].bullet_id, 'b_bank_01');
  assert.equal(alias.value.rewrites[0].text, 'Supported wording');
});
test('manual paste rejects wrong-job results and malformed nested objects', () => {
  const p = getProvider({ kind: 'manual' });
  assert.ok(!p.ingest({ jobId: 'JOB1' }, JSON.stringify(GOOD_RESULT('OTHER'))).ok);
  const malformed = GOOD_RESULT('JOB1'); malformed.fit.matched_requirements = [null];
  assert.ok(!p.ingest({ jobId: 'JOB1' }, JSON.stringify(malformed)).ok);
});
test('strict schema closes every object and enumerates source role IDs', async () => {
  const req = buildRequest(job('JOB1'), await loadCV(), settings);
  const s = strictTailorSchema(req);
  const check = n => {
    assert.ok(n.type, 'every node needs a type');
    if (n.properties) {
      assert.equal(n.additionalProperties, false);
      assert.deepEqual(n.required, Object.keys(n.properties));
      Object.values(n.properties).forEach(check);
    }
    if (n.items) check(n.items);
  };
  check(s);
  assert.deepEqual(Object.keys(s.properties.selection.properties.bullet_ids_in_order.properties), req.slice.experience.map(r => r.id));
});
test('API repair includes rejected draft and error and counts both responses', async () => {
  const req = buildRequest(job('JOB1'), await loadCV(), settings);
  const calls = [], usage = [];
  const p = getProvider(settings.providers[0], async (u, o) => {
    calls.push(JSON.parse(o.body));
    return response(calls.length === 1 ? { ...GOOD_RESULT('JOB1'), fit: { ...GOOD_RESULT('JOB1').fit, matched_requirements: 'broken-marker' } } : GOOD_RESULT('JOB1'));
  });
  const out = await p.run(req, { onUsage: u => usage.push(u) });
  assert.equal(calls.length, 2); assert.equal(usage.length, 2);
  assert.equal(out.usage.completion_tokens, 40);
  assert.ok(calls[1].messages[1].content.includes('broken-marker'));
  assert.ok(calls[1].messages[1].content.includes('fit.matched_requirements must be array'));
  assert.equal(calls[0].response_format.type, 'json_schema');
});
test('truncated responses get a bounded larger retry, never a partial saved success', async () => {
  const req = buildRequest(job('JOB1'), await loadCV(), settings), calls = [];
  const p = getProvider(settings.providers[0], async (u, o) => { calls.push(JSON.parse(o.body)); return response(GOOD_RESULT('JOB1'), 'length'); });
  let error; try { await p.run(req); } catch (e) { error = e; }
  assert.equal(error.code, 'truncated'); assert.equal(calls.length, 2);
  assert.equal(calls[1].max_tokens, calls[0].max_tokens * 2);
});
test('auth and refusal are not blindly retried', async () => {
  const req = buildRequest(job('JOB1'), await loadCV(), settings);
  for (const kind of ['auth', 'refusal']) {
    let calls = 0;
    const p = getProvider(settings.providers[0], async () => {
      calls++;
      return kind === 'auth' ? { ok: false, status: 401, text: async () => 'Invalid key' } : { ok: true, json: async () => ({ choices: [{ message: { refusal: 'No' } }] }) };
    });
    let error; try { await p.run(req); } catch (e) { error = e; }
    assert.ok(error); assert.equal(calls, 1);
  }
});
test('bulk summary distinguishes review warnings, failures, and resumable rows', () => {
  const rows = [{ state: 'done', passed: true, warnings: [] }, { state: 'done', passed: true, warnings: ['Verify wording'] }, { state: 'error' }, { state: 'cancelled' }, { state: 'skipped' }];
  assert.ok(needsReview(rows[1])); assert.ok(pendingRow(rows[3]));
  assert.deepEqual(queueSummary(rows), { ready: 1, review: 1, failed: 1, pending: 2, processed: 3 });
});

async function clean(ids) {
  for (const table of ['jobs', 'tailorRuns', 'usageLog']) for (const r of await db.list(table)) if (ids.includes(r.jobId || r.id)) await db.del(table, r.id);
}
test('Browser: malformed attempts are charged, cap prevents another repair, master untouched', async () => {
  if (typeof indexedDB === 'undefined') return;
  const cv = await loadCV(), id = 'bulk-cost-' + Date.now(), previous = globalThis.fetch;
  const before = await db.getMeta('cvMaster', null);
  const { monthlyTotal } = await import('../app/providers/cost.js');
  const spent = monthlyTotal(await loadUsage()); let calls = 0;
  globalThis.fetch = async () => { calls++; return response({ ...GOOD_RESULT(id), fit: { ...GOOD_RESULT(id).fit, matched_requirements: 'broken' } }); };
  try {
    let error;
    try { await runAutomatic({ job: job(id), cv, settings: { ...settings, monthlyCapUsd: spent + 0.000001 } }); } catch (e) { error = e; }
    assert.equal(error.code, 'budget'); assert.equal(calls, 1);
    const logs = (await loadUsage()).filter(x => x.jobId === id);
    assert.equal(logs.length, 1); assert.ok(logs[0].costUsd > 0);
    assert.deepEqual(await db.getMeta('cvMaster', null), before);
  } finally { globalThis.fetch = previous; await clean([id]); }
});
test('Browser: bulk skips remaining jobs on auth errors and marks every cancelled row', async () => {
  if (typeof indexedDB === 'undefined') return;
  const cv = await loadCV(), jobs = ['a', 'b', 'c'].map(x => job('bulk-stop-' + x)), prev = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 401, text: async () => 'Invalid key' }; };
  try {
    const states = {};
    await runBulk({ jobs, cv, settings, onProgress: p => states[p.job.id] = p.state });
    assert.deepEqual(Object.values(states), ['error', 'skipped', 'skipped']); assert.equal(calls, 1);
    const ctrl = new AbortController(); ctrl.abort(); const cancelled = [];
    await runBulk({ jobs, cv, settings, signal: ctrl.signal, onProgress: p => cancelled.push(p.state) });
    assert.deepEqual(cancelled, ['cancelled', 'cancelled', 'cancelled']); assert.equal(calls, 1);
  } finally { globalThis.fetch = prev; }
});
test('Browser: bulk continues past a schema failure and preserves prior usable run', async () => {
  if (typeof indexedDB === 'undefined') return;
  const cv = await loadCV(), prefix = 'bulk-continue-' + Date.now(), jobs = [job(prefix + 'a'), job(prefix + 'b')], prev = globalThis.fetch;
  await db.put('jobs', { ...jobs[0], status: 'applied', bestRunId: 'previous-good' });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(calls <= 2 ? { ...GOOD_RESULT(jobs[0].id), fit: { ...GOOD_RESULT(jobs[0].id).fit, matched_requirements: 'invalid' } } : GOOD_RESULT(jobs[1].id)); };
  try {
    const states = {};
    await runBulk({ jobs, cv, settings, onProgress: p => states[p.job.id] = p.state });
    assert.deepEqual(Object.values(states), ['error', 'done']);
    assert.equal((await db.get('jobs', jobs[0].id)).bestRunId, 'previous-good');
    assert.equal((await db.get('jobs', jobs[0].id)).status, 'applied');
    assert.equal((await loadUsage()).filter(x => x.jobId === jobs[0].id).length, 2);
  } finally { globalThis.fetch = prev; await clean(jobs.map(j => j.id)); }
});
test('Browser: malformed evidence repair is normalised locally and counts repair cost', async () => {
  if (typeof indexedDB === 'undefined') return;
  const cv = await loadCV(), id = 'bulk-evidence-' + Date.now(), prev = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (u, o) => {
    calls.push(JSON.parse(o.body));
    const r = GOOD_RESULT(id);
    if (calls.length === 1) r.rewrites[0].text = 'Delivered 999 unsupported projects.';
    else r.rewrites = 'invalid repair';
    return response(r);
  };
  try {
    const out = await runAutomatic({ job: job(id), cv, settings });
    assert.equal(calls.length, 2);
    assert.ok(calls[1].messages[1].content.includes('Delivered 999 unsupported projects.'));
    assert.equal(out.run.report.passed, true);
    assert.equal(out.run.repair.succeeded, true);
    assert.ok(!out.run.repair.error);
    assert.deepEqual(out.run.result.rewrites, []);
    assert.equal(out.run.usage.completion_tokens, 40);
    assert.equal((await loadUsage()).filter(x => x.jobId === id).length, 2);
    assert.equal(out.job.bestRunId, out.run.id);
  } finally { globalThis.fetch = prev; await clean([id]); }
});
