import { RULES, COVER_RULES } from './snippets.js';
import { userText as contract } from './tailor_v2.js';
import { RESEARCH_RULES, contextText } from './ats_research_v1.js';
export const VERSION = 'tailor_v3';
export const systemText = (opts = {}) => ['Tailor this CV using only existing evidence. Return the complete requested JSON object, with all required arrays, and nothing else.',
  'Truthfulness rules override all optimisation advice:', ...RULES, ...(opts.includeCover ? COVER_RULES : []),
  'Evidence-informed tailoring guidance:', ...RESEARCH_RULES,
  'selection.skills_selected must contain only verbatim source skills. No new claims or inferred responsibilities in this mode.',
].join('\n');
export const userText = req => contract(req) + contextText(req);
export const render = req => systemText(req.options) + '\n\n' + userText(req);
