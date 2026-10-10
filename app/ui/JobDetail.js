import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { html, Chip, ScoreBar, Note, Field, toast, copyText, download, fmtDateTime } from './components.js';
import { loadRuns, loadEvents, buildRequest, activeProvider, saveRun, runAutomatic, setStatus, saveJob, artifactName, db, loadReviewSuggestions, buildCvImprovementPrompt, parseCvImprovements, saveCvImprovements, runCvImprovements, setCvImprovementStatus, applyVerifiedImprovementToRun, recalibrateJobFit } from './store.js';
import { buildPdfBlob, buildCoverLetterPdfBlob } from '../render/pdfDoc.js';
import { evaluate, feedbackPrompt } from '../guardrails/report.js';
import { buildRenderModel } from '../render/cvModel.js';
import { renderCvHtml } from '../render/cvHtml.js';
import { buildChangeSet } from '../render/diff.js';
import { AtsPanel } from './AtsReport.js';
import { JobBrief } from './JobBrief.js';
import { STATUS_LABELS, STATUSES, TRANSITIONS } from '../schemas/job.js';
import { bandFor } from '../matching/localScore.js';
import { RunModelPicker } from './RunModelPicker.js';
import { canonicalJobUrl } from '../intake/jobUrl.js';

const TABS = ['Tailor', 'Job brief', 'Fit', 'ATS', 'Improve CV', 'Changes', 'Preview', 'Timeline', 'Notes & links'];

