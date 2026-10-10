/** Anthropic Messages API, called directly from the browser (requires the direct-browser-access header). */
import { promptFor } from '../prompts/mode.js';
import { createManualProvider } from './manual.js';
import { runTailorRequest } from './tailorRun.js';

export function createAnthropicProvider(profile, fetchImpl = globalThis.fetch) {
  const base = createManualProvider(profile);
  const runText = async ({ system, promptText, signal, tokenMultiplier = 1 } = {}) => {
    if (!profile.apiKey) throw new Error('No API key on this profile');
    if (!profile.model) throw new Error('No model id on this profile');
    const url = `${(profile.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`;
    const headers = { 'content-type': 'application/json', 'x-api-key': profile.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', ...(profile.extraHeaders || {}) };
    const base = { model: profile.model, max_tokens: (profile.maxTokens || 4000) * tokenMultiplier, system: system || '', messages: [{ role: 'user', content: promptText || '' }] };
    const temp = Number(profile.temperature);
    const withTemp = Number.isFinite(temp) && profile.sendTemperature !== false ? { ...base, temperature: temp } : base;
    let res = await fetchImpl(url, { method: 'POST', signal, headers, body: JSON.stringify(withTemp) });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 400 && /temperature/i.test(text) && withTemp !== base) {
        res = await fetchImpl(url, { method: 'POST', signal, headers, body: JSON.stringify(base) });
        if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      } else throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const blocks = data.content || [];
    const raw = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
    return { raw, usage: data.usage || null, finishReason: data.stop_reason };
  };
  return {
    ...base, kind: 'anthropic',
    prepare(req) { const p = promptFor(req); return { promptText: p.userText(req), system: p.systemText(req.options), promptVersion: p.VERSION }; },
    runText,
    async run(req, options = {}) {
      return runTailorRequest(this, req, runText, options);
    },
  };
}
