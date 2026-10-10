import { useState } from 'preact/hooks';
import { html, Note, Field, toast, fmtDateTime } from './components.js';
import { atsAudit, plainCvText } from '../matching/ats.js';
import { buildRenderModel } from '../render/cvModel.js';
import { cleanJD, jobTextWarnings } from '../intake/clean.js';
import { loadJob, saveJob, recalibrateJobFit } from './store.js';

export function masterRenderModel(cv) {
  return buildRenderModel(cv, { selection: { bullet_ids_in_order: Object.fromEntries(cv.experience.map(e => [e.id, e.bullets.filter(b => !b.placeholder).map(b => b.id)])) }, rewrites: [] });
}
const PRE_FLIGHT = [
  ['eligibility', 'I checked work authorization, location, required credentials and application questions truthfully.'],
  ['accuracy', 'Every claim and enhancement is accurate; I can explain my contribution in an interview.'],
  ['file', 'I opened the exported file, checked page breaks and can copy its text in reading order.'],
  ['form', 'I checked the employer’s accepted file type/size and corrected any auto-filled fields.'],
];
export function AtsPanel({ job, cv, runs, onSave }) {
  const [runId, setRunId] = useState(runs[0]?.id || 'master');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  if (!cv) return html`<${Note} kind="warn">Import your Master CV first.<//>`;
  const run = runs.find(r => r.id === runId);
  const baseline = masterRenderModel(cv);
  const model = run ? buildRenderModel(cv, run.result) : baseline;
  const opts = { jobTitle: job.title, masterCv: cv, excludedTerms: job.atsExcludedTerms || [] };
  const report = atsAudit(model, job.jdClean, opts), before = atsAudit(baseline, job.jdClean, opts);
  const update = async changes => {
    setBusy(true);
    try { const latest = await loadJob(job.id); const saved = await saveJob({ ...latest, ...changes }); await recalibrateJobFit(saved, cv); await onSave(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const excluded = job.atsExcludedTerms || [];
  const checklistKey = run?.id || 'master';
  const checked = job.applicationChecks?.[checklistKey] || {};
  const toggleCheck = (key, value) => update({ applicationChecks: { ...job.applicationChecks, [checklistKey]: { ...checked, [key]: value } } });
  const warnings = jobTextWarnings(job.jdClean);
  const rows = showAll ? report.keywords : report.keywords.filter(k => !k.present || !k.supportable).slice(0, 8);
  return html`<div class="stack">
    <div class="topbar"><div><h2>Application readiness</h2><p class="muted small">Local checks, not an employer’s ATS score or an interview prediction.</p></div>
      <label>CV version<select value=${run?.id || 'master'} onChange=${e => setRunId(e.target.value)}><option value="master">Master CV — all source bullets</option>${runs.map(r => html`<option value=${r.id}>${fmtDateTime(r.createdAt)} · ${r.result.tailoringMode === 'enhance' ? 'Enhanced' : 'Tailored'} · ${r.provider}</option>`)}</select></label></div>
    ${warnings.map(w => html`<${Note} kind="warn">${w}<//>`)}
    ${run && !run.jdSnapshot ? html`<${Note}>This older run has no job-text snapshot. The report compares it against the current Job brief.<//>` : run && (run.jdSnapshot !== cleanJD(job.jdClean) || run.applicationContextSnapshot !== (job.applicationContext || '')) ? html`<${Note} kind="warn">The Job brief has changed since this run. Review the changes and tailor again if needed.<//>` : null}
    <div class="grid-3">
      <div class="panel"><div class="body"><div class="muted small">Exact-term coverage</div><h2>${report.keywordScore == null ? 'No terms' : `${report.keywordScore}%`}</h2><div class="small">${report.present.length} / ${report.keywords.length} detected terms${run ? ` · Master: ${before.keywordScore ?? '—'}%` : ''}</div></div></div>
      <div class="panel"><div class="body"><div class="muted small">Evidence available, wording missing</div><h2>${report.missingFixable.length}</h2><div class="small">Surface relevant facts already in your Master CV.</div></div></div>
      <div class="panel"><div class="body"><div class="muted small">Missing wording / evidence to clarify</div><h2>${report.genuineGaps.length}</h2><div class="small">May be an alias, omitted achievement or real gap—not permission to invent.</div></div></div>
    </div>
    <${Note}>Coverage counts all detected terms equally, including missing evidence. It ignores case and punctuation, not word boundaries. It is not semantic matching or a skills assessment. Priority labels are local heuristics. Review irrelevant extracted phrases below; employer search rules vary.<//>
    ${report.missingFixable.length ? html`<${Note} kind="warn"><b>Best next action:</b> bring forward relevant source evidence for ${report.missingFixable.slice(0, 8).map(k => k.term).join(', ')}. Check the evidence before re-running Tailor.<//>` : null}
    ${report.unverifiedAdditions.length ? html`<${Note} kind="warn"><b>New wording to verify:</b> ${report.unverifiedAdditions.slice(0, 10).map(k => k.term).join(', ')}. These terms appear in the draft but not literally in your source. They may be valid rephrasing; check each claim.<//>` : null}
    <div class="panel"><div class="head"><h2>Requirement → CV evidence</h2><button class="btn sm" onClick=${() => setShowAll(x => !x)}>${showAll ? 'Show top action items' : `Show all ${report.keywords.length} terms`}</button></div><div class="body stack">
      ${rows.length ? rows.map(k => html`<div class="evidence-row" key=${k.term}><div class="topbar"><div><b>${k.term}</b> <span class="muted small">${k.inRequirements ? 'Requirement' : k.preferred ? 'Preferred' : k.type} · ${k.priority === 'critical' ? 'higher priority' : k.priority}</span><div class="small">${k.present ? `Present in ${k.zones.join(', ')}` : 'Missing from this CV version'} · ${k.supportable ? 'Source wording found' : 'No exact source wording found'}</div></div><button class="btn ghost sm" disabled=${busy} onClick=${() => update({ atsExcludedTerms: [...excluded, k.term] })}>Ignore irrelevant term</button></div>
        <details><summary class="small">Why this term? See job text and evidence</summary><p class="small"><b>Job:</b> ${k.sources.join(' / ')}</p>${k.evidence.length ? k.evidence.map(e => html`<p class="small"><b>${e.label}:</b> ${e.text}</p>`) : html`<p class="small muted">If you have relevant experience under different wording, add a verified achievement in Master CV. Otherwise leave this as an honest gap.</p>`}</details></div>`) : html`<p>No action items among the detected terms. This is not a guarantee of eligibility or selection.</p>`}
      ${excluded.length ? html`<div class="small muted">Ignored terms: ${excluded.join(', ')}. <button class="btn ghost sm" disabled=${busy} onClick=${() => update({ atsExcludedTerms: [] })}>Restore ignored terms</button></div>` : null}
    </div></div>
    <div class="grid-2"><div class="panel"><div class="head"><h2>Formatting & readability</h2></div><div class="body"><ul class="checks">${report.checks.map(c => html`<li class=${c.pass ? 'pass' : 'fail'}><b>${c.pass ? '✓' : 'Review'} ${c.label}</b><span class="muted small">${c.note}</span></li>`)}</ul><p class="small muted">${report.quantified.count}/${report.quantified.total} bullets contain a number. Useful outcomes need context; a number alone does not prove impact. No quota is applied.</p></div></div>
    <div class="panel"><div class="head"><h2>Screening requirements to verify</h2></div><div class="body"><p class="small">Some employers filter on application answers independently of CV keywords. These are possible requirements, not detected rejection rules.</p>${report.screening.length ? html`<ul class="small">${report.screening.map(s => html`<li>${s}</li>`)}</ul>` : html`<p class="small muted">No obvious screening lines detected. Still check the full application form.</p>`}<p class="small muted">Never change a truthful answer to bypass screening.</p></div></div></div>
    <div class="panel"><div class="head"><h2>Before you apply</h2></div><div class="body stack">${PRE_FLIGHT.map(([key, label]) => html`<label class="checkline"><input type="checkbox" checked=${!!checked[key]} disabled=${busy} onChange=${e => toggleCheck(key, e.target.checked)} /> ${label}</label>`)}<p class="small muted">Saved for this CV version. Recheck after editing the CV or document. This checklist does not approve enhanced changes.</p></div></div>
    <details class="panel"><summary class="body">Plain-text reading-order preview</summary><div class="body"><p class="small muted">Diagnostic rendering from the CV data, not text extracted from your PDF. Compare with text copied from the exported file.</p><textarea readonly aria-label="Plain-text CV preview" value=${plainCvText(model)} style="min-height:380px"></textarea></div></details>
    <p class="muted small">Research: <a href="https://support.greenhouse.io/hc/en-us/articles/27104809835291-Talent-Filtering" target="_blank" rel="noopener noreferrer">Recruiter keyword searches</a> · <a href="https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse" target="_blank" rel="noopener noreferrer">Parsing limitations</a> · <a href="https://support.greenhouse.io/hc/en-us/articles/360000653472-Auto-reject" target="_blank" rel="noopener noreferrer">Application screening</a>. These describe one platform; they are not universal rules.</p>
  </div>`;
}
