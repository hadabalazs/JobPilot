/** JobPilot configuration and defaults. Bump APP_VERSION on every deploy (also CACHE_NAME in sw.js). */
export const APP_VERSION = '0.20.4';
export const DB_NAME = 'jobpilot';
export const DB_VERSION = 1;

export const DEFAULT_SETTINGS = {
  pageTarget: 2,
  batchSize: 3,
  followUpDays: 7,
  monthlyCapUsd: 5,
  filenamePattern: '{name}_CV_{company}_{role}',
  sliceCharBudget: 14000,
  forbiddenClaims: [],
  autoTailor: false,
  autoTailorMinScore: 50,
  activeProviderId: 'manual',
  providers: [{ id: 'manual', name: 'Manual (AI chat, free)', kind: 'manual' }],
};

/** Editable presets shown in Settings. Model ids are left blank on purpose. */
export const PROVIDER_PRESETS = [
  { name: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', model: '', jsonMode: 'none', maxTokens: 8000, sendTemperature: false },
  { name: 'OpenAI', kind: 'openai_compatible', baseUrl: 'https://api.openai.com/v1', model: '', jsonMode: 'json_object', maxTokens: 8000, temperature: 0.2 },
  { name: 'OpenAI — GPT-6 Sol', kind: 'openai_compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6-sol', jsonMode: 'json_object', maxTokens: 8000, reasoningEffort: 'medium', pricing: { inPerM: 2, outPerM: 10 }, note: 'High-quality reasoning for important applications. Standard API price: $2 input / $10 output per 1M tokens.' },
  { name: 'OpenAI — GPT-6 Luna', kind: 'openai_compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6-luna', jsonMode: 'json_object', maxTokens: 8000, reasoningEffort: 'medium', pricing: { inPerM: 0.1, outPerM: 0.5 }, note: 'Efficient model for routine tailoring and batches. Standard API price: $0.10 input / $0.50 output per 1M tokens.' },
  { name: 'Core42 Compass (UAE)', kind: 'openai_compatible', baseUrl: 'https://api.core42.ai/v1', model: '', jsonMode: 'json_object', maxTokens: 4000, temperature: 0.2, pricing: { inPerM: 0.15, outPerM: 0.37 }, note: 'Sovereign UAE hosting. Confirm the base URL in your Compass account. Cheap model ids: gpt-oss-120b-qualcomm, k2-think-core42, mistral-small-3.2.' },
  { name: 'OpenRouter', kind: 'openai_compatible', baseUrl: 'https://openrouter.ai/api/v1', model: '', jsonMode: 'json_object', maxTokens: 4000, temperature: 0.2, extraHeaders: { 'X-Title': 'JobPilot' } },
  { name: 'Groq', kind: 'openai_compatible', baseUrl: 'https://api.groq.com/openai/v1', model: '', jsonMode: 'json_object', maxTokens: 4000, temperature: 0.2 },
  { name: 'Together', kind: 'openai_compatible', baseUrl: 'https://api.together.xyz/v1', model: '', jsonMode: 'json_object', maxTokens: 4000, temperature: 0.2 },
  { name: 'DeepSeek', kind: 'openai_compatible', baseUrl: 'https://api.deepseek.com/v1', model: '', jsonMode: 'json_object', maxTokens: 4000, temperature: 0.2 },
  { name: 'Ollama (local)', kind: 'openai_compatible', baseUrl: 'http://localhost:11434/v1', apiKey: 'ollama', model: '', jsonMode: 'json_object', maxTokens: 4000, temperature: 0.2 },
];

export const JD_BOILERPLATE = [
  /^apply now$/i, /^show more$/i, /^show less$/i, /^easy apply$/i, /^save$/i, /^share$/i,
  /cookie/i, /^report this job$/i, /^see who .* has hired/i, /^about the job$/i,
];
