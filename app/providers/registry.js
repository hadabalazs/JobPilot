/** Build a provider from a stored profile. Everything downstream only sees the provider surface. */
import { createManualProvider } from './manual.js';
import { createAnthropicProvider } from './anthropic.js';
import { createOpenAICompatibleProvider } from './openaiCompatible.js';
export function getProvider(profile, fetchImpl) {
  if (!profile || profile.kind === 'manual') return createManualProvider(profile || undefined);
  if (profile.kind === 'anthropic') return createAnthropicProvider(profile, fetchImpl);
  if (profile.kind === 'openai_compatible') return createOpenAICompatibleProvider(profile, fetchImpl);
  throw new Error(`Unknown provider kind ${profile.kind}`);
}
