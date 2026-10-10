import { useState } from 'preact/hooks';
import { html, Field, Note, toast } from './components.js';
import { cleanJD, jobTextWarnings } from '../intake/clean.js';
import { localScore } from '../matching/localScore.js';
import { loadJob, saveJob } from './store.js';

export function JobBrief({ job, cv, onSave }) {
  const [draft, setDraft] = useState({ title: job.title, company: job.company || '', location: job.location || '', jdClean: job.jdClean || '', applicationContext: job.applicationContext || '' });
  const [busy, setBusy] = useState(false);
  const change = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const save = async () => {
    setBusy(true);
    try {
      const latest = await loadJob(job.id);
      const next = { ...latest, ...draft, title: draft.title.trim(), jdClean: cleanJD(draft.jdClean), applicationChecks: {}, atsExcludedTerms: [] };
      if (cv) { const score = localScore(next, cv); next.localScore = score.score; next.localBreakdown = score; }
      await saveJob(next); await onSave(); setDraft(d => ({ ...d, jdClean: next.jdClean })); toast('Job brief saved. Future prompts use this version.');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return html`<div class="stack"><${Note}>A clean job brief improves every analysis. Keep only this role’s responsibilities, qualifications and employer context—not navigation or suggested jobs. Original captured text is retained below. Editing does not rewrite saved CV runs.<//>
    <div class="grid-3">${[['title', 'Job title'], ['company', 'Company'], ['location', 'Location']].map(([key, label]) => html`<${Field} label=${label}><input value=${draft[key]} onInput=${e => change(key, e.target.value)} /><//>`)}</div>
    ${jobTextWarnings(draft.jdClean).map(w => html`<${Note} kind="warn">${w}<//>`)}
    <${Field} label="Job description used for matching and tailoring"><textarea value=${draft.jdClean} style="min-height:320px" onInput=${e => change('jdClean', e.target.value)}></textarea><//>
    <div><button class="btn" onClick=${() => change('jdClean', cleanJD(draft.jdClean))}>Remove common webpage clutter</button></div>
    <${Field} label="Recruiter priorities / application context (optional)" hint="For example: the hiring manager emphasised vendor coordination and a mobile launch. This steers emphasis, but is never treated as evidence of your experience. Sent to your AI provider or included in copied prompts."><textarea value=${draft.applicationContext} onInput=${e => change('applicationContext', e.target.value)} style="min-height:100px"></textarea><//>
    <div><button class="btn primary" disabled=${busy || !draft.title.trim() || !draft.jdClean.trim()} onClick=${save}>${busy ? 'Saving…' : 'Save job brief & refresh analysis'}</button></div>
    <details><summary>Original captured job text (unchanged)</summary><pre class="pre">${job.jdRaw || '(not available)'}</pre></details>
  </div>`;
}
