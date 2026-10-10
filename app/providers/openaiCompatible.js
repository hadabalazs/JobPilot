/** One adapter for OpenAI, OpenRouter, Groq, Together, DeepSeek, Mistral, Ollama, LM Studio, vLLM… */
import { promptFor } from '../prompts/mode.js';
import { TAILOR_RESULT_SCHEMA, strictTailorSchema } from '../schemas/tailor.js';
import { createManualProvider } from './manual.js';
import { runTailorRequest } from './tailorRun.js';

export function createOpenAICompatibleProvider(profile, fetchImpl = globalThis.fetch) {
  const base = createManualProvider(profile);
  const runText = async ({ system, promptText, signal, jsonMode = profile.jsonMode, schema = TAILOR_RESULT_SCHEMA, tokenMultiplier = 1 } = {}) => {
    if (!profile.model) throw new Error('No model id on this profile');
    const reasoningModel = /^gpt-6-(sol|luna|astra)$/i.test(profile.model);
    const body = { model: profile.model, messages: [{ role: 'system', content: system || '' }, { role: 'user', content: promptText || '' }] };
    if (reasoningModel) {
      // GPT-6 reasoning models reject temperature. Keep the adapter on Chat
      // Completions for broad OpenAI-compatible support, using its current
      // model-specific token and reasoning fields.
      body.max_completion_tokens = (profile.maxTokens || 4000) * tokenMultiplier;
      body.reasoning_effort = profile.reasoningEffort || 'medium';
    } else {
      body.temperature = profile.temperature ?? 0.2;
      body.max_tokens = (profile.maxTokens || 4000) * tokenMultiplier;
    }
    if (jsonMode === 'json_object') body.response_format = { type: 'json_object' };
    else if (jsonMode === 'json_schema') body.response_format = { type: 'json_schema', json_schema: { name: 'tailor_result', schema, strict: true } };
    const headers = { 'content-type': 'application/json', ...(profile.extraHeaders || {}) };
    if (profile.apiKey) headers.authorization = `Bearer ${profile.apiKey}`;
    const res = await fetchImpl(`${(profile.baseUrl || '').replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal, headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${profile.name} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? '';
    return { raw: typeof raw === 'string' ? raw : JSON.stringify(raw), usage: data.usage || null, finishReason: data.choices?.[0]?.finish_reason, refusal: data.choices?.[0]?.message?.refusal };
  };
  return {
    ...base, kind: 'openai_compatible',
    prepare(req) { const p = promptFor(req); return { promptText: p.userText(req), system: p.systemText(req.options), promptVersion: p.VERSION }; },
    runText,
    async run(req, options = {}) {
      // Use strict output automatically for the known supported OpenAI model.
      // Other hosts/models retain their configured mode and explicit fallback.
      let jsonMode = profile.jsonMode;
      let official = false;
      try { official = new URL(profile.baseUrl).hostname === 'api.openai.com'; } catch { /* custom host */ }
      if (official && /^gpt-4\.1(?:-|$)/.test(profile.model || '') && jsonMode !== 'none') jsonMode = 'json_schema';
      const schema = strictTailorSchema(req);
      const send = async args => {
        try { return await runText({ ...args, jsonMode, schema }); }
        catch (e) {
          if (jsonMode !== 'json_schema' || !/400.*(?:response_format|json_schema|schema)/i.test(e.message)) throw e;
          jsonMode = 'json_object';
          return runText({ ...args, jsonMode });
        }
      };
      return runTailorRequest(this, req, send, options);
    },
  };
}
