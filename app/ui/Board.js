import { useState } from 'preact/hooks';
import { html, Chip, toast, fmtDate } from './components.js';
import { BOARD_COLUMNS, STATUS_LABELS, canTransition } from '../schemas/job.js';
import { digest } from '../tracker/pipeline.js';
import { setStatus } from './store.js';
import { duplicateJobIds } from '../intake/jobUrl.js';
import { displayedFit } from '../matching/fitScore.js';

export function Board({ jobs, events, settings, refresh, navigate }) {
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const [busy, setBusy] = useState(false);
  const d = digest(jobs, events);
  const active = jobs.filter(j => !j.archived);
  const duplicateIds = duplicateJobIds(jobs);

  const move = async (job, to) => {
    if (!job || job.status === to) return;
    setBusy(true);
    try {
      await setStatus(job, to, settings, { force: true });
      const skipped = !canTransition(job.status, to);
      toast(`${job.title} → ${STATUS_LABELS[to]}${skipped ? ' (skipped stages)' : ''}`);
      await refresh();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); setDragId(null); setOver(null); }
  };

  return html`
    <div class="topbar"><div><h1>Pipeline</h1><div class="muted small">${active.length} active · ${d.followUpsDue.length} follow-up${d.followUpsDue.length === 1 ? '' : 's'} due · drag a card to any column</div></div></div>
    ${d.followUpsDue.length ? html`<div class="note warn" style="margin-bottom:14px"><b>Follow-ups due:</b> ${d.followUpsDue.map(e => { const j = jobs.find(x => x.id === e.jobId); return j ? html`<a href=${'#/job/' + j.id} style="margin-right:10px">${j.title} @ ${j.company || '—'} (${fmtDate(e.at)})</a>` : null; })}</div>` : null}
    <div class="board" aria-busy=${busy}>${BOARD_COLUMNS.map(col => {
      const list = active.filter(j => j.status === col);
      const dragged = jobs.find(j => j.id === dragId);
      const wouldSkip = dragged && dragged.status !== col && !canTransition(dragged.status, col);
      return html`<div key=${col}
        class=${'col' + (over === col ? ' over' : '') + (dragId && wouldSkip ? ' skip' : '')}
        onDragOver=${e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== col) setOver(col); }}
        onDragLeave=${() => setOver(o => (o === col ? null : o))}
        onDrop=${e => { e.preventDefault(); move(jobs.find(j => j.id === (e.dataTransfer.getData('text/plain') || dragId)), col); }}>
        <h3>${STATUS_LABELS[col]}<span>${list.length}</span></h3>
        ${list.map(j => html`<div class=${'card' + (dragId === j.id ? ' dragging' : '')} key=${j.id} draggable="true"
            onDragStart=${e => { e.dataTransfer.setData('text/plain', j.id); e.dataTransfer.effectAllowed = 'move'; setDragId(j.id); }}
            onDragEnd=${() => { setDragId(null); setOver(null); }}
            onClick=${() => navigate('#/job/' + j.id)}>
          <div class="t">${j.title}${duplicateIds.has(j.id) ? html` <${Chip} kind="stretch">Duplicate link<//>` : null}</div>
          <div class="c">${j.company || '—'}${displayedFit(j) != null ? html` · fit <b>${displayedFit(j)}</b>` : ''}</div>
          <label class="move-select" onClick=${e => e.stopPropagation()}>
            <span class="sr-only">Move ${j.title}</span>
            <select value=${j.status} onChange=${e => move(j, e.target.value)}>
              ${[...BOARD_COLUMNS, 'archived'].map(s => html`<option value=${s}>${STATUS_LABELS[s]}</option>`)}
            </select>
          </label>
        </div>`)}
        ${list.length === 0 ? html`<div class="col-empty">${over === col ? 'Drop here' : ''}</div>` : null}
      </div>`;
    })}</div>
    <p class="muted small" style="margin-top:12px">Cards can go to any column — the usual order is only a suggestion. On touch screens use the small selector on each card.</p>`;
}
