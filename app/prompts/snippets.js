/** Shared prompt fragments. Keep the rules and the example in sync with schemas/tailor.js. */
export const RULES = [
  'You may only SELECT, REORDER and REPHRASE bullets that exist in the source CV, referenced by their exact ids.',
  'Never add employers, titles, dates, certifications, tools, numbers or achievements that are not in the source. Numbers may be dropped, never changed or added.',
  'Rephrasing may change wording, order and emphasis; it must preserve meaning and scope. Prefer the job description\'s vocabulary only where a competency alias says the meaning is identical.',
  'summary_override may only be composed from existing summary variants and selected bullets; otherwise set it to null and choose a summary_variant_id.',
  'Aim for the page target. If over, populate omit_experience_ids with the OLDEST roles first.',
  'Fit scoring rubric (be calibrated, not generous): strong 85–100 meets all must-haves and most nice-to-haves; good 70–84; stretch 50–69; poor below 50. Decide the verdict first, then the score.',
  'Put hard blockers (language, location, clearance, licence) in red_flags.',
  'Every bullet_id you reference must appear in the source. Set self_check honestly.',
  'If the output would be too long, truncate whole rewrite items, never mid-object, and add "truncated" to ai_notes.',
];
export const COVER_RULES = [
  'Cover letter: 3–4 paragraphs, at most 220 words total, no salutation and no sign-off (they are added by the template).',
  'Reference two concrete matched requirements with real evidence from the source CV.',
  'Avoid these phrases: "I am writing to", "passionate", "dynamic", "leverage", "synergy", "hit the ground running", "proven track record", "results-driven", "team player".',
];
export const EXAMPLE = {
  schema_version: 'tailor_result_v1', job_id: 'JOB_ID',
  fit: { verdict: 'good', score: 78,
    matched_requirements: [{ requirement: 'Lead multiple Scrum teams in a regulated environment', evidence_bullet_ids: ['b_x_01', 'b_x_02'] }],
    missing_requirements: [{ requirement: 'SAFe SPC certification', severity: 'nice', mitigation: 'Emphasise scaled-agile evidence' }],
    keywords_present: ['Scrum', 'release management'], keywords_absent: ['PI planning'], red_flags: [] },
  selection: { summary_variant_id: 'sum_delivery', summary_override: null, bullet_ids_in_order: { exp_x: ['b_x_01', 'b_x_02'] }, skills_order: ['Agile & Delivery', 'Tools'], omit_experience_ids: [] },
  rewrites: [{ bullet_id: 'b_x_01', text: '…', reason: "mirrors JD phrase 'release management'", keywords_injected: ['release management'] }],
  cover_letter: null, ai_notes: [], self_check: { all_ids_exist: true, no_new_numbers: true },
};
