/**
 * Deterministic role-fit score. Draft safety/readiness is deliberately excluded:
 * unsupported wording can block export, but it does not make the candidate a
 * worse match for the role. This is a decision aid, not an employer ATS score.
 */
import { localScore } from './localScore.js';
import { atsAudit } from './ats.js';
import { buildRenderModel } from '../render/cvModel.js';

export const FIT_SCORE_VERSION = 'role_fit_v2';
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
export const fitBand = score => score >= 80 ? 'strong' : score >= 65 ? 'good' : score >= 45 ? 'stretch' : 'poor';

export function calibratedFitScore({ job, cv, result, report, accepted = false }) {
  const local = job.localBreakdown || localScore(job, cv);
  const model = buildRenderModel(cv, result, { jobMeta: { title: job.title, company: job.company } });
  const ats = atsAudit(model, job.jdClean || job.jdRaw || '', { jobTitle: job.title, masterCv: cv, excludedTerms: job.atsExcludedTerms || [] });
  const totalWeight = ats.keywords.reduce((n, k) => n + k.weight, 0);
  // Role fit asks whether the source CV supports the job terminology, not
  // whether a particular generated draft happened to include every phrase.
  const coveredWeight = ats.keywords.filter(k => k.supportable).reduce((n, k) => n + k.weight, 0);
  const coveragePct = totalWeight ? Math.round(coveredWeight / totalWeight * 100) : 0;

  const matched = result.fit?.matched_requirements?.length || 0;
  const missing = result.fit?.missing_requirements || [];
  const mustMissing = missing.filter(x => x.severity === 'must').length;
  const niceMissing = missing.filter(x => x.severity !== 'must').length;
  const requirementTotal = matched + mustMissing * 2 + niceMissing * 0.75;
  const requirementPct = requirementTotal ? Math.round(matched / requirementTotal * 100) : 0;
  const modelOpinion = clamp(Number(result.fit?.score) || 0);

  const components = {
    sourceEvidence: Math.round(coveragePct * 0.30),
    requirementEvidence: Math.round(requirementPct * 0.40),
    careerAlignment: Math.round(local.score * 0.20),
    modelOpinion: Math.round(modelOpinion * 0.10),
  };
  const rawScore = Object.values(components).reduce((a, b) => a + b, 0);
  let cap = 100;
  const caps = [];
  const applyCap = (value, reason) => { if (value < cap) cap = value; caps.push({ value, reason }); };
  if (local.dealBreakers?.length) applyCap(39, `Potential deal-breaker: ${local.dealBreakers.join(', ')}`);
  if (mustMissing === 1) applyCap(74, 'One must-have is recorded as missing');
  else if (mustMissing === 2) applyCap(64, 'Two must-haves are recorded as missing');
  else if (mustMissing >= 3) applyCap(54, `${mustMissing} must-haves are recorded as missing`);
  const redFlags = result.fit?.red_flags?.length || 0;
  if (redFlags === 1) applyCap(64, 'One eligibility or fit red flag needs review');
  else if (redFlags > 1) applyCap(54, `${redFlags} eligibility or fit red flags need review`);
  const score = clamp(Math.min(rawScore, cap));
  const evidenceItems = matched + missing.length;
  const confidence = ats.keywords.length >= 8 && evidenceItems >= 4 ? 'high' : ats.keywords.length >= 4 && evidenceItems >= 2 ? 'medium' : 'low';
  return {
    version: FIT_SCORE_VERSION, score, band: fitBand(score), rawScore, cap,
    modelOpinion, confidence, components,
    inputs: { coveragePct, requirementPct, localScore: local.score, matched, mustMissing, niceMissing, redFlags, keywordCount: ats.keywords.length, supportedHits: ats.keywords.filter(k => k.supportable).length },
    caps: caps.filter(x => x.value === cap),
  };
}

export const displayedFit = job => job.fitScore ?? job.aiScore ?? job.localScore;
export const displayedBand = job => job.fitBand || job.verdict || (displayedFit(job) == null ? null : fitBand(displayedFit(job)));
