/** tailor_v1: single-job prompt. Do not edit after runs exist — create tailor_v2 instead. */
import { TAILOR_RESULT_SCHEMA } from '../schemas/tailor.js';
import { RULES, COVER_RULES, EXAMPLE } from './snippets.js';

export const VERSION = 'tailor_v1';

export function systemText(opts = {}) {
  const rules = [...RULES, ...(opts.includeCover ? COVER_RULES : [])];
  return `You are tailoring a CV for one specific job. Output exactly one JSON object and nothing else: no prose, no markdown fences.\n\nRules:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
}

export function userText(req) {
  const { jobId, jdText, jdMeta = {}, slice, localKeywords = [], options = {} } = req;
  const example = { ...EXAMPLE, job_id: jobId };
  return [
    `# Task`,
    `Tailor the source CV for the job below. Page target: ${options.pageTarget || 2} pages. ${options.includeCover ? 'Include a cover letter.' : 'Set cover_letter to null.'} Use job_id "${jobId}".`,
    ``,
    `# Output contract (JSON Schema)`,
    JSON.stringify(TAILOR_RESULT_SCHEMA),
    ``,
    `# Example of the shape (values are placeholders)`,
    JSON.stringify(example),
    ``,
    `# Deterministic keyword scan (hint, not ground truth)`,
    localKeywords.slice(0, 30).join(', ') || '(none)',
    ``,
    `# Source CV (the only facts you may use)`,
    JSON.stringify(slice),
    ``,
    `# Job description`,
    `<<<JD title="${(jdMeta.title || '').replace(/"/g, "'")}" company="${(jdMeta.company || '').replace(/"/g, "'")}" location="${(jdMeta.location || '').replace(/"/g, "'")}"`,
    jdText,
    `>>>`,
    ``,
    `Reminder: only source bullet ids; no new numbers; JSON only. Output the JSON now.`,
  ].join('\n');
}

/** Full prompt for manual paste (system + user merged). */
export function render(req) { return `${systemText(req.options)}\n\n${userText(req)}`; }
