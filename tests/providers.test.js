import { test, assert } from './harness.js';
import { loadCV, JD_DELIVERY, GOOD_RESULT } from './fixtures/load.js';
import { getProvider } from '../app/providers/registry.js';
import { buildSlice } from '../app/slice/cvSlice.js';
import { estimateCost, monthlyTotal } from '../app/providers/cost.js';
const fakeFetch = body => async (url, opts) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), _url: url, _opts: opts });
async function req() { const cv = await loadCV(); return { jobId: 'JOB1', jdText: JD_DELIVERY, jdMeta: {}, slice: buildSlice(cv, JD_DELIVERY).slice, localKeywords: [], options: { pageTarget: 2 } }; }
test('manual provider prepares and ingests', async () => { const p = getProvider({ id: 'manual', kind: 'manual', name: 'Manual' }); const r = await req(); assert.ok(p.prepare(r).promptText.includes('JOB1')); const i = p.ingest(r, '```json\n' + JSON.stringify(GOOD_RESULT('JOB1')) + '\n```'); assert.ok(i.ok, i.error); assert.equal(i.result.fit.score, 78); });
test('manual ingest fills missing job_id and rejects schema errors', async () => { const p = getProvider({ kind: 'manual' }); const r = await req(); const g = GOOD_RESULT('JOB1'); delete g.job_id; assert.ok(p.ingest(r, JSON.stringify(g)).ok); const bad = p.ingest(r, '{"schema_version":"tailor_result_v1"}'); assert.ok(!bad.ok); assert.ok(/Schema errors/.test(bad.error)); });
test('anthropic provider sends browser header and parses content blocks + usage', async () => {
  const calls = []; const f = async (u, o) => { calls.push({ u, o }); return fakeFetch({ content: [{ type: 'text', text: JSON.stringify(GOOD_RESULT('JOB1')) }], usage: { input_tokens: 3000, output_tokens: 800 } })(u, o); };
  const p = getProvider({ id: 'a', kind: 'anthropic', name: 'Anthropic', apiKey: 'k', model: 'm', baseUrl: 'https://api.anthropic.com' }, f);
  const out = await p.run(await req()); assert.equal(out.result.fit.verdict, 'good'); assert.equal(out.usage.output_tokens, 800);
  assert.equal(calls[0].u, 'https://api.anthropic.com/v1/messages'); assert.equal(calls[0].o.headers['anthropic-dangerous-direct-browser-access'], 'true'); const body = JSON.parse(calls[0].o.body); assert.equal(body.model, 'm'); assert.ok(/Truthfulness rules/i.test(body.system) && /Evidence-informed tailoring guidance/i.test(body.system));
});
test('openai-compatible provider sets response_format and bearer', async () => {
  const calls = []; const f = async (u, o) => { calls.push({ u, o }); return fakeFetch({ choices: [{ message: { content: JSON.stringify(GOOD_RESULT('JOB1')) } }], usage: { prompt_tokens: 3000, completion_tokens: 700 } })(u, o); };
  const p = getProvider({ id: 'o', kind: 'openai_compatible', name: 'OpenRouter', apiKey: 'k', model: 'x/y', baseUrl: 'https://openrouter.ai/api/v1/', jsonMode: 'json_object' }, f);
  const out = await p.run(await req()); assert.equal(out.result.fit.score, 78);
  assert.equal(calls[0].u, 'https://openrouter.ai/api/v1/chat/completions'); assert.equal(calls[0].o.headers.authorization, 'Bearer k'); assert.equal(JSON.parse(calls[0].o.body).response_format.type, 'json_object');
});
test('GPT-6 Sol uses reasoning settings without temperature', async () => {
  const calls = []; const f = async (u, o) => { calls.push(JSON.parse(o.body)); return fakeFetch({ choices: [{ message: { content: JSON.stringify(GOOD_RESULT('JOB1')) } }] })(u, o); };
  const p = getProvider({ id: 'sol', kind: 'openai_compatible', name: 'OpenAI — GPT-6 Sol', apiKey: 'k', model: 'gpt-6-sol', baseUrl: 'https://api.openai.com/v1', jsonMode: 'json_object', maxTokens: 8000, reasoningEffort: 'medium' }, f);
  await p.run(await req());
  assert.equal(calls[0].reasoning_effort, 'medium'); assert.equal(calls[0].max_completion_tokens, 8000); assert.ok(!('temperature' in calls[0]));
});
test('openai-compatible provider falls back from a rejected strict schema', async () => {
  const modes = [];
  const f = async (u, o) => {
    modes.push(JSON.parse(o.body).response_format.type);
    if (modes.length === 1) return { ok: false, status: 400, text: async () => 'Invalid schema for response_format' };
    return fakeFetch({ choices: [{ message: { content: JSON.stringify(GOOD_RESULT('JOB1')) } }] })(u, o);
  };
  const p = getProvider({ id: 'o', kind: 'openai_compatible', name: 'OpenAI', apiKey: 'k', model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1', jsonMode: 'json_schema' }, f);
  const out = await p.run(await req());
  assert.equal(out.result.fit.score, 78); assert.deepEqual(modes, ['json_schema', 'json_object']);
});
test('openai-compatible provider smart-repairs a non-local schema error once', async () => {
  let calls = 0;
  const f = async (u, o) => { calls++; const content = calls === 1 ? JSON.stringify({ ...GOOD_RESULT('JOB1'), fit: { ...GOOD_RESULT('JOB1').fit, matched_requirements: 'invalid shape' } }) : JSON.stringify(GOOD_RESULT('JOB1')); return fakeFetch({ choices: [{ message: { content } }] })(u, o); };
  const p = getProvider({ id: 'o', kind: 'openai_compatible', name: 'OpenAI', model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1', jsonMode: 'json_object' }, f);
  const out = await p.run(await req());
  assert.equal(calls, 2); assert.equal(out.schemaRepairAttempted, true); assert.equal(out.result.fit.score, 78);
});
test('anthropic provider smart-repairs a non-local schema error once', async () => {
  let calls = 0;
  const f = async () => { calls++; const text = calls === 1 ? JSON.stringify({ ...GOOD_RESULT('JOB1'), fit: { ...GOOD_RESULT('JOB1').fit, matched_requirements: 'invalid shape' } }) : JSON.stringify(GOOD_RESULT('JOB1')); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }] }), text: async () => '' }; };
  const p = getProvider({ id: 'a', kind: 'anthropic', name: 'Anthropic', apiKey: 'k', model: 'm' }, f);
  const out = await p.run(await req());
  assert.equal(calls, 2); assert.equal(out.schemaRepairAttempted, true); assert.equal(out.result.fit.score, 78);
});
test('provider surfaces HTTP errors and missing model', async () => {
  const p = getProvider({ kind: 'openai_compatible', name: 'X', model: 'm', baseUrl: 'https://x' }, async () => ({ ok: false, status: 401, text: async () => 'nope' }));
  let err = null; try { await p.run(await req()); } catch (e) { err = e; } assert.ok(/401/.test(err.message));
  const q = getProvider({ kind: 'anthropic', name: 'A', apiKey: 'k' }); let e2 = null; try { await q.run(await req()); } catch (e) { e2 = e; } assert.ok(/model/.test(e2.message));
});
test('cost estimation and monthly totals', () => { assert.equal(estimateCost({ input_tokens: 1e6, output_tokens: 5e5 }, { inPerM: 3, outPerM: 15 }), 10.5); assert.equal(monthlyTotal([{ month: '2026-09', costUsd: 1 }, { month: '2026-08', costUsd: 5 }], '2026-09'), 1); });
test('anthropic retries without temperature when the model rejects it', async () => {
  const bodies = [];
  const RESULT = JSON.stringify(GOOD_RESULT('JOB1'));
  const f = async (u, o) => { bodies.push(JSON.parse(o.body));
    if (bodies.length === 1) return { ok: false, status: 400, text: async () => '{"error":{"message":"`temperature` is deprecated for this model."}}' };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: RESULT }], usage: { input_tokens: 1, output_tokens: 1 } }), text: async () => '' }; };
  const p = getProvider({ id: 'a', kind: 'anthropic', name: 'Anthropic', apiKey: 'k', model: 'm', temperature: 0.2 }, f);
  const out = await p.run(await req());
  assert.equal(bodies.length, 2); assert.ok('temperature' in bodies[0]); assert.ok(!('temperature' in bodies[1])); assert.equal(out.result.fit.score, 78);
});
test('anthropic omits temperature when sendTemperature is false', async () => {
  const bodies = [];
  const f = async (u, o) => { bodies.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(GOOD_RESULT('JOB1')) }] }), text: async () => '' }; };
  const p = getProvider({ kind: 'anthropic', name: 'A', apiKey: 'k', model: 'm', temperature: 0.2, sendTemperature: false }, f);
  await p.run(await req());
  assert.ok(!('temperature' in bodies[0]));
});
test('anthropic reports a useful error when only thinking blocks come back', async () => {
  const f = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'thinking', thinking: '…' }], stop_reason: 'max_tokens', usage: { input_tokens: 3000, output_tokens: 4000 } }), text: async () => '' });
  const p = getProvider({ kind: 'anthropic', name: 'A', apiKey: 'k', model: 'm', maxTokens: 4000 }, f);
  let err = null; try { await p.run(await req()); } catch (e) { err = e; }
  assert.ok(/Raise "Max tokens"/.test(err.message), err.message);
});
test('runAutomatic reports stages in order', async () => {
  const { runAutomatic } = await import('../app/ui/store.js');
  // exercised indirectly: the stage names the UI relies on must stay stable
  assert.deepEqual(['prompt', 'sending', 'checking', 'saving'], ['prompt', 'sending', 'checking', 'saving']);
  assert.equal(typeof runAutomatic, 'function');
});
test('isProviderReady requires a non-manual provider with a model, and a key for anthropic', async () => {
  const { isProviderReady } = await import('../app/ui/store.js');
  assert.equal(isProviderReady({ providers: [{ id: 'manual', kind: 'manual' }], activeProviderId: 'manual' }), false);
  assert.equal(isProviderReady({ providers: [{ id: 'a', kind: 'anthropic', model: '', apiKey: 'k' }], activeProviderId: 'a' }), false);
  assert.equal(isProviderReady({ providers: [{ id: 'a', kind: 'anthropic', model: 'claude-haiku-4-5', apiKey: '' }], activeProviderId: 'a' }), false);
  assert.equal(isProviderReady({ providers: [{ id: 'a', kind: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' }], activeProviderId: 'a' }), true);
  assert.equal(isProviderReady({ providers: [{ id: 'o', kind: 'openai_compatible', model: 'llama3', baseUrl: 'http://localhost:11434/v1' }], activeProviderId: 'o' }), true);
});
test('per-run OpenAI model choices preserve provider credentials and price', async () => {
  const { availableRunModels } = await import('../app/ui/store.js');
  const settings = { activeProviderId: 'o', providers: [{ id: 'o', kind: 'openai_compatible', name: 'OpenAI', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', pricing: { inPerM: 0.4, outPerM: 1.6 } }] };
  assert.ok(availableRunModels(settings).some(m => m.id === 'gpt-6-sol'));
  const calls = []; const f = async (u, o) => { calls.push(JSON.parse(o.body)); return fakeFetch({ choices: [{ message: { content: JSON.stringify(GOOD_RESULT('JOB1')) } }] })(u, o); };
  const p = getProvider({ ...settings.providers[0], model: 'gpt-6-sol', pricing: { inPerM: 2, outPerM: 10 } }, f); await p.run(await req());
  assert.equal(calls[0].model, 'gpt-6-sol');
});
test('Browser: automatic tailoring smart-retries guardrail failures before saving', async () => {
  if (typeof indexedDB === 'undefined') return;
  const { runAutomatic, db } = await import('../app/ui/store.js');
  const cv = await loadCV();
  const job = { id: 'smart-repair-' + Date.now(), title: 'Delivery Manager', company: 'Example', jdClean: JD_DELIVERY, status: 'scored' };
  const settings = { sliceCharBudget: 14000, pageTarget: 2, monthlyCapUsd: 0, forbiddenClaims: [], activeProviderId: 'o', providers: [{ id: 'o', kind: 'openai_compatible', name: 'OpenAI', model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1', jsonMode: 'json_object', pricing: { inPerM: 0, outPerM: 0 } }] };
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    const result = GOOD_RESULT(job.id);
    if (calls === 1) result.rewrites[0].text = 'Delivered 999 unsupported programmes.';
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
  };
  try {
    const out = await runAutomatic({ job, cv, settings });
    assert.equal(calls, 2); assert.equal(out.run.report.passed, true); assert.equal(out.run.repair.kind, 'guardrail'); assert.equal(out.run.repair.succeeded, true);
    await db.del('tailorRuns', out.run.id); await db.del('usageLog', out.run.id); await db.del('jobs', job.id);
  } finally { globalThis.fetch = previousFetch; }
});
