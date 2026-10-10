/**
 * ATS rules layered on top of the fabrication rules.
 * Derived from documented 2026 parser behaviour (Workday, Greenhouse, Lever,
 * Taleo, iCIMS) — see DECISIONS.md for sources and reasoning.
 */
export const ATS_RULES = [
  'Mirror the job description\'s exact wording wherever it truthfully describes the source bullet. Matching is largely literal: if the posting says "program delivery", write "program delivery", not "programme delivery" or "project leadership". Only swap in the posting\'s term when the competency aliases confirm the meaning is identical.',
  'Carry acronym and spelled-out form together on first use when the posting uses either, e.g. "Scaled Agile Framework (SAFe)" — recruiters search both independently. Never introduce a certification or tool the source CV does not contain.',
  'Name tools exactly as the posting writes them (Jira, Confluence, Azure DevOps, MS Project), but only if that tool appears in the source CV.',
  'Place the two or three highest-weight requirement terms in the summary, since the top third of the CV carries the most ranking weight.',
  'Populate selection.skills_selected with 8-14 skills copied verbatim from the source CV skills groups, most JD-relevant first. Do not invent skills and do not reword them.',
  'Weave four to six of the top requirement terms into experience bullets. A term inside a dated role carries more weight than the same term in a bare skills list.',
  'Aim for each important keyword to appear two or three times across different sections (summary, skills, a bullet) — never four or more times, which reads as stuffing to both the ranker and the human after it.',
  'Shape every rewritten bullet as action verb + scoped object + measurable result, keeping the source\'s own numbers. Modern rankers weight quantified outcomes far above duty statements, so never drop a number that exists in the source.',
  'Put fit.keywords_present and fit.keywords_absent in the posting\'s exact wording — they drive the ATS keyword report.',
];
