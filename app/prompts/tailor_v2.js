/** tailor_v2: tailor_v1 plus explicit ATS optimisation. Do not edit once runs exist. */
import { TAILOR_RESULT_SCHEMA } from '../schemas/tailor.js';
import { RULES, COVER_RULES, EXAMPLE } from './snippets.js';
import { ATS_RULES } from './snippets_ats.js';

export const VERSION = 'tailor_v2';

export function systemText(opts = {}) {
  const rules = [...RULES, ...(opts.includeCover ? COVER_RULES : [])];
  return [
    'You are tailoring a CV for one specific job, optimised to pass an applicant tracking system (ATS) and the recruiter reading it afterwards. Output exactly one JSON object and nothing else: no prose, no markdown fences.',
    '',
    'Truthfulness rules — these override every ATS rule below. Keyword coverage is never worth a claim the source CV does not support:',
    ...rules.map((r, i) => `${i + 1}. ${r}`),
    '',
    'ATS optimisation rules:',
    ...ATS_RULES.map((r, i) => `${rules.length + i + 1}. ${r}`),
  ].join('\n');
}

export function userText(req) {
  const { jobId, jdText, jdMeta = {}, slice, localKeywords = [], atsKeywords = [], options = {} } = req;
  const example = { ...EXAMPLE, job_id: jobId };
  const fmt = k => `${k.term}${k.priority === 'critical' ? ' [critical]' : k.priority === 'high' ? ' [high]' : ''}${k.type !== 'phrase' ? ` (${k.type})` : ''}`;
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
    `# ATS keyword scan of this posting, highest weight first`,
    `Cover the [critical] terms if the source CV honestly supports them. Terms it does not support belong in fit.missing_requirements, never in a bullet.`,
    atsKeywords.slice(0, 30).map(fmt).join('\n') || '(none)',
    ``,
    `# Deterministic keyword scan (secondary hint)`,
    localKeywords.slice(0, 25).join(', ') || '(none)',
    ``,
    `# Source CV (the only facts you may use)`,
    JSON.stringify(slice),
    ``,
    `# Job description`,
    `<<<JD title="${(jdMeta.title || '').replace(/"/g, "'")}" company="${(jdMeta.company || '').replace(/"/g, "'")}" location="${(jdMeta.location || '').replace(/"/g, "'")}"`,
    jdText,
    `>>>`,
    ``,
    `Reminder: only source bullet ids; no new numbers, tools or certifications; mirror the posting's exact wording where it is truthful; JSON only. Output the JSON now.`,
  ].join('\n');
}

export function render(req) { return `${systemText(req.options)}\n\n${userText(req)}`; }
