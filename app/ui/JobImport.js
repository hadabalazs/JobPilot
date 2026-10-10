import { useState } from 'preact/hooks';
import { html, Field, Note, download, readFileText } from './components.js';
import { prepareJobImport, JOB_IMPORT_EXAMPLE } from '../intake/jobImport.js';
import { importJobs } from './store.js';

export function JobImport({ jobs, cv, refresh, onClose }) {
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const change = value => { setRaw(value); setPreview(null); setSelected([]); setResult(null); setError(''); };
  const inspect = () => {
    setError(''); setResult(null);
    try { const p = prepareJobImport(raw, jobs); setPreview(p); setSelected(p.rows.filter(r => r.ready).map(r => r.index)); }
    catch (e) { setPreview(null); setError(e.message); }
  };
  const chooseFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Choose a jobs package under 2 MB.');
      change(await readFileText(file));
    } catch (err) { setError(err.message); }
    e.target.value = '';
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      const outcome = await importJobs(preview.rows.filter(r => selected.includes(r.index)).map(r => r.input), cv);
      setResult(outcome); setPreview(null); setSelected([]); setRaw('');
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return html`<section class="panel" aria-label="Import jobs" style="margin-bottom:18px">
    <div class="head"><h2>Import jobs</h2><button class="btn ghost sm" disabled=${busy} onClick=${onClose}>Close import</button></div>
    <div class="body stack">
      <${Note}>Add researched jobs with their posting links, full descriptions and match notes. This only creates new jobs: your Master CV, existing jobs and settings are never replaced. No paid AI runs start on import.<//>
      ${result ? html`<${Note}><b>${result.added} jobs added to your inbox.</b> ${result.skipped ? `${result.skipped} already-saved jobs skipped.` : ''} Open any job to review it or select jobs to tailor.<//>` : null}
      <div class="actions">
        <label class="btn">Choose jobs JSON<input type="file" accept=".json,application/json" class="sr-only" disabled=${busy} onChange=${chooseFile} /></label>
        <button class="btn ghost" disabled=${busy} onClick=${() => download('jobpilot-jobs-template.json', JSON.stringify(JOB_IMPORT_EXAMPLE, null, 2))}>Download example</button>
      </div>
      <${Field} label="Jobs JSON" hint="Paste a jobs package here, or choose a file above. Accepts {jobs: […]}, an array, or the jobs section of a JobPilot backup. All non-job data is ignored.">
        <textarea value=${raw} disabled=${busy} onInput=${e => change(e.target.value)} placeholder=${JSON.stringify(JOB_IMPORT_EXAMPLE, null, 2)} style="min-height:180px;font-family:monospace"></textarea>
      <//>
      ${error ? html`<${Note} kind="bad">${error}<//>` : null}
      <div><button class="btn" disabled=${busy || !raw.trim()} onClick=${inspect}>Preview import</button></div>
      ${preview ? html`<div>
        <p>${preview.ready} new · ${preview.duplicates} duplicate · ${preview.invalid} invalid. Duplicate links and incomplete jobs are skipped.</p>
        <div style="overflow-x:auto"><table><thead><tr><th><input type="checkbox" aria-label="Select all new import jobs" checked=${!!preview.ready && selected.length === preview.ready} disabled=${busy || !preview.ready} onChange=${e => setSelected(e.target.checked ? preview.rows.filter(r => r.ready).map(r => r.index) : [])} /></th><th>Job</th><th>Posting age</th><th>Import status</th></tr></thead>
          <tbody>${preview.rows.map(r => html`<tr key=${r.index}>
            <td><input type="checkbox" aria-label=${'Import ' + (r.input.title || `row ${r.index + 1}`)} disabled=${busy || !r.ready} checked=${selected.includes(r.index)} onChange=${e => setSelected(s => e.target.checked ? [...s, r.index] : s.filter(i => i !== r.index))} /></td>
            <td><b>${r.input.title || 'Untitled'}</b><div class="muted small">${[r.input.company, r.input.location].filter(Boolean).join(' · ')}</div>
              ${r.input.sourceUrl ? html`<a href=${r.input.sourceUrl} target="_blank" rel="noopener noreferrer">Open posting ↗</a>` : null}
              <details><summary>Review description & notes</summary><div style="white-space:pre-wrap;max-height:280px;overflow:auto">${r.input.raw}</div>${r.input.notes ? html`<p style="white-space:pre-wrap">${r.input.notes}</p>` : null}</details>
            </td>
            <td>${r.input.postingAgeText || r.input.postedAt || 'Not supplied'}</td>
            <td>${r.errors.length ? r.errors.join('; ') : r.duplicate || 'Ready to add'}</td>
          </tr>`)}</tbody></table></div>
        <p class="muted small">Scores are recalculated locally from your own CV, not taken from the imported package. Posting ages are source-reported and may reflect reposts.</p>
        <button class="btn primary" disabled=${busy || !selected.length} onClick=${save}>${busy ? 'Adding jobs…' : `Add ${selected.length} jobs to inbox`}</button>
      </div>` : null}
    </div>
  </section>`;
}
