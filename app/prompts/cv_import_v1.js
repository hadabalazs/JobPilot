/** cv_import_v1: turns a pasted CV (any format) into a valid cv_master v2 JSON, via the same manual paste loop. */
export const VERSION = 'cv_import_v1';

const SKELETON = {
  schema_version: 2,
  identity: { full_name: '', headline: '', location: '', email: '', phone: '', links: [{ label: 'LinkedIn', url: '' }], work_authorization: '', languages: [{ name: '', level: '' }] },
  summary_variants: [{ id: 'sum_01', audience: 'general', text: '' }],
  competencies: [{ id: 'c_example', label: 'Delivery management', aliases: ['release management', 'programme delivery'] }],
  experience: [{ id: 'exp_employerslug', employer: '', title: '', location: '', start: 'YYYY-MM', end: null, industry: '', context: '',
    bullets: [{ id: 'b_employerslug_01', text: '', competencies: ['c_example'], keywords: [], metrics: { teams: 6 }, strength: 3, variants: [] }] }],
  education: [{ id: 'edu_1', institution: '', degree: '', start: '', end: '' }],
  certifications: [{ id: 'cert_1', name: '', issuer: '', year: 2022 }],
  skills: { groups: [{ label: 'Group name', items: [] }] },
  preferences: { target_titles: [], target_locations: [], industries_preferred: [], industries_avoid: [], seniority: '', must_haves: [], deal_breakers: [] },
};

const RULES = [
  'Copy facts exactly as written. Never invent employers, titles, dates, numbers, certifications or achievements, and never improve or embellish a bullet.',
  'If something is missing from the source, leave the field empty ("" or [] or null). Do not guess.',
  'Keep every bullet from every role. Do not merge, summarise or drop any.',
  'ids: experience "exp_<employer-slug>", bullets "b_<employer-slug>_01" (two digits, per role), summaries "sum_01", competencies "c_<label-slug>". Lowercase, underscores only, globally unique.',
  'competencies: derive 5–10 recurring themes from the CV (e.g. delivery management, stakeholder management, vendor management). Give each 2–5 aliases — the words a job ad would use for the same thing. Tag every bullet with the competency ids that apply.',
  'metrics: put every number that appears in the bullet into the metrics object with a descriptive key (e.g. {"squads":6,"engineers":45,"under_budget_pct":8}). This is what lets the app block invented figures later.',
  'keywords: 2–5 distinctive terms from the bullet itself.',
  'strength: 3 = strong measurable achievement, 2 = solid, 1 = routine duty.',
  'dates: "YYYY-MM" (or "YYYY" if that is all the source gives). Current role: "end": null.',
  'summary_variants: convert any existing profile/summary text. If there is none, leave the array empty.',
  'preferences: fill only from what the source states; otherwise leave the arrays empty.',
];

export function render({ cvText, notes = '' }) {
  return [
    'Convert the CV below into a single JSON object matching the structure and rules given. Output only the JSON: no prose, no markdown fences.',
    '',
    '# Rules',
    ...RULES.map((r, i) => `${i + 1}. ${r}`),
    '',
    '# Structure (field shapes; arrays repeat as needed)',
    JSON.stringify(SKELETON),
    '',
    notes ? `# Extra instructions from the owner\n${notes}\n` : '',
    '# CV source',
    '<<<CV',
    cvText,
    '>>>',
    '',
    'Reminder: copy facts exactly, keep every bullet, put every number in metrics, invent nothing. Output the JSON now.',
  ].filter(Boolean).join('\n');
}