export function JobDetail({ id, jobs, cv, settings, refresh, navigate }) {
  const job = jobs.find(j => j.id === id);
  const [tab, setTab] = useState('Tailor');
  const [runs, setRuns] = useState([]);
  const [events, setEvents] = useState([]);
  const [printCss, setPrintCss] = useState('');
  const reload = async () => { setRuns(await loadRuns(id)); setEvents(await loadEvents(id)); };
  useEffect(() => { reload(); fetch('app/render/print.css').then(r => r.text()).then(setPrintCss); }, [id]);
  if (!job) return html`<div class="empty"><h2>Job not found</h2><button class="btn" onClick=${() => navigate('#/inbox')}>Back to inbox</button></div>`;
  const duplicateJobs = job.sourceUrl ? jobs.filter(j => j.id !== job.id && canonicalJobUrl(j.sourceUrl) === canonicalJobUrl(job.sourceUrl)) : [];
  const latest = runs[0] || null;
  const onStatus = async e => { try { await setStatus(job, e.target.value, settings, { force: true }); toast(`Moved to ${STATUS_LABELS[e.target.value]}`); await refresh(); await reload(); } catch (err) { toast(err.message, 'bad'); } };
  return html`
    <div class="topbar"><div><button class="btn ghost sm" onClick=${() => navigate('#/inbox')}>← Inbox</button><h1 style="margin-top:6px">${job.title}${duplicateJobs.length ? html` <${Chip} kind="stretch">Duplicate link<//>` : null}</h1><div class="muted small">${[job.company, job.location, job.salaryText].filter(Boolean).join(' · ')}${job.sourceUrl ? html` · <a href=${job.sourceUrl} target="_blank" rel="noreferrer noopener">Open posting ↗</a>` : ''}</div>${duplicateJobs.length ? html`<div class="small" style="margin-top:6px;color:var(--warn-ink)">Same posting link as ${duplicateJobs.map((j, i) => html`${i ? ', ' : ''}<a href=${'#/job/' + j.id}>${j.title}</a>`)}</div>` : null}</div>
      <div class="actions" style="align-items:center">
        ${job.localScore != null ? html`<span class="small muted">Local</span><span class="score">${job.localScore}</span><${ScoreBar} value=${job.localScore} />` : null}
        ${job.fitScore != null ? html`<span class="small muted">Role fit</span><span class="score">${job.fitScore}</span><${Chip} kind=${job.fitBand}>${job.fitBand}<//>` : null}
        <select value=${job.status} onChange=${onStatus} aria-label="Status">
          <option value=${job.status}>${STATUS_LABELS[job.status]}</option>
          <optgroup label="Next">${(TRANSITIONS[job.status] || []).map(s => html`<option value=${s}>→ ${STATUS_LABELS[s]}</option>`)}</optgroup>
          <optgroup label="Anywhere else">${STATUSES.filter(s => s !== job.status && !(TRANSITIONS[job.status] || []).includes(s)).map(s => html`<option value=${s}>${STATUS_LABELS[s]}</option>`)}</optgroup>
        </select>
      </div></div>
    <div class="tabs" role="tablist">${TABS.map(t => html`<button role="tab" class="tab" aria-selected=${tab === t} onClick=${() => setTab(t)}>${t}${t === 'Tailor' && runs.length ? ` (${runs.length})` : ''}</button>`)}</div>
    ${tab === 'Tailor' ? html`<${TailorPanel} job=${job} cv=${cv} settings=${settings} runs=${runs} onSaved=${async () => { await refresh(); await reload(); }} />` : null}
    ${tab === 'Fit' ? html`<${FitPanel} job=${job} run=${latest} cv=${cv} />` : null}
    ${tab === 'ATS' ? html`<${AtsPanel} key=${job.id} job=${job} cv=${cv} runs=${runs} onSave=${refresh} />` : null}
    ${tab === 'Job brief' ? html`<${JobBrief} key=${job.id} job=${job} cv=${cv} onSave=${refresh} />` : null}
    ${tab === 'Improve CV' ? html`<${ImproveCvPanel} job=${job} cv=${cv} settings=${settings} runs=${runs} onRunSaved=${async () => { await refresh(); await reload(); }} />` : null}
    ${tab === 'Changes' ? html`<${Changes} cv=${cv} runs=${runs} /> ` : null}
    ${tab === 'Preview' ? html`<${Preview} job=${job} cv=${cv} settings=${settings} runs=${runs} css=${printCss} onChange=${reload} />` : null}
    ${tab === 'Timeline' ? html`<ul class="timeline">${events.length ? events.map(e => html`<li key=${e.id}><time>${fmtDateTime(e.at)}</time><span>${e.kind === 'status_change' ? `${STATUS_LABELS[e.fromStatus]} → ${STATUS_LABELS[e.toStatus]}` : e.kind === 'follow_up_due' ? 'Follow-up due' : e.kind}${e.payload?.note ? ` — ${e.payload.note}` : ''}</span></li>`) : html`<li class="muted">No events yet.</li>`}</ul>` : null}
    ${tab === 'Notes & links' ? html`<${NotesAndLinks} job=${job} onSave=${refresh} />` : null}`;
}

function TailorPanel({ job, cv, settings, runs, onSaved }) {
  const [mode, setMode] = useState('tailor');
  const [providerId, setProviderId] = useState(settings.activeProviderId);
  const [modelId, setModelId] = useState('');
  const [includeCover, setIncludeCover] = useState(false);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [progress, setProgress] = useState(null);   // { stage, since, meta }
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef(null);
  const taRef = useRef(null);
  const provider = useMemo(() => activeProvider(settings, providerId, modelId), [settings, providerId, modelId]);
  const latest = runs[0];
  const req = useMemo(() => (cv ? buildRequest(job, cv, settings, { includeCover, mode }) : null), [job, cv, settings, includeCover, mode]);
  const prepared = useMemo(() => (req ? provider.prepare(req) : null), [req, provider]);
  const ingest = useMemo(() => { if (!pasted.trim() || !req) return null; const r = provider.ingest(req, pasted); if (!r.ok) return r; return { ...r, report: evaluate(r.result, cv, settings) }; }, [pasted, req, provider, cv, settings]);
  const copyPrompt = async () => { const text = prepared.system ? `${prepared.system}\n\n${prepared.promptText}` : prepared.promptText; await copyText(text) ? toast('Prompt copied — paste it into your AI chat') : toast('Copy failed; use Show prompt', 'bad'); };
  const save = async () => {
    setBusy(true);
    try { await saveRun({ job, cv, settings, provider, req, result: ingest.result, raw: pasted, usage: null, truncated: ingest.truncated }); toast(ingest.report.passed ? 'Run saved' : 'Run saved with hard failures — fix before export'); setPasted(''); await onSaved(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const auto = async () => {
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setBusy(true); setElapsed(0); setProgress({ stage: 'prompt', meta: {} });
    try {
      const out = await runAutomatic({ job, cv, settings, providerId, modelId, includeCover, mode, signal: ctrl.signal, onStage: (stage, meta = {}) => setProgress(p => ({ stage, meta: { ...(p?.meta || {}), ...meta } })) });
      if (mode === 'enhance') {
        try {
          const ideas = await runCvImprovements({ job, cv, settings, providerId, modelId, signal: ctrl.signal });
          let currentRun = out.run, applied = 0;
          for (const item of ideas.saved.filter(x => x.suggestion?.tier === 'safe' && x.suggestion?.proposal)) {
            try { currentRun = (await applyVerifiedImprovementToRun({ item, run: currentRun, job, cv, settings })).run; applied++; }
            catch { /* Keep an unusable proposal pending for review instead of losing the tailored CV. */ }
          }
          toast(`Tailored and created ${ideas.saved.length} improvement ideas${applied ? ` — ${applied} safe improvement${applied === 1 ? '' : 's'} added to this CV` : ''}. Review Verify and Build ideas in Improve CV.`);
        } catch (ideaErr) {
          toast(`Tailored, but improvement ideas could not be created: ${ideaErr.message}`, 'warn');
        }
      } else toast(`Tailored via ${provider.name} — role fit ${out.run.fitScore.score}${out.run.costUsd ? `, $${out.run.costUsd.toFixed(4)}` : ''}`);
      await onSaved();
    } catch (e) { toast(e.name === 'AbortError' ? 'Run cancelled' : e.message, 'bad'); }
    finally { setBusy(false); setProgress(null); abortRef.current = null; }
  };
  useEffect(() => { if (!busy) return; const t = setInterval(() => setElapsed(e => e + 1), 1000); return () => clearInterval(t); }, [busy]);
  useEffect(() => {
    const onKey = e => { if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return; if (e.key === 'c' && prepared) copyPrompt(); if (e.key === 'v') taRef.current?.focus(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [prepared]);
  if (!cv) return html`<${Note} kind="warn">Import your master CV before tailoring.<//>`;
  return html`<div class="split">
    <div class="stack">
      <div class="panel"><div class="body stack"><label for="tailoring-mode"><b>Run type</b></label><select id="tailoring-mode" disabled=${busy || !!pasted.trim()} value=${mode} onChange=${e => setMode(e.target.value)}><option value="tailor">Tailor — evidence-only CV</option><option value="enhance">Tailor & improve — CV plus review ideas</option></select><div class="small muted">${mode === 'enhance' ? 'Creates a stronger job-specific draft, then generates Safe, Verify and Build ideas. Safe, CV-backed rewrites are added automatically to this job’s CV; Verify ideas remain highlighted for your approval. Build ideas are plans only and never become CV claims.' : 'Creates a job-specific CV by selecting and rewording existing evidence. It does not change your Master CV or create improvement ideas.'}</div></div></div>
      ${latest && !pasted ? html`<${RunDone} run=${latest} cv=${cv} onNewRun=${() => taRef.current?.focus()} />` : html`
      <div class="steps">
        <div class="step done"><b>1 · Copy prompt</b>${req.sliceInfo.bullets} bullets · ~${req.sliceInfo.estTokens} tokens</div>
        <div class="step ${pasted ? 'done' : ''}"><b>2 · Paste into your AI chat</b>Free tier is fine. Copy the JSON reply.</div>
        <div class="step ${ingest?.ok ? 'done' : ''}"><b>3 · Paste reply here</b>Checked for invented facts, then rendered.</div>
      </div>`}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <${RunModelPicker} settings=${settings} providerId=${providerId} modelId=${modelId} busy=${busy || !!pasted.trim()} onProviderChange=${setProviderId} onModelChange=${setModelId} />
        <button class="btn primary" onClick=${copyPrompt}>Copy prompt <kbd>c</kbd></button>
        <button class="btn" onClick=${() => setShowPrompt(s => !s)}>${showPrompt ? 'Hide' : 'Show'} prompt</button>
        <label class="btn ghost"><input type="checkbox" checked=${includeCover} onChange=${e => setIncludeCover(e.target.checked)} /> Generate cover letter</label>
        ${provider.kind !== 'manual' ? html`<button class="btn" disabled=${busy} onClick=${auto}>${busy ? 'Running…' : `${mode === 'enhance' ? 'Tailor & improve' : 'Tailor'} with ${provider.name}`}</button>` : null}
      </div>
      ${busy && progress ? html`<${RunProgress} progress=${progress} elapsed=${elapsed} provider=${provider} onCancel=${() => abortRef.current?.abort()} />` : null}
      ${showPrompt ? html`<textarea class="mono" readonly style="min-height:260px" value=${prepared.system ? `${prepared.system}\n\n${prepared.promptText}` : prepared.promptText}></textarea>` : null}
      <${Field} label="AI response" hint="Paste the whole reply; fences and stray text are tolerated."><textarea ref=${taRef} class="mono" value=${pasted} onInput=${e => setPasted(e.target.value)} placeholder='{"schema_version":"tailor_result_v1", …}' style="min-height:200px"></textarea><//>
      ${ingest && !ingest.ok ? html`<${Note} kind="bad">${ingest.error}<//>` : null}
      ${ingest?.ok ? html`<${GuardrailReport} report=${ingest.report} truncated=${ingest.truncated} />
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" disabled=${busy} onClick=${save}>Save run${ingest.report.passed ? '' : ' (with failures)'}</button>
          ${!ingest.report.passed || ingest.report.warnings.length ? html`<button class="btn" onClick=${async () => (await copyText(feedbackPrompt(ingest.report))) && toast('Correction prompt copied — paste it as a follow-up in the same chat')}>Copy correction prompt</button>` : null}
        </div>` : null}
    </div>
    <div class="stack">
      <h3>Job description</h3>
      <div class="jd">${job.jdClean}</div>
    </div>
  </div>`;
}

export function GuardrailReport({ report, truncated }) {
  return html`<div class="stack">
    ${truncated ? html`<${Note} kind="warn">The reply looked truncated; a partial result was recovered. Consider asking for the rest.<//>` : null}
    ${report.hardFailures.length ? html`<${Note} kind="bad"><b>Blocked — invented or unknown content:</b><ul>${report.hardFailures.map(f => html`<li>${f}</li>`)}</ul><//>` : html`<${Note} kind="good">No invented numbers, all ids trace back to your master CV.<//>`}
    ${report.warnings.length ? html`<${Note} kind="warn"><b>Check before exporting:</b><ul>${report.warnings.map(f => html`<li>${f}</li>`)}</ul><//>` : null}
  </div>`;
}

function FitPanel({ job, run, cv }) {
  const lb = job.localBreakdown;
  const fit = run?.result?.fit;
  const calibrated = run?.fitScore;
  return html`<div class="split">
    <div class="stack">
      <h3>Role fit ${run ? html`<span class="muted">· ${fmtDateTime(run.createdAt)}</span>` : ''}</h3>
      ${!fit ? html`<${Note}>No tailoring run yet. The evidence score appears after the first run.<//>` : html`
        <div style="display:flex;align-items:center;gap:10px"><span class="score" style="font-size:28px">${calibrated?.score ?? fit.score}</span><${Chip} kind=${calibrated?.band ?? fit.verdict}>${calibrated?.band ?? fit.verdict}<//><span class="muted small">${calibrated ? `${calibrated.confidence} confidence` : 'legacy score'}</span></div>
        ${calibrated ? html`<div class="panel"><div class="head"><h2>How this score was built</h2></div><div class="body">
          <dl class="kv"><dt>Source CV evidence</dt><dd>${calibrated.components.sourceEvidence} / 30 <span class="muted">(${calibrated.inputs.coveragePct}% weighted role terminology supported)</span></dd>
          <dt>Requirement evidence</dt><dd>${calibrated.components.requirementEvidence} / 40 <span class="muted">(${calibrated.inputs.matched} matched; ${calibrated.inputs.mustMissing} must-have and ${calibrated.inputs.niceMissing} preferred gaps)</span></dd>
          <dt>Career alignment</dt><dd>${calibrated.components.careerAlignment} / 20 <span class="muted">(pre-tailor alignment ${calibrated.inputs.localScore})</span></dd>
          <dt>Model opinion</dt><dd>${calibrated.components.modelOpinion} / 10 <span class="muted">(model said ${calibrated.modelOpinion})</span></dd></dl>
          ${calibrated.caps.length ? html`<div class="note warn small"><b>Score capped at ${calibrated.cap}:</b> ${calibrated.caps.map(x => x.reason).join('; ')}</div>` : null}
        </div></div>` : html`<${Note} kind="warn">This is an older model-supplied score. Reload the app to recalculate it.<//>`}
        <h3>AI requirement analysis <span class="muted small">· opinion ${fit.score}, not the headline score</span></h3>
        ${fit.red_flags.length ? html`<${Note} kind="bad"><b>Red flags</b><ul>${fit.red_flags.map(x => html`<li>${x}</li>`)}</ul><//>` : null}
        <div class="panel"><div class="head"><h2>Matched</h2></div><div class="body"><ul class="list-plain small">${fit.matched_requirements.map(m => html`<li>${m.requirement} <span class="mono muted">${m.evidence_bullet_ids.join(', ')}</span></li>`)}</ul></div></div>
        <div class="panel"><div class="head"><h2>Missing</h2></div><div class="body"><ul class="list-plain small">${fit.missing_requirements.map(m => html`<li><${Chip} kind=${m.severity === 'must' ? 'bad' : ''}>${m.severity}<//> ${m.requirement}${m.mitigation ? html`<div class="muted">↳ ${m.mitigation}</div>` : ''}</li>`)}</ul></div></div>
        <div class="small"><b>Keywords present:</b> ${fit.keywords_present.join(', ') || '—'}<br/><b>Absent:</b> ${fit.keywords_absent.join(', ') || '—'}</div>`}
    </div>
    <div class="stack">
      <h3>Local pre-filter (no AI)</h3>
      ${!lb ? html`<${Note}>Not scored — import a master CV.<//>` : html`
        <div style="display:flex;align-items:center;gap:10px"><span class="score" style="font-size:28px">${lb.score}</span><${Chip} kind=${bandFor(lb.score)}>${bandFor(lb.score)}<//></div>
        <dl class="kv"><dt>Keyword coverage</dt><dd>${lb.breakdown.keywordCoverage} / 55 (${lb.breakdown.coveragePct}% of weighted terms)</dd><dt>Competencies</dt><dd>${lb.breakdown.competencies} / 15</dd><dt>Title</dt><dd>${lb.breakdown.title} / 15 ${lb.titleHit ? `(${lb.titleHit})` : ''}</dd><dt>Location</dt><dd>${lb.breakdown.location} / 10 ${lb.locationHit ? `(${lb.locationHit})` : ''}</dd><dt>Industry</dt><dd>+${lb.breakdown.industry}</dd><dt>Penalties</dt><dd>−${lb.breakdown.penalty}${lb.dealBreakers.length ? ` (deal-breaker: ${lb.dealBreakers.join(', ')})` : ''}</dd></dl>
        <div class="small"><b>Found in CV:</b> ${lb.hits.join(', ') || '—'}</div>
        <div class="small"><b>Not found:</b> ${lb.misses.join(', ') || '—'}</div>`}
    </div></div>`;
}

function Preview({ job, cv, settings, runs, css, onChange }) {
  const [runId, setRunId] = useState(runs[0]?.id);
  const run = runs.find(r => r.id === runId) || runs[0];
  const [accepted, setAccepted] = useState(false);
  const [overridden, setOverridden] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [highlight, setHighlight] = useState(true);
  const [showWhy, setShowWhy] = useState(true);
  const frameRef = useRef(null);
  useEffect(() => { setAccepted(false); setOverridden(false); setConfirming(false); }, [run?.id]);
  if (!run) return html`<${Note}>Nothing to preview yet — save a tailoring run first.<//>`;
  const failOverridden = overridden || run.overridden;
  const blocked = (!run.report.passed && !failOverridden) || (run.report.warnings.length && !accepted && !run.accepted);
  const model = buildRenderModel(cv, run.result, { includeCover: run.includeCover, jobMeta: { company: job.company, title: job.title } });
  const coverText = model.cover ? [
    model.cover.subject ? `Subject: ${model.cover.subject}` : '',
    'Dear Hiring Manager,',
    ...(model.cover.paragraphs || []),
    `Kind regards,\n${model.identity?.full_name || ''}`,
  ].filter(Boolean).join('\n\n') : '';
  const cvPdfName = artifactName(cv, job, settings, 'pdf');
  const coverPdfName = cvPdfName.replace(/\.pdf$/i, '_cover_letter.pdf');
  const coverTxtName = coverPdfName.replace(/\.pdf$/i, '.txt');
  const cs = buildChangeSet(cv, run.result);
  const enhanced = run.result.tailoringMode === 'enhance';
  const doc = renderCvHtml(model, css, highlight ? { highlightIds: cs.rewrittenIds, highlightSummary: !!run.result.selection?.summary_override, highlightSkills: enhanced, highlightCover: enhanced, notes: showWhy ? cs.notes : {} } : {});
  const print = () => {
    toast('For a clean ATS PDF, use “Download clean PDF”. Browser printing can add its own URL/date footer unless you turn off “Headers and footers” in the print dialog.', 'warn');
    frameRef.current?.contentWindow?.print();
  };
  const rejectEnhancement = async (kind, id) => {
    try {
      const result = structuredClone(run.result);
      if (kind === 'bullet') result.rewrites = result.rewrites.filter(w => w.bullet_id !== id);
      if (kind === 'summary') result.selection.summary_override = null;
      if (kind === 'skills') result.selection.skills_selected = null;
      const report = evaluate(result, cv, settings);
      await db.put('tailorRuns', { ...run, originalEnhancedResult: run.originalEnhancedResult || run.result, result, report, accepted: false, overridden: false, fitScore: null });
      const current = await db.get('jobs', job.id);
      if (current.bestRunId === run.id) await saveJob({ ...current, bestRunId: null });
      await recalibrateJobFit(await db.get('jobs', job.id), cv);
      setAccepted(false); setOverridden(false); await onChange(); toast('Proposal removed from this draft. Review the remaining changes.');
    } catch (e) { toast(e.message, 'bad'); }
  };
  const accept = async () => { await db.put('tailorRuns', { ...run, accepted: true, fitScore: null }); if (run.report.passed || failOverridden) await saveJob({ ...(await db.get('jobs', job.id)), bestRunId: run.id }); await recalibrateJobFit(await db.get('jobs', job.id), cv); setAccepted(true); await onChange(); };
  const override = async () => {
    await db.put('tailorRuns', { ...run, overridden: true, overriddenAt: new Date().toISOString() });
    if (!enhanced || accepted || run.accepted) await db.put('jobs', { ...job, bestRunId: run.id, updatedAt: new Date().toISOString() });
    setOverridden(true); setConfirming(false); await onChange();
    toast('Export unblocked — the failures stay on record for this run');
  };
  return html`<div class="stack">
    <${Note} kind=${enhanced ? 'warn' : 'info'}><b>${enhanced ? 'Tailor & enhance draft' : 'Tailored draft'}</b>${enhanced ? ' — Review the proposed wording below and in Changes. Shading identifies rewritten bullets, summary, skills and cover letter on screen. Approve only claims you can substantiate.' : ' — based on existing CV evidence.'}<//>
    ${enhanced ? html`<div class="panel"><div class="head"><h2>Enhancement review</h2></div><div class="body stack small">${(run.result.rewrites || []).map(w => html`<div><b>${w.bullet_id}</b> <button class="btn ghost sm" onClick=${() => rejectEnhancement('bullet', w.bullet_id)}>Reject rewrite</button><div style="background:#fff2ce;padding:8px">${w.text}</div><div>${w.reason || 'Review this rewording against the original in Changes.'}</div></div>`)}${run.result.selection?.summary_override ? html`<div><b>Proposed summary</b> <button class="btn ghost sm" onClick=${() => rejectEnhancement('summary')}>Restore original summary</button><div style="background:#fff2ce;padding:8px">${run.result.selection.summary_override}</div></div>` : null}<div><b>Proposed skills:</b> <button class="btn ghost sm" onClick=${() => rejectEnhancement('skills')}>Restore original skills</button> ${(run.result.selection?.skills_selected || []).join(', ') || 'Original skill groups'}</div>${(run.result.ai_notes || []).map(n => html`<div>${n}</div>`)}</div></div>` : null}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${runs.length > 1 ? html`<select value=${run.id} onChange=${e => setRunId(e.target.value)}>${runs.map(r => html`<option value=${r.id}>${fmtDateTime(r.createdAt)} · ${r.result.tailoringMode === 'enhance' ? 'Enhanced' : 'Tailored'} · ${r.provider} · fit ${r.fitScore?.score ?? r.result.fit.score}</option>`)}</select>` : null}
      <button class="btn primary" disabled=${blocked} onClick=${async () => { try { download(cvPdfName, await buildPdfBlob({ ...model, cover: null }), 'application/pdf'); toast('Clean ATS CV downloaded — no JobPilot URL, date or browser footer included.'); } catch (e) { toast(e.message, 'bad'); } }}>Download CV PDF</button>
      <button class="btn" disabled=${blocked} onClick=${print}>Browser print…</button>
      <button class="btn" disabled=${blocked} onClick=${() => download(artifactName(cv, job, settings, 'html'), doc, 'text/html')}>Download HTML</button>
      <label class="btn ghost sm"><input type="checkbox" checked=${highlight} onChange=${e => setHighlight(e.target.checked)} /> Highlight tailored parts</label>
      <label class="btn ghost sm"><input type="checkbox" checked=${showWhy} disabled=${!highlight} onChange=${e => setShowWhy(e.target.checked)} /> Show why</label>
      <span class="muted small">Suggested name: ${cvPdfName}</span>
    </div>
    <div class="muted small">Use <b>Download CV PDF</b> for applications. It contains only your CV data—no JobPilot link, source URL, export date or browser footer. If you use Browser print, turn off <b>Headers and footers</b> in the print dialog.</div>
    ${model.cover ? html`<div class="panel"><div class="head"><h2>Generated cover letter</h2><${Chip} kind="good">Ready<//></div><div class="body stack">
      <div class="muted small">Review and edit the text after downloading if needed. The PDF is a separate, clean document with no JobPilot footer or source link.</div>
      <textarea readonly style="min-height:260px;white-space:pre-wrap" value=${coverText}></textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn" disabled=${blocked} onClick=${async () => (await copyText(coverText)) ? toast('Cover letter copied') : toast('Copy failed', 'bad')}>Copy text</button>
        <button class="btn" disabled=${blocked} onClick=${() => download(coverTxtName, coverText, 'text/plain')}>Download text</button>
        <button class="btn primary" disabled=${blocked} onClick=${async () => { try { download(coverPdfName, await buildCoverLetterPdfBlob(model), 'application/pdf'); toast('Clean cover letter PDF downloaded'); } catch (e) { toast(e.message, 'bad'); } }}>Download cover letter PDF</button>
        <span class="muted small">${coverPdfName}</span>
      </div>
    </div></div>` : html`<${Note}>Want a cover letter too? In <b>Tailor</b>, select <b>Generate cover letter</b>, then run or paste a new AI response.<//>`}
    ${highlight ? html`<div class="muted small">${cs.rewrittenIds.size} bullet${cs.rewrittenIds.size === 1 ? '' : 's'} reworded for this job — shaded below${showWhy ? ', each with a one-line note on why' : ''}. Both are screen-only and never appear in the PDF.</div>` : null}
    ${!run.report.passed && !failOverridden ? html`<${Note} kind="bad">
      <b>Export blocked — ${run.report.hardFailures.length} thing${run.report.hardFailures.length === 1 ? '' : 's'} could not be traced back to your master CV:</b>
      <ul>${run.report.hardFailures.map(f => html`<li>${f}</li>`)}</ul>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${confirming
          ? html`<span><b>Only if every line above is factually true of you.</b></span>
                 <button class="btn sm danger" onClick=${override}>Yes — the CV is correct, unblock export</button>
                 <button class="btn ghost sm" onClick=${() => setConfirming(false)}>Cancel</button>`
          : html`<button class="btn sm" onClick=${() => setConfirming(true)}>Use it anyway…</button>
                 <span class="muted small">Or go back to Tailor and re-run with the correction prompt.</span>`}
      </div><//>` : null}
    ${!run.report.passed && failOverridden ? html`<${Note} kind="warn"><b>You accepted ${run.report.hardFailures.length} guardrail failure${run.report.hardFailures.length === 1 ? '' : 's'} on this run.</b> Check the highlighted text once more before you send it.
      <ul>${run.report.hardFailures.map(f => html`<li>${f}</li>`)}</ul><//>` : null}
    ${run.report.warnings.length && !accepted && !run.accepted ? html`<${Note} kind="warn">Warnings need your confirmation before export:<ul>${run.report.warnings.map(w => html`<li>${w}</li>`)}</ul><div style="margin-top:8px"><button class="btn sm" onClick=${accept}>I've checked these — they're true</button></div><//>` : null}
    <iframe ref=${frameRef} class="preview" title="CV preview" srcdoc=${doc}></iframe>
  </div>`;
}

/** A separate review queue: approved ideas remain a plan, never an automatic CV edit. */
function ImproveCvPanel({ job, cv, settings, runs, onRunSaved }) {
  const [items, setItems] = useState([]);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showStretch, setShowStretch] = useState(true);
  const [providerId, setProviderId] = useState(settings.activeProviderId);
  const [modelId, setModelId] = useState('');
  const provider = useMemo(() => activeProvider(settings, providerId, modelId), [settings, providerId, modelId]);
  const prompt = useMemo(() => cv ? buildCvImprovementPrompt(job, cv) : '', [job, cv]);
  const reload = async () => setItems(await loadReviewSuggestions(job.id));
  useEffect(() => { reload(); }, [job.id]);
  if (!cv) return html`<${Note} kind="warn">Import your master CV before requesting improvements.<//>`;
  const savePasted = async () => {
    const parsed = parseCvImprovements(pasted);
    if (!parsed.ok) return toast(parsed.error, 'bad');
    await saveCvImprovements({ job, suggestions: parsed.suggestions, provider: 'Manual review' });
    setPasted(''); await reload(); toast(`${parsed.suggestions.length} suggestions ready for review`);
  };
  const generate = async () => {
    setBusy(true);
    try { const out = await runCvImprovements({ job, cv, settings, providerId, modelId }); await reload(); toast(`${out.saved.length} suggestions ready for review${out.truncated ? ' (response was truncated)' : ''}`); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const decide = async (item, status) => { await setCvImprovementStatus(item, status); await reload(); toast(status === 'approved' ? 'Added to your approved improvement plan' : 'Suggestion rejected'); };
  const addToCurrentCv = async item => {
    setBusy(true);
    try { await applyVerifiedImprovementToRun({ item, run: runs[0], job, cv, settings }); await reload(); await onRunSaved(); toast(`${item.suggestion.tier === 'verify' ? 'Confirmed' : 'Approved'} wording added to this job’s CV only`); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const safe = items.filter(x => x.suggestion.tier === 'safe');
  const stretch = items.filter(x => x.suggestion.tier !== 'safe');
  const card = item => {
    const s = item.suggestion;
    const label = s.tier === 'safe' ? 'Supported by your CV' : s.tier === 'verify' ? 'Verify before adding' : 'Build / close a gap';
    const kind = s.tier === 'safe' ? 'good' : 'stretch';
    return html`<div class="panel" key=${item.id}><div class="head"><h2>${s.title}</h2><${Chip} kind=${kind}>${label}<//></div><div class="body stack small">
      <div><b>Recommendation:</b> ${s.recommendation}</div><div><b>Why this matters:</b> ${s.why}</div>
      ${s.evidenceNeeded ? html`<div><b>Before adding it:</b> ${s.evidenceNeeded}</div>` : null}<div><b>Next step:</b> ${s.nextStep}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${item.status === 'applied'
        ? html`<${Chip} kind="good">Added to Master CV<//>`
        : ['safe', 'verify'].includes(item.suggestion.tier) && s.proposal
          ? html`<button class="btn primary sm" disabled=${busy || !runs.length} onClick=${() => addToCurrentCv(item)}>${item.suggestion.tier === 'verify' ? 'Confirm & add to this CV' : 'Add to this CV'}</button><button class="btn ghost sm" onClick=${() => decide(item, 'rejected')}>Reject</button>${!runs.length ? html`<span class="muted small">Tailor this job first.<//>` : null}`
          : item.status === 'pending'
            ? html`<button class="btn sm" onClick=${() => decide(item, 'approved')}>Keep as plan</button><button class="btn ghost sm" onClick=${() => decide(item, 'rejected')}>Reject</button>`
            : html`<${Chip} kind=${item.status === 'approved' ? 'good' : ''}>${item.status}<//><button class="btn ghost sm" onClick=${() => decide(item, 'pending')}>Return to review</button>`}</div>
    </div></div>`;
  };
  return html`<div class="split"><div class="stack">
    <div class="panel"><div class="head"><h2>CV improvement review</h2></div><div class="body stack">
      <${Note}>This page is optional. Tailoring creates a job-specific CV; it never changes your source CV. Safe and verified ideas can be added only to this job’s CV, highlighted for review. Build ideas stay as plans because a real gap must not become a CV claim.<//>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><${RunModelPicker} settings=${settings} providerId=${providerId} modelId=${modelId} busy=${busy} onProviderChange=${setProviderId} onModelChange=${setModelId} /><button class="btn primary" disabled=${busy} onClick=${generate}>${busy ? 'Generating…' : `Generate with ${provider.name}`}</button><button class="btn" onClick=${async () => (await copyText(prompt)) && toast('Review prompt copied')}>Copy review prompt</button><button class="btn ghost" onClick=${() => setShowPrompt(x => !x)}>${showPrompt ? 'Hide' : 'Show'} prompt</button></div>
      ${showPrompt ? html`<textarea class="mono" readonly value=${prompt} style="min-height:220px"></textarea>` : null}
      ${provider.kind === 'manual' ? html`<${Note} kind="warn">Your active provider is Manual. Copy the prompt, paste it into an AI chat, then paste its JSON response below.<//>` : null}
      <${Field} label="Paste review JSON" hint="Only needed for the manual route; the API button saves suggestions automatically."><textarea class="mono" value=${pasted} onInput=${e => setPasted(e.target.value)} placeholder='{"schema_version":"cv_improvement_v1","suggestions":[…]}' style="min-height:100px"></textarea><//>
      <button class="btn" disabled=${!pasted.trim()} onClick=${savePasted}>Save pasted suggestions</button>
    </div></div>
    <h3>Safe improvements for this CV</h3>${safe.length ? safe.map(card) : html`<${Note}>Generate suggestions to see evidence-backed ways to sharpen this CV for the role.<//>`}
    <div style="display:flex;align-items:center;justify-content:space-between"><h3>Growth ideas requiring review</h3><button class="btn ghost sm" onClick=${() => setShowStretch(x => !x)}>${showStretch ? 'Hide' : 'Show'} ${stretch.length}</button></div>
    ${showStretch && (stretch.length ? stretch.map(card) : html`<p class="muted small">No unverified or build-first ideas yet.</p>`)}
  </div><div class="stack"><h3>How it works</h3><div class="jd small"><b>Tailor</b> — creates a role-specific CV version. Your Master CV is unchanged.\n\n<b>Improve CV</b> — optional. It offers job-specific wording to approve or reject. It never edits your Master CV.\n\n<b>Safe</b> — backed by existing source material. Add to this CV makes a highlighted change in this job’s draft only.\n\n<b>Verify</b> — may be true, but your CV does not prove it. Confirm & add to this CV applies it only to this job’s draft.\n\n<b>Build</b> — a real skill, portfolio, certification, or experience gap to close. It is never added as a CV claim.</div></div></div>`;
}

function NotesAndLinks({ job, onSave }) {
  const [notes, setNotes] = useState(job.notes || '');
  const [sourceUrl, setSourceUrl] = useState(job.sourceUrl || '');
  const [links, setLinks] = useState(job.links || []);
  const setLink = (i, patch) => setLinks(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const save = async () => {
    const clean = links.filter(l => (l.url || '').trim()).map(l => ({ label: (l.label || '').trim() || 'Link', url: l.url.trim() }));
    await saveJob({ ...job, notes, sourceUrl: sourceUrl.trim(), links: clean });
    setLinks(clean); toast('Saved'); onSave();
  };
  return html`<div class="stack"><div class="split">
    <div class="stack">
      <h3>Notes</h3>
      <textarea value=${notes} onInput=${e => setNotes(e.target.value)} placeholder="Referral, recruiter name, salary discussed, interview prep…" style="min-height:260px"></textarea>
    </div>
    <div class="stack">
      <h3>Links</h3>
      <${Field} label="Job posting" hint="Filled automatically when a job arrives via the bookmarklet."><div style="display:flex;gap:8px"><input type="url" value=${sourceUrl} onInput=${e => setSourceUrl(e.target.value)} placeholder="https://…" /><a class="btn ghost sm" href=${sourceUrl || '#'} target="_blank" rel="noreferrer noopener" aria-disabled=${!sourceUrl} onClick=${e => { if (!sourceUrl) e.preventDefault(); }}>Open in new tab ↗</a></div><//>
      ${links.map((l, i) => html`<div class="row" key=${i} style="align-items:flex-end">
        <${Field} label="Label"><input type="text" value=${l.label || ''} onInput=${e => setLink(i, { label: e.target.value })} placeholder="Company page, recruiter, referral…" /><//>
        <${Field} label="URL"><input type="url" value=${l.url || ''} onInput=${e => setLink(i, { url: e.target.value })} placeholder="https://…" /><//>
        <div class="field"><button class="btn ghost sm" title="Remove" onClick=${() => setLinks(ls => ls.filter((_, j) => j !== i))}>Remove</button></div>
      </div>`)}
      <div><button class="btn sm" onClick=${() => setLinks(ls => [...ls, { label: '', url: '' }])}>+ Add link</button></div>
      ${(job.links || []).filter(l => l.url).length ? html`<div class="stack" style="margin-top:4px"><h3>Saved</h3>${(job.links || []).filter(l => l.url).map(l => html`<div class="small" key=${l.url}><a href=${l.url} target="_blank" rel="noreferrer noopener">${l.label || 'Link'} ↗</a></div>`)}</div>` : null}
    </div>
  </div>
  <div><button class="btn primary" onClick=${save}>Save notes & links</button></div></div>`;
}

function Changes({ cv, runs }) {
  const [runId, setRunId] = useState(runs[0]?.id);
  const run = runs.find(r => r.id === runId) || runs[0];
  if (!run) return html`<${Note}>Nothing to compare yet — save a tailoring run first.<//>`;
  const cs = buildChangeSet(cv, run.result);
  const pct = r => Math.round(r * 100);
  return html`<div class="stack">
    ${runs.length > 1 ? html`<div><select value=${run.id} onChange=${e => setRunId(e.target.value)}>${runs.map(r => html`<option value=${r.id}>${fmtDateTime(r.createdAt)} · ${r.result.tailoringMode === 'enhance' ? 'Enhanced' : 'Tailored'} · ${r.provider} · fit ${r.fitScore?.score ?? r.result.fit.score}</option>`)}</select></div>` : null}
    <div class="steps">
      <div class="step"><b>${cs.rewrites.length}</b>bullets reworded</div>
      <div class="step"><b>${cs.dropped.length + cs.omittedRoles.length}</b>bullets/roles left out</div>
      <div class="step"><b>${cs.reordered.length}</b>roles reordered</div>
    </div>
    <${Note} kind="info">Green marks wording the AI added for this job. Struck-through grey is what it replaced. Every number and fact still comes from your master CV — anything invented would have been blocked before you got here.<//>
    ${cs.summary ? html`<div class="panel"><div class="head"><h2>Summary</h2><${Chip} kind=${cs.summary.kind === 'override' ? 'stretch' : ''}>${cs.summary.kind === 'override' ? 'custom summary' : 'variant: ' + cs.summary.id}<//></div><div class="body small">${cs.summary.text}</div></div>` : null}
    ${cs.rewrites.length ? html`<div class="panel"><div class="head"><h2>Reworded bullets</h2></div><div class="body stack">
      ${cs.rewrites.map(w => html`<div key=${w.bulletId} style="padding-bottom:12px;border-bottom:1px solid var(--line)">
        <div class="small muted" style="margin-bottom:4px"><span class="mono">${w.bulletId}</span> · ${w.role?.employer || ''} · ${pct(w.ratio)}% new wording</div>
        <div style="line-height:1.6">${w.diff.map((d, i) => d.type === 'added' ? html`<mark key=${i} style="background:#dcf5e4;color:inherit;border-radius:3px;padding:1px 3px;margin:0 2px">${d.text}</mark>` : d.type === 'removed' ? html`<span key=${i} class="muted" style="text-decoration:line-through;margin:0 2px">${d.text}</span>` : html`<span key=${i}>${d.text}</span>`)}</div>
        ${w.reason ? html`<div class="small muted" style="margin-top:4px">Why: ${w.reason}${w.keywords.length ? html` · injected: ${w.keywords.join(', ')}` : ''}</div>` : null}
      </div>`)}
    </div></div>` : html`<${Note}>No bullets were reworded — the AI used your original wording throughout.<//>`}
    ${cs.dropped.length || cs.omittedRoles.length ? html`<div class="panel"><div class="head"><h2>Left out of this version</h2></div><div class="body stack small">
      ${cs.omittedRoles.map(r => html`<div key=${r.id}><${Chip} kind="stretch">whole role<//> <b>${r.title}</b> · ${r.employer}</div>`)}
      ${cs.dropped.map(d => html`<div key=${d.bulletId} class="muted"><span class="mono">${d.bulletId}</span> · ${d.role?.employer || ''} — ${d.text}</div>`)}
    </div></div>` : null}
    ${cs.reordered.length ? html`<div class="panel"><div class="head"><h2>Reordered</h2></div><div class="body small">${cs.reordered.map(r => html`<div key=${r.role.id}>${r.role.employer}: ${r.order.join(' → ')}</div>`)}</div></div>` : null}
    ${cs.skillsOrder.length ? html`<div class="panel"><div class="head"><h2>Skills reordered</h2></div><div class="body small">${cs.skillsOrder.join(' → ')}</div></div>` : null}
  </div>`;
}

const RUN_STAGES = [
  { key: 'prompt', label: 'Building the prompt' },
  { key: 'sending', label: 'Waiting for the AI' },
  { key: 'checking', label: 'Checking for invented facts' },
  { key: 'repairing', label: 'Repairing the draft' },
  { key: 'saving', label: 'Saving and rendering' },
];

function RunProgress({ progress, elapsed, provider, onCancel }) {
  const idx = Math.max(0, RUN_STAGES.findIndex(s => s.key === progress.stage));
  const m = progress.meta || {};
  const pct = Math.round(((idx + (progress.stage === 'sending' ? 0.45 : 1)) / RUN_STAGES.length) * 100);
  return html`<div class="panel" role="status" aria-live="polite"><div class="body stack" style="gap:8px">
    <div style="display:flex;align-items:center;gap:10px">
      <span class="spinner" aria-hidden="true"></span>
      <b>${RUN_STAGES[idx].label}</b>
      <span class="muted small">${provider.name}${m.estTokens ? ` · ~${m.estTokens} tokens in` : ''}</span>
      <span class="muted small" style="margin-left:auto;font-variant-numeric:tabular-nums">${elapsed}s</span>
      <button class="btn ghost sm" onClick=${onCancel}>Cancel</button>
    </div>
    <div class="progress"><i style=${`width:${pct}%`}></i></div>
    <ol class="stages">${RUN_STAGES.map((s, i) => html`<li key=${s.key} class=${i < idx ? 'done' : i === idx ? 'active' : ''}>${s.label}</li>`)}</ol>
    ${progress.stage === 'sending' && elapsed > 25 ? html`<div class="small muted">Still going. Reasoning models take a while on a full CV — Haiku is the quickest of the Claude models if this is regularly too slow.</div>` : null}
    ${m.usage ? html`<div class="small muted">${m.usage.input_tokens ?? m.usage.prompt_tokens ?? '?'} in · ${m.usage.output_tokens ?? m.usage.completion_tokens ?? '?'} out</div>` : null}
  </div></div>`;
}

/** Shown on the Tailor tab once a run is saved: what the AI concluded, at a glance. */
function RunDone({ run, cv, onNewRun }) {
  const fit = run.result.fit;
  const calibrated = run.fitScore;
  const cs = buildChangeSet(cv, run.result);
  const rep = run.report;
  const state = !rep.passed ? (run.overridden ? 'overridden' : 'blocked') : rep.warnings.length && !run.accepted ? 'warn' : 'clean';
  const badge = { clean: ['good', '✓ Automated checks passed — verify accuracy'], warn: ['stretch', `⚠ ${rep.warnings.length} warning${rep.warnings.length === 1 ? '' : 's'} to confirm`], blocked: ['bad', `✗ ${rep.hardFailures.length} guardrail failure${rep.hardFailures.length === 1 ? '' : 's'}`], overridden: ['stretch', '⚠ Failures accepted by you'] }[state];
  return html`<div class="panel done-panel"><div class="body stack" style="gap:10px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <b style="font-size:15px">Tailoring complete</b>
      <${Chip} kind=${calibrated?.band ?? fit.verdict}>role fit ${calibrated?.score ?? fit.score} · ${calibrated?.band ?? fit.verdict}<//>
      ${calibrated ? html`<span class="muted small">model opinion ${calibrated.modelOpinion}</span>` : null}
      <${Chip} kind=${badge[0]}>${badge[1]}<//>
      <span class="muted small" style="margin-left:auto">${fmtDateTime(run.createdAt)} · ${run.provider}${run.usage ? ` · ${run.usage.output_tokens ?? run.usage.completion_tokens ?? '?'} out` : ''}${run.costUsd ? ` · $${run.costUsd.toFixed(4)}` : ''}</span>
    </div>
    <div class="done-stats">
      <div><b>${cs.rewrites.length}</b><span>bullets reworded</span></div>
      <div><b>${cs.dropped.length + cs.omittedRoles.length}</b><span>left out</span></div>
      <div><b>${fit.matched_requirements.length}</b><span>requirements matched</span></div>
      <div><b>${fit.missing_requirements.filter(m => m.severity === 'must').length}</b><span>must-haves missing</span></div>
      ${fit.red_flags.length ? html`<div><b style="color:var(--bad-ink)">${fit.red_flags.length}</b><span>red flags</span></div>` : null}
    </div>
    ${fit.red_flags.length ? html`<div class="small" style="color:var(--bad-ink)">${fit.red_flags[0]}${fit.red_flags.length > 1 ? ` (+${fit.red_flags.length - 1} more in Fit)` : ''}</div>` : null}
    <div class="muted small">Open <b>Changes</b> to see what was reworded and why, or <b>Preview</b> to export.${state === 'blocked' ? ' Export is blocked until you re-run or accept the failures in Preview.' : ''}</div>
    <div><button class="btn ghost sm" onClick=${onNewRun}>Run again / paste a new response</button></div>
  </div></div>`;
}
