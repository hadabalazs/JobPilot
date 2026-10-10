/** batch_v1: several jobs in one prompt, for the free manual flow. Results are matched by job_id. */
import { TAILOR_RESULT_SCHEMA } from '../schemas/tailor.js';
import { RULES, COVER_RULES, EXAMPLE } from './snippets.js';

export const VERSION = 'batch_v1';

export function systemText(opts = {}) {
  const rules = [...RULES, ...(opts.includeCover ? COVER_RULES : [])];
  return `You are tailoring one CV for several jobs at once. Output exactly one JSON array and nothing else: no prose, no markdown fences.\n\nRules:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
}

/** @param {{jobId:string, jdText:string, jdMeta:object}[]} items */
export function userText({ items, slice, localKeywords = [], options = {} }) {
  return [
    `# Task`,
    `Tailor the source CV separately for each of the ${items.length} jobs below. Page target: ${options.pageTarget || 2} pages each. ${options.includeCover ? 'Include a cover letter for each.' : 'Set cover_letter to null.'}`,
    `Return a JSON ARRAY with exactly ${items.length} objects, one per job, each echoing its own job_id. Score each job on its own merits — do not let a strong match make a weak one look better.`,
    ``,
    `# Output contract — each array element matches this schema`,
    JSON.stringify(TAILOR_RESULT_SCHEMA),
    ``,
    `# Example element (values are placeholders)`,
    JSON.stringify(EXAMPLE),
    ``,
    `# Deterministic keyword scan across these jobs (hint, not ground truth)`,
    localKeywords.slice(0, 40).join(', ') || '(none)',
    ``,
    `# Source CV (the only facts you may use, shared by every job)`,
    JSON.stringify(slice),
    ``,
    `# Jobs`,
    ...items.map(it => [
      `<<<JD job_id="${it.jobId}" title="${(it.jdMeta?.title || '').replace(/"/g, "'")}" company="${(it.jdMeta?.company || '').replace(/"/g, "'")}" location="${(it.jdMeta?.location || '').replace(/"/g, "'")}"`,
      it.jdText,
      `>>>`,
      ``,
    ].join('\n')),
    `Reminder: a JSON array of ${items.length} objects, each with its own job_id; only source bullet ids; no new numbers. Output the JSON now.`,
  ].join('\n');
}

export function render(req) { return `${systemText(req.options)}\n\n${userText(req)}`; }
