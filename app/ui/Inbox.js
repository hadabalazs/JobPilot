import { useState, useRef } from 'preact/hooks';
import { html, Chip, ScoreBar, Note, Field, toast, download } from './components.js';
import { addJob, activeProvider, runAutomatic, setStatus, artifactName, db, hasConfiguredProvider } from './store.js';
import { BulkRun } from './BulkRun.js';
import { JobImport } from './JobImport.js';
import { buildRenderModel } from '../render/cvModel.js';
import { buildPdfBlob } from '../render/pdfDoc.js';
import { STATUS_LABELS, STATUSES, BOARD_COLUMNS } from '../schemas/job.js';
import { canonicalJobUrl, duplicateJobIds } from '../intake/jobUrl.js';
import { applyRangeSelection } from './selection.js';
import { displayedFit, displayedBand } from '../matching/fitScore.js';

export function Inbox({ jobs, cv, settings, refresh, navigate, initialPayload }) {
  const [adding, setAdding] = useState(!!initialPayload || jobs.length === 0);
  const [importing, setImporting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState(null);
  const [autoRun, setAutoRun] = useState(null);
  const [q, setQ] = useState('');
  const [excludedStatuses, setExcludedStatuses] = useState(() => new Set());
  const [tailoredFilter, setTailoredFilter] = useState('all');   // all | tailored | untailored
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState('added');                      // newest jobs first by default
  const [dir, setDir] = useState('desc');
  const [moving, setMoving] = useState(false);
  const selectionAnchor = useRef(null);
  const duplicateIds = duplicateJobIds(jobs);
  const duplicateCount = duplicateIds.size;

  const needle = q.trim().toLowerCase();
  const filtered = jobs.filter(j => {
    if (!showArchived && j.archived) return false;
    if (excludedStatuses.has(j.status)) return false;
    if (tailoredFilter === 'tailored' && j.fitScore == null && j.aiScore == null) return false;
    if (tailoredFilter === 'untailored' && (j.fitScore != null || j.aiScore != null)) return false;
    if (minScore && (displayedFit(j) ?? 0) < minScore) return false;
    if (needle && ![j.title, j.company, j.location, j.notes].some(v => (v || '').toLowerCase().includes(needle))) return false;
    return true;
  });
  const cmp = { fit: j => displayedFit(j) ?? -1, local: j => j.localScore ?? -1, ai: j => j.modelScore ?? -1, added: j => j.createdAt, title: j => (j.title || '').toLowerCase(), company: j => (j.company || '').toLowerCase(), status: j => STATUSES.indexOf(j.status) }[sort];
  const visible = [...filtered].sort((a, b) => { const x = cmp(a), y = cmp(b); const r = x < y ? -1 : x > y ? 1 : 0; return dir === 'asc' ? r : -r; });
  const selectedJobs = visible.filter(j => selected.includes(j.id));
  const toggle = (id, checked, shiftKey = false) => setSelected(s => {
    const next = applyRangeSelection(visible.map(j => j.id), s, selectionAnchor.current, id, checked, shiftKey);
    selectionAnchor.current = next.anchorId;
    return next.selected;
  });
  const allChecked = visible.length > 0 && visible.every(j => selected.includes(j.id));
  const sortBy = key => { if (sort === key) setDir(d => (d === 'asc' ? 'desc' : 'asc')); else { setSort(key); setDir(key === 'title' || key === 'company' ? 'asc' : 'desc'); } };
  const arrow = key => (sort === key ? html`<span aria-hidden="true"> ${dir === 'asc' ? '▲' : '▼'}</span>` : null);
  const th = (key, label, style) => html`<th style=${style}><button class="th-sort" aria-sort=${sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} onClick=${() => sortBy(key)}>${label}${arrow(key)}</button></th>`;
  const bulkMove = async to => {
    if (!to) return;
    setMoving(true);
    let ok = 0, skipped = 0;
    for (const j of selectedJobs) {
      if (j.status === to) { skipped++; continue; }
      try { await setStatus(j, to, settings, { force: true }); ok++; } catch { skipped++; }
    }
    setMoving(false); setSelected([]); selectionAnchor.current = null;
    toast(`${ok} moved to ${STATUS_LABELS[to]}${skipped ? `, ${skipped} unchanged` : ''}`);
    await refresh();
  };
  const filtersOn = needle || excludedStatuses.size > 0 || tailoredFilter !== 'all' || minScore > 0;
  const toggleStatus = st => setExcludedStatuses(s => { const n = new Set(s); n.has(st) ? n.delete(st) : n.add(st); return n; });
  const statusList = STATUSES.filter(st => st !== 'archived');
  const providerReady = hasConfiguredProvider(settings);
  const [downloadingId, setDownloadingId] = useState(null);
  const downloadPdf = async (j, e) => {
    e.stopPropagation();
    if (!j.bestRunId || !cv) return;
    setDownloadingId(j.id);
    try {
      const run = await db.get('tailorRuns', j.bestRunId);
      if (!run) throw new Error('That tailored version is no longer available — open the job and re-run.');
      if (run.result?.tailoringMode === 'enhance' && (!run.accepted || (!run.report.passed && !run.overridden))) throw new Error('Review and approve this enhanced draft in Preview before downloading.');
      const model = buildRenderModel(cv, run.result, { includeCover: run.includeCover, jobMeta: { company: j.company, title: j.title } });
      download(artifactName(cv, j, settings, 'pdf'), await buildPdfBlob(model), 'application/pdf');
    } catch (err) { toast(err.message, 'bad'); } finally { setDownloadingId(null); }
  };
  return html`
    <div class="topbar"><div><h1>Inbox</h1><div class="muted small">${visible.length}${filtersOn ? ` of ${jobs.filter(j => showArchived || !j.archived).length}` : ''} job${visible.length === 1 ? '' : 's'}</div></div>
      <div class="actions">
        <label class="btn ghost sm"><input type="checkbox" checked=${showArchived} onChange=${e => setShowArchived(e.target.checked)} /> Show archived</label>
        <button class="btn" onClick=${() => { setImporting(v => !v); setAdding(false); }}>Import jobs</button>
        <button class="btn ${selectedJobs.length ? '' : 'primary'}" onClick=${() => setAdding(a => !a)}>${adding ? 'Close' : '+ Add job'}</button>
      </div></div>

    <div class="filters">
      <input type="search" class="filter-q" value=${q} onInput=${e => setQ(e.target.value)} placeholder="Search title, company, location, notes…" aria-label="Search jobs" />
      <details class="status-filter">
        <summary class="btn ghost sm">Statuses${excludedStatuses.size ? html` <span class="chip stretch" style="margin-left:4px">hiding ${excludedStatuses.size}</span>` : ''}</summary>
        <div class="status-filter-panel">
          <div class="status-filter-actions">
            <button type="button" class="btn ghost sm" onClick=${() => setExcludedStatuses(new Set())}>Show all</button>
            <button type="button" class="btn ghost sm" onClick=${() => setExcludedStatuses(new Set(statusList))}>Hide all</button>
          </div>
          ${statusList.map(st => html`<label key=${st}><input type="checkbox" checked=${!excludedStatuses.has(st)} onChange=${() => toggleStatus(st)} /> ${STATUS_LABELS[st]}</label>`)}
        </div>
      </details>
      <select value=${tailoredFilter} onChange=${e => setTailoredFilter(e.target.value)} aria-label="Filter by tailoring">
        <option value="all">Tailored or not</option>
        <option value="untailored">Not tailored yet</option>
        <option value="tailored">Tailored</option>
      </select>
      <label class="filter-min">Fit ≥ <input type="number" min="0" max="100" step="5" value=${minScore} onInput=${e => setMinScore(+e.target.value)} /></label>
      ${filtersOn ? html`<button class="btn ghost sm" onClick=${() => { setQ(''); setExcludedStatuses(new Set()); setTailoredFilter('all'); setMinScore(0); }}>Clear filters</button>` : null}
    </div>

    ${selectedJobs.length ? html`<div class="bulkbar">
      <b>${selectedJobs.length} selected</b>
      ${providerReady
        ? html`<button class="btn primary sm" disabled=${!!bulk || !cv} onClick=${() => setBulk([...selectedJobs])}>Tailor ${selectedJobs.length}</button>`
        : html`<span class="bulk-locked" title="Connect a configured AI provider in Settings — model id and API key — to bulk-tailor. The free manual flow only handles one job at a time.">
                 <button class="btn sm" disabled>Tailor ${selectedJobs.length}</button>
               </span>
               <a class="btn ghost sm" href="#/settings">Connect a provider →</a>`}
      <button class="btn ghost sm" disabled=${moving} title="Archive the selected jobs" onClick=${() => bulkMove('archived')}>Archive</button>
      <label>Move to
        <select disabled=${moving} value="" onChange=${e => { const v = e.target.value; e.target.value = ''; bulkMove(v); }}>
          <option value="">choose…</option>
          ${[...BOARD_COLUMNS, 'archived'].map(st => html`<option value=${st}>${STATUS_LABELS[st]}</option>`)}
        </select>
      </label>
      ${moving ? html`<span class="spinner"></span>` : null}
      <button class="btn ghost sm" onClick=${() => { setSelected([]); selectionAnchor.current = null; }}>Clear selection</button>
    </div>` : null}
    ${bulk ? html`<${BulkRun} jobs=${bulk} cv=${cv} settings=${settings} navigate=${navigate}
        onDone=${async () => { await refresh(); }} onClose=${() => { setBulk(null); setSelected([]); }} />` : null}
    ${!cv ? html`<div class="note warn" style="margin-bottom:14px">Import your master CV first (Master CV tab) — jobs can be added now but won't be scored until then.</div>` : null}
    ${autoRun ? html`<div class="note info" style="margin-bottom:14px;display:flex;align-items:center;gap:10px"><span class="spinner"></span> Tailoring <b>${autoRun}</b> automatically…</div>` : null}
    ${duplicateCount ? html`<${Note} kind="warn"><b>Duplicate posting links detected:</b> ${duplicateCount} saved job${duplicateCount === 1 ? '' : 's'} share a link with another entry. They are flagged below so you do not apply twice.<//>` : null}
    ${adding ? html`<${AddJob} jobs=${jobs} cv=${cv} settings=${settings} initial=${initialPayload} navigate=${navigate} onAuto=${async t => { setAutoRun(t); if (!t) await refresh(); }} onDone=${async () => { setAdding(false); await refresh(); }} />` : null}
    ${importing ? html`<${JobImport} jobs=${jobs} cv=${cv} refresh=${refresh} onClose=${() => setImporting(false)} />` : null}
    ${visible.length === 0 && filtersOn ? html`<div class="empty"><h2>Nothing matches those filters</h2><p>${jobs.filter(j => !j.archived).length} jobs are hidden by the current search or filters.</p><button class="btn" onClick=${() => { setQ(''); setExcludedStatuses(new Set()); setTailoredFilter('all'); setMinScore(0); }}>Clear filters</button></div>` :
      visible.length === 0 ? html`<div class="empty"><h2>No jobs yet</h2><p>Paste a job description. JobPilot cleans it, scores it against your master CV, and gets it ready for tailoring.</p><button class="btn primary" onClick=${() => setAdding(true)}>Add your first job</button></div>` : html`
      <table><thead><tr>
        <th style="width:28px"><input type="checkbox" aria-label="Select all" checked=${allChecked} onChange=${e => { setSelected(e.target.checked ? visible.map(j => j.id) : []); selectionAnchor.current = null; }} /></th>
        ${th('title', 'Role')}${th('fit', 'Role fit')}<th style="width:60px">Links</th>${th('status', 'Status')}${th('added', 'Added')}
      </tr></thead><tbody>
        ${visible.map(j => html`<tr key=${j.id} class="row-link" onClick=${() => navigate('#/job/' + j.id)} tabindex="0" onKeyDown=${e => e.key === 'Enter' && navigate('#/job/' + j.id)}>
          <td onClick=${e => e.stopPropagation()} style="white-space:nowrap"><input type="checkbox" aria-label=${'Select ' + j.title} checked=${selected.includes(j.id)} title="Shift-click to select a range" onClick=${e => toggle(j.id, e.currentTarget.checked, e.shiftKey)} /></td>
          <td><div class="title">${j.title}${duplicateIds.has(j.id) ? html` <${Chip} kind="stretch">Duplicate link<//>` : null}</div><div class="sub">${[j.company, j.location].filter(Boolean).join(' · ') || '—'}</div></td>
          <td><${FitCell} job=${j} /></td>
          <td onClick=${e => e.stopPropagation()} style="white-space:nowrap">
            <a class="icon-btn" href=${j.sourceUrl || undefined} target="_blank" rel="noreferrer noopener" aria-disabled=${!j.sourceUrl} title=${j.sourceUrl ? 'Open the job posting' : 'No posting link saved'} onClick=${e => { if (!j.sourceUrl) e.preventDefault(); }}>↗</a>
            <button class="icon-btn" disabled=${!j.bestRunId || downloadingId === j.id} title=${j.bestRunId ? 'Download the tailored CV as PDF' : j.status !== 'inbox' && j.status !== 'scored' ? 'Status says ' + STATUS_LABELS[j.status] + ', but no tailoring run has been saved — open the job and run Tailor' : 'No tailored version yet'} onClick=${e => downloadPdf(j, e)}>${downloadingId === j.id ? html`<span class="spinner sm"></span>` : '⇩'}</button>
          </td>
          <td><${Chip}>${STATUS_LABELS[j.status]}<//></td>
          <td class="muted small">${new Date(j.createdAt).toLocaleDateString()}</td>
        </tr>`)}
      </tbody></table>`}`;
}

function AddJob({ jobs, cv, settings, initial, navigate, onAuto, onDone }) {
  const [raw, setRaw] = useState(initial?.text || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [url, setUrl] = useState(initial?.url || '');
  const [busy, setBusy] = useState(false);
  const urlKey = canonicalJobUrl(url);
  const duplicates = urlKey ? jobs.filter(j => canonicalJobUrl(j.sourceUrl) === urlKey) : [];
  const submit = async () => {
    if (raw.trim().length < 80) { toast('Paste the full job description (at least a few lines).', 'bad'); return; }
    setBusy(true);
    try {
      const job = await addJob({ raw, title, company, location, source: initial ? 'bookmarklet' : 'paste', sourceUrl: url.trim() }, cv);
      toast(duplicates.length ? `Job added — duplicate link matches ${duplicates.length} saved job${duplicates.length === 1 ? '' : 's'}` : 'Job added', duplicates.length ? 'warn' : '');
      onDone();
      await maybeAutoTailor(job, cv, settings, onAuto);
    }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return html`<div class="panel add-job-panel" style="margin-bottom:18px"><div class="head">
    <h2>Add a job</h2>
    <div style="display:flex;align-items:center;gap:12px">
      <span class="muted small">Paste text — no crawling, no scraping</span>
      <button class="btn primary" disabled=${busy} onClick=${submit}>${busy ? 'Adding…' : 'Add & score'}</button>
    </div>
  </div><div class="body">
    <${Field} label="Job description" hint="Everything from the posting: title, responsibilities, requirements. Boilerplate is stripped automatically."><textarea value=${raw} onInput=${e => setRaw(e.target.value)} placeholder="Paste the job posting here…" style="min-height:180px"></textarea><//>
    <div class="row">
      <${Field} label="Title" hint="Auto-detected if left blank"><input type="text" value=${title} onInput=${e => setTitle(e.target.value)} /><//>
      <${Field} label="Company"><input type="text" value=${company} onInput=${e => setCompany(e.target.value)} /><//>
      <${Field} label="Location"><input type="text" value=${location} onInput=${e => setLocation(e.target.value)} /><//>
    </div>
    <${Field} label="Job posting link" hint=${initial?.url ? 'Captured by the bookmarklet — edit if needed.' : 'Optional. Paste the URL so you can reopen the posting later.'}><input type="url" value=${url} onInput=${e => setUrl(e.target.value)} placeholder="https://…" /><//>
    ${duplicates.length ? html`<${Note} kind="warn"><b>This posting link is already saved.</b> ${duplicates.map((j, i) => html`<span>${i ? ', ' : ''}<button type="button" class="link-button" onClick=${() => navigate('#/job/' + j.id)}>${j.title}${j.company ? ` at ${j.company}` : ''}</button></span>`)}. You may still add it if you intentionally want another entry.<//>` : null}
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn primary" disabled=${busy} onClick=${submit}>${busy ? 'Adding…' : 'Add & score'}</button></div>
  </div></div>`;
}


/** Runs the new job straight through the API provider when auto-tailor is on. */
async function maybeAutoTailor(job, cv, settings, onAuto) {
  if (!settings?.autoTailor || !cv) return;
  const provider = activeProvider(settings);
  if (provider.kind === 'manual') return;
  const min = settings.autoTailorMinScore ?? 0;
  if ((job.localScore ?? 0) < min) { toast(`Local fit ${job.localScore} is below ${min} — not tailored automatically`); return; }
  onAuto(job.title);
  try {
    const out = await runAutomatic({ job, cv, settings });
    toast(`Tailored automatically — role fit ${out.run.fitScore.score}${out.run.report.passed ? '' : ', draft review needed'}`, out.run.report.passed ? '' : 'bad');
  } catch (e) { toast(`Auto-tailor failed: ${e.message}`, 'bad'); }
  finally { onAuto(null); }
}


/** The calibrated score replaces the generous model opinion after tailoring. */
function FitCell({ job }) {
  if (job.localScore == null) return html`<span class="muted">—</span>`;
  const score = displayedFit(job), band = displayedBand(job), tailored = job.fitScore != null || job.aiScore != null;
  return html`<div style="display:flex;align-items:center;gap:6px">
    <span class="score">${score}</span>
    <${ScoreBar} value=${score} />
    <${Chip} kind=${band}>${band}<//>
    ${tailored ? html`<span class="muted small" title=${`Local pre-filter ${job.localScore}; model opinion ${job.modelScore ?? 'not saved'}`}>(local ${job.localScore})</span>` : html`<span class="muted small">pre-tailor</span>`}
  </div>`;
}
