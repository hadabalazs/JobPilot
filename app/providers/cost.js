/** Token cost estimation and monthly cap logic. Prices are per million tokens, user-entered. */
export function estimateCost(usage = {}, pricing = {}) {
  const inp = (usage.input_tokens ?? usage.prompt_tokens ?? 0) / 1e6 * (pricing.inPerM || 0);
  const out = (usage.output_tokens ?? usage.completion_tokens ?? 0) / 1e6 * (pricing.outPerM || 0);
  return Math.round((inp + out) * 1e6) / 1e6;
}
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
export function monthlyTotal(usageLog, month = monthKey()) {
  return usageLog.filter(u => u.month === month).reduce((s, u) => s + (u.costUsd || 0), 0);
}
