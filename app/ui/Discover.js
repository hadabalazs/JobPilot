import { useState, useRef } from 'preact/hooks';
import { html, toast } from './components.js';
import { isUntailored } from '../cloud/reviewStatus.js';
import { swipeDirection, matchingJob } from '../cloud/review.js';
import { importJobs, loadJobs } from './store.js';

const date = value => value ? new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : 'Date unknown';
const safeUrl = value => { try { const url=new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };

export function Discover({queue,view='discover',jobs=[],cv,refresh,navigate}) {
  const {feed,loading,saving,error,message,undo,reload,decide} = queue;
  const [opening,setOpening] = useState(null);
  const unseen = feed.jobs.filter(j=>j.decision==='unseen' && isUntailored(matchingJob(j.job,jobs))).slice().reverse();
  const saved = feed.jobs.filter(j=>j.decision==='keep').sort((a,b)=>(b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const passed = feed.jobs.filter(j=>j.decision==='pass').slice().reverse();
  const disabled = saving || loading || !!opening;
  const review = async row => {
    setOpening(row.id);
    try {
      const run = async () => {
        let existing = matchingJob(row.job,await loadJobs());
        if (!existing) { await importJobs([row.job],cv); existing=matchingJob(row.job,await loadJobs()); }
        if (!existing) throw new Error('Could not open this job. Please try again.');
        await refresh(); navigate('#/job/'+existing.id);
      };
      if (navigator.locks) await navigator.locks.request('jobpilot-daily-import',run); else await run();
    } catch(e) { toast(e.message); } finally { setOpening(null); }
  };
  return html`<div class=${view==='discover' ? 'discover discover-swipe' : 'discover'}>
    <header class="topbar"><div><h1>${view==='saved' ? 'Selected jobs' : view==='passed' ? 'Archived jobs' : 'Discover jobs'}</h1></div>
      <div class="actions"><button class="btn ghost" onClick=${()=>navigate('#/search')}>Search</button><button class="btn ghost" disabled=${disabled} onClick=${reload}>${loading ? 'Checking…' : 'Refresh'}</button></div></header>
    <div class="review-tabs" aria-label="Job match views">
      <button class=${view==='discover' ? 'active' : ''} onClick=${()=>navigate('#/discover')}>Discover <span>${unseen.length}</span></button>
      <button class=${view==='saved' ? 'active' : ''} onClick=${()=>navigate('#/saved')}>Selected <span>${saved.length}</span></button>
      <button class=${view==='passed' ? 'active' : ''} onClick=${()=>navigate('#/passed')}>Archived <span>${passed.length}</span></button>
    </div>
    <div class="review-status" aria-live="polite">${saving ? 'Saving your choice…' : error ? html`<span class="error-text" role="alert">${error}</span>` : message || (feed.checkedAt ? 'Synced' : 'Connecting to your account…')}
      ${undo ? html`<button class="btn sm ghost" disabled=${disabled} onClick=${()=>decide(undo.row,undo.previous,true)}>Undo</button>` : null}</div>
    ${view==='discover' ? html`<div class="swipe-stage">
      ${unseen.length ? html`<p class="muted small swipe-count">← Archive · Swipe to select →</p>
        <${SwipeCard} key=${unseen[0].id} row=${unseen[0]} disabled=${disabled} onDecide=${decision=>decide(unseen[0],decision)} />`
      : html`<div class="review-empty"><div class="empty-symbol">✓</div><h2>${loading ? 'Finding your matches…' : feed.jobs.length ? 'You’re all caught up.' : 'Your next chapter starts here.'}</h2>
        <p class="muted">${feed.jobs.length ? 'Your selected jobs are waiting in Selected. New recommendations will appear here after the next search.' : 'The daily search runs at 9 am Dubai time. New matches will arrive here ready to swipe.'}</p>
        ${saved.length ? html`<button class="btn primary" onClick=${()=>navigate('#/saved')}>Review ${saved.length} selected job${saved.length===1?'':'s'}</button>` : null}</div>`}
    </div>` : html`<p class="muted">${view==='saved' ? 'Selected on your phone, ready for a closer look here. Open a job to review the full description, tailor your CV and track the application.' : 'Changed your mind? Return a job to Discover or select it for review.'}</p>
      <div class="saved-grid">${(view==='saved' ? saved : passed).map(row=>html`<article class="saved-card" key=${row.id}>
        <div class="company-mark">${(row.job.company || 'J').slice(0,2).toUpperCase()}</div><p class="eyebrow">${row.job.company}</p><h2>${row.job.title}</h2><p class="muted small">${row.job.location}</p>
        <p class="saved-notes">${row.job.notes || (row.job.raw || row.job.description || '').slice(0,350)}</p>
        <div class="actions">${view==='saved' ? html`<button class="btn primary" disabled=${disabled} onClick=${()=>review(row)}>${opening===row.id ? 'Opening…' : 'Review & tailor CV'}</button><button class="btn ghost" disabled=${disabled} onClick=${()=>decide(row,'pass')}>Archive</button>` : html`<button class="btn primary" disabled=${disabled} onClick=${()=>decide(row,'keep')}>Select</button><button class="btn" disabled=${disabled} onClick=${()=>decide(row,'unseen')}>Back to Discover</button>`}</div>
        ${safeUrl(row.job.sourceUrl) ? html`<a class="small" href=${safeUrl(row.job.sourceUrl)} target="_blank" rel="noopener noreferrer">View original posting ↗</a>` : null}
      </article>`)}</div>
      ${!(view==='saved' ? saved : passed).length ? html`<div class="review-empty"><h2>${view==='saved' ? 'Your shortlist is waiting to happen.' : 'No archived matches yet.'}</h2><p class="muted">Explore your matches and make your first choice.</p><button class="btn" onClick=${()=>navigate('#/discover')}>Discover jobs</button></div>` : null}`}
    <footer class="discovery-footer"><details><summary>Search & sync details</summary><div class="search-details"><p class="small muted">${feed.latestRun ? `Last search: ${date(feed.latestRun.completedAt)} · ${feed.latestRun.summary}` : 'Daily search · 9 am Dubai time'}</p>
      <p class="small muted">Selected and archived choices sync into your inbox and pipeline. CVs, tailored documents and application tracking stay in the browser where you create them. Selecting a job never applies or starts paid tailoring.</p></div></details></footer>
  </div>`;
}

function SwipeCard({row,disabled,onDecide}) {
  const [offset,setOffset] = useState(0); const start = useRef(null);
  const job=row.job;
  const down=e=> { if(disabled || e.button!==0 || e.target.closest('a,button,summary,details')) return; start.current={x:e.clientX,y:e.clientY,width:e.currentTarget.clientWidth}; e.currentTarget.setPointerCapture(e.pointerId); };
  const move=e=> { if(start.current) { const dx=e.clientX-start.current.x,dy=e.clientY-start.current.y; setOffset(Math.abs(dx)>Math.abs(dy)*1.4 ? dx : 0); } };
  const up=e=> { const origin=start.current; start.current=null; setOffset(0); if(origin && !disabled) { const d=swipeDirection(e.clientX-origin.x,e.clientY-origin.y,origin.width); if(d) onDecide(d); } };
  const cancel=()=>{start.current=null;setOffset(0);};
  return html`<div class="swipe-wrap"><article class="swipe-card" aria-label=${job.title+' at '+job.company} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${cancel} onLostPointerCapture=${cancel} style=${{transform:`translateX(${Math.max(-150,Math.min(150,offset))}px) rotate(${offset/30}deg)`}}>
    ${Math.abs(offset)>35 ? html`<div class=${'swipe-stamp '+(offset>0?'keep':'pass')}>${offset>0 ? 'SELECT' : 'ARCHIVE'}</div>` : null}
    <div class="swipe-card-top"><div class="company-mark">${(job.company || 'J').slice(0,2).toUpperCase()}</div><span class="chip good">Daily match</span></div>
    <div class="swipe-card-content" tabindex="0" role="region" aria-label="Job information"><p class="eyebrow">${job.company}</p><h2>${job.title}</h2><p class="muted">${job.location}</p>
    <p class="small muted">${job.postedAt ? 'Posted '+date(job.postedAt) : job.postingAgeText || 'Posting date unknown'}</p>
    <div class="fit-notes"><h3>Why it’s on your radar</h3><p>${job.notes || 'Selected by your daily job search. Review the role details to decide whether it fits.'}</p></div>
    <details><summary>Read the job details</summary><p class="job-description">${job.raw || job.description}</p>
      ${(job.links || []).filter(l=>safeUrl(l.url)).map(l=>html`<p><a href=${safeUrl(l.url)} target="_blank" rel="noopener noreferrer">${l.label || 'Application link'} ↗</a></p>`)}</details>
    ${safeUrl(job.sourceUrl) ? html`<a class="small original-link" href=${safeUrl(job.sourceUrl)} target="_blank" rel="noopener noreferrer">Open original posting ↗</a>` : null}
    </div>
  </article><div class="swipe-actions"><button class="swipe-pass" disabled=${disabled} onClick=${()=>onDecide('pass')} aria-label="Archive this job"><b>×</b><span>Archive</span></button><button class="swipe-keep" disabled=${disabled} onClick=${()=>onDecide('keep')} aria-label="Select this job for review"><b>♡</b><span>Select</span></button></div></div>`;
}
