/** Combine guardrail checks into one report. */
import { checkTraceability } from './traceability.js';
import { checkClaims } from './claims.js';
export function evaluate(result, cv, settings = {}) {
  const t = checkTraceability(result, cv);
  const c = checkClaims(result, settings.forbiddenClaims || []);
  const hardFailures = [...t.hard, ...c.hard];
  const warnings = [...t.warn, ...c.warn];
  if (result.tailoringMode === 'enhance') warnings.unshift('Enhanced draft: review all rewritten bullets, summary, skills and any cover letter. Confirm inferred responsibilities and skills are true before exporting.');
  return { passed: hardFailures.length === 0, hardFailures, warnings };
}
export function feedbackPrompt(report) {
  return `Your previous JSON violated these rules. Return a corrected JSON object only:\n${[...report.hardFailures, ...report.warnings].map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
}
