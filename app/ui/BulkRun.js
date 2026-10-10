/** Bulk tailoring: sequential API runs, or one combined prompt for the free manual flow. */
import { useState, useRef, useEffect } from 'preact/hooks';
import { html, Note, Field, Chip, toast, copyText, download } from './components.js';
import { activeProvider, buildBatchRequest, ingestBatch, runBulk } from './store.js';
import { RunModelPicker } from './RunModelPicker.js';
import { needsReview, pendingRow, completedRow, queueSummary } from './bulkState.js';

export function BulkRun({ jobs, cv, settings, onDone, onClose, navigate }) {
  const [providerId, setProviderId] = useState(settings.activeProviderId);
  const [modelId, setModelId] = useState('');
  const provider = activeProvider(settings, providerId, modelId);
  const manual = provider.kind === 'manual';
  const [includeCover, setIncludeCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(jobs.map(j => ({ id: j.id, title: j.title, company: j.company, state: 'queued' })));
  const [pasted, setPasted] = useState('');
  const [report, setReport] = useState(null);
  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const batch = manual ? buildBatchRequest(jobs, cv, settings, { includeCover }) : null;

  const runApi = async targets => {
    if (abortRef.current || !targets.length) return;
    const ids = new Set(targets.map(r => r.id));
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setBusy(true); setRows(rs => rs.map(r => ids.has(r.id) ? { ...r, state: 'queued', error: null, retried: false } : r));
    try {
      await runBulk({ jobs: jobs.filter(j => ids.has(j.id)), cv, settings, providerId, modelId, includeCover, signal: ctrl.signal,
        onProgress: ({ job, state, run, error, retried, meta }) => setRows(rs => rs.map(r => r.id === job.id ? { ...r, state, error, retried, meta, ...(run ? completedRow(run) : {}) } : r)) });
    } catch (e) {
      toast(e.message, 'bad');
      setRows(rs => rs.map(r => ids.has(r.id) && ['queued', 'running', 'repairing'].includes(r.state) ? { ...r, state: 'error', error: e.message } : r));
    } finally { setBusy(false); abortRef.current = null; await onDone(); }
  };
  const ingest = async () => {
    setBusy(true);
    let out;
    try { out = await ingestBatch({ jobs, cv, settings, rawText: pasted, includeCover }); }
    catch (e) { toast(e.message, 'bad'); return; }
    finally { setBusy(false); }
    setBusy(false);
    if (!out.ok && out.error) { toast(out.error, 'bad'); return; }
    setReport(out);
    setRows(rs => rs.map(r => { const hit = (out.saved || []).find(s => s.job.id === r.id); return hit ? { ...r, ...completedRow(hit.run) } : { ...r, state: 'error', error: 'no result returned' }; }));
    toast(`${out.saved.length} of ${jobs.length} tailored`);
    await onDone();
  };

  const done = rows.filter(r => r.state === 'done').length;
  const summary = queueSummary(rows);
  return html`<div class="panel" style="margin-bottom:18px"><div class="head">
      <h2>Tailor ${jobs.length} job${jobs.length === 1 ? '' : 's'}</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <${RunModelPicker} settings=${settings} providerId=${providerId} modelId=${modelId} busy=${busy} onProviderChange=${setProviderId} onModelChange=${setModelId} />
        <label class="btn ghost sm"><input type="checkbox" checked=${includeCover} disabled=${busy} onChange=${e => setIncludeCover(e.target.checked)} /> Generate cover letters</label>
        <button class="btn ghost sm" disabled=${busy} onClick=${onClose}>Close</button>
      </div></div>
    <div class="body stack">
      ${manual ? html`
        <${Note}>One prompt covering all ${jobs.length} jobs — paste it into your AI chat and paste the JSON array back. Long batches get truncated, so 3–4 jobs at a time is the sweet spot on a free tier.<//>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn primary" onClick=${async () => (await copyText(batch.promptText)) ? toast('Batch prompt copied') : toast('Copy failed', 'bad')}>Copy batch prompt</button>
          <button class="btn" onClick=${() => download('batch_prompt.md', batch.promptText, 'text/markdown')}>Download prompt</button>
          <span class="muted small">~${batch.sliceInfo.estTokens} tokens of CV + ${jobs.length} job descriptions</span>
        </div>
        <${Field} label="AI response (a JSON array)"><textarea class="mono" value=${pasted} onInput=${e => setPasted(e.target.value)} placeholder='[{"schema_version":"tailor_result_v1", …}, …]' style="min-height:160px"></textarea><//>
        <div><button class="btn primary" disabled=${busy || !pasted.trim()} onClick=${ingest}>${busy ? 'Saving…' : `Save ${jobs.length} runs`}</button></div>
      ` : html`
        <${Note}>Runs one after another through ${provider.name}, stopping if your monthly cap is reached. You can cancel mid-way; finished jobs are kept. A <b>Review needed</b> result is still a saved tailored CV—the app found wording it could not verify from your Master CV, so download stays blocked until you review it.<//>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn primary" disabled=${busy || !summary.pending} onClick=${() => runApi(rows.filter(pendingRow))}>${busy ? `Processing… ${summary.processed}/${jobs.length}` : !summary.pending ? 'All jobs processed' : `${summary.processed ? 'Resume' : 'Run'} ${summary.pending} pending`}</button>
          ${summary.failed ? html`<button class="btn" disabled=${busy} onClick=${() => runApi(rows.filter(r => r.state === 'error'))}>Retry ${summary.failed} failed only</button>` : null}
          ${busy ? html`<button class="btn ghost sm" onClick=${() => abortRef.current?.abort()}>Cancel</button>` : null}
          ${busy ? html`<div class="progress" style="flex:1;min-width:120px"><i style=${`width:${Math.round((summary.processed / jobs.length) * 100)}%`}></i></div>` : null}
        </div>
        <div role="status" aria-live="polite">${summary.ready} ready · ${summary.review} need review · ${summary.failed} failed · ${summary.pending} pending</div>
        <div class="muted small">Retries use the selected provider/model and may incur additional cost. Completed CVs are saved; retries never change your Master CV. Keep this page open while processing.</div>
      `}
      <table><thead><tr><th>Role</th><th>Status</th><th>Role fit</th></tr></thead><tbody>
        ${rows.map(r => html`<tr key=${r.id}>
          <td><a class="title" href=${'#/job/' + r.id} target="_blank" rel="noopener">${r.title} ↗</a><div class="sub">${r.company || '—'}</div></td>
          <td>${r.state === 'running' ? html`<span class="spinner" style="display:inline-block;vertical-align:-2px"></span> running…`
              : r.state === 'repairing' ? html`<span class="spinner" style="display:inline-block;vertical-align:-2px"></span> ${r.meta?.reason || 'Repairing response'}…`
              : r.state === 'done' ? html`<${Chip} kind=${needsReview(r) ? 'stretch' : 'good'}>${needsReview(r) ? 'Tailored — review needed' : (r.repair?.attempted ? 'Tailored — auto-repaired' : 'Tailored — ready')}<//>${r.cost ? html`<span class="muted small"> $${r.cost.toFixed(4)}</span>` : ''}${needsReview(r) ? html`<details><summary>View ${r.hardFailures.length + r.warnings.length} review issues</summary><ul>${[...r.hardFailures, ...r.warnings].map(x => html`<li>${x}</li>`)}</ul><a href=${'#/job/' + r.id} target="_blank" rel="noopener">Review saved CV ↗</a></details>` : ''}${r.repair?.error ? html`<div class="muted small">Repair could not finish: ${r.repair.error}. The original draft was kept.</div>` : ''}`
              : r.state === 'error' ? html`<${Chip} kind="bad">${r.retried ? 'failed after smart retry' : 'failed'}<//> <span class="muted small">${r.error}</span>`
              : ['cancelled', 'skipped'].includes(r.state) ? html`<span class="muted small">Paused · ${r.error || 'Ready to resume'}</span>`
              : html`<span class="muted small">queued</span>`}
            ${!manual && (r.state === 'error' || needsReview(r)) ? html`<button class="btn ghost sm" disabled=${busy} onClick=${() => runApi([r])}>${r.state === 'error' ? 'Retry this job' : 'Try a new draft'}</button>` : null}</td>
          <td>${r.score != null ? html`<span class="score">${r.score}</span> <${Chip} kind=${r.verdict}>${r.verdict}<//>` : html`<span class="muted">—</span>`}</td>
        </tr>`)}
      </tbody></table>
      ${report?.problems?.length ? html`<${Note} kind="warn"><b>Not saved:</b><ul>${report.problems.map(p => html`<li>${p}</li>`)}</ul>${report.truncated ? html`<div>The reply looked truncated — ask your AI chat to continue and paste the rest.</div>` : null}<//>` : null}
      ${rows.some(needsReview) ? html`<${Note} kind="warn"><b>These jobs were tailored successfully, but some drafts need review.</b> Open a flagged job and use <b>Changes</b> to inspect the wording, then <b>Preview</b> to remove/correct unsupported claims or confirm them if they are genuinely true. A retry cannot prove an unsupported claim. The Master CV is not changed.<//>` : null}
      ${done ? html`<div class="muted small">Open each job's <b>Changes</b> tab to see what was reworded, then <b>Preview</b> to export.</div>` : null}
    </div></div>`;
}
