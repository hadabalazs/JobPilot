/** Reviewable CV-improvement ideas. These never become CV facts without the user's approval. */
export const VERSION = 'cv_improve_v2';

export function render({ job, cv }) {
  const cvFacts = {
    identity: cv.identity,
    summaries: cv.summary_variants,
    competencies: cv.competencies,
    experience: (cv.experience || []).map(({ id, employer, title, dates, bullets }) => ({ id, employer, title, dates, bullets })),
    skills: cv.skills,
    education: cv.education,
    certifications: cv.certifications,
    tailoring_context: cv.tailoring_context || { certifications: [], professional_context: '' },
  };
  return `You are an expert CV strategist. Review the master CV against this target job and propose maximum-impact improvements. You must never invent a credential, employer, title, tool, metric, or achievement.

Return JSON only, shaped exactly as:
{"schema_version":"cv_improvement_v2","suggestions":[{"tier":"safe|verify|build","title":"short action title","recommendation":"specific action","why":"why this improves this application","evidence_needed":"what the user must verify or collect; empty only for safe","next_step":"one concrete next step","proposal":{"kind":"bullet_rewrite","target_bullet_id":"existing bullet id","text":"replacement wording"}}]}

Rules:
- Give 3–8 suggestions in priority order.
- tier "safe": fully supported by the master CV; propose one exact replacement wording for one existing bullet. Set proposal.kind to "bullet_rewrite", proposal.target_bullet_id to that exact existing bullet id, and proposal.text to the complete replacement. Preserve every number, proper noun and factual claim from the source bullet. The user can add this exact proposal to their master CV with one click.
- tier "verify": plausible but not stated in the CV. Frame it as a question or evidence request. You may include a proposal with the same bullet_rewrite shape only when it is a truthful wording the user can explicitly confirm for this one job; it is never added to the Master CV.
- tier "build": a genuine gap. Suggest a truthful learning, portfolio, certification, or evidence-building action. Never imply it is already completed.
- For verify and build, set proposal to null. They must never be written into the CV.
- Focus on ATS keyword placement, quantified outcomes, proof of scope, role alignment, and real gaps from the job description.
- Keep every suggestion concise and actionable.

TARGET JOB:
${JSON.stringify({ title: job.title, company: job.company, description: job.jdClean })}

MASTER CV (the only source of existing facts):
${JSON.stringify(cvFacts)}`;
}
