import {useState, useEffect, useRef} from 'preact/hooks';
import {html} from './components.js';
import {account} from '../cloud/account.js';
import {searchControl} from '../cloud/search.js';

export function SearchSettings() {
  const [data,setData]=useState(null),[count,setCount]=useState(5),[times,setTimes]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const pendingId=useRef(null), lock=useRef(false), alive=useRef(true), dirty=useRef(false);
  const accept=(next,replace=false)=>{setData(previous=>dirty.current && !replace && previous ? {...next,preferences:previous.preferences} : next); if(replace || !dirty.current) {setCount(next.preferences.matchCount);setTimes(next.preferences.extraTimes);}};
  useEffect(()=>{alive.current=true; const load=async()=>{if(lock.current || document.hidden)return; try {const next=await searchControl(account);if(alive.current)accept(next);}catch(e){if(alive.current)setError(e.message);}};load();const timer=setInterval(load,30000);window.addEventListener('focus',load);window.addEventListener('online',load);return()=>{alive.current=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('online',load);};},[]);
  const act=async action=>{
    if(lock.current || !data)return;lock.current=true;setBusy(true);setError('');setMessage('');
    try {
      if(action==='request') pendingId.current ||= crypto.randomUUID();
      const next=await searchControl(account,action,{count,times:times.filter(Boolean),revision:data.preferences.revision,requestId:action==='request'?pendingId.current:null});
      if(action==='save'){dirty.current=false;accept(next,true);setMessage('Search preferences saved across your devices.');}
      else {accept(next);pendingId.current=null; const r=next.requests.find(r=>r.id===next.requestId);setMessage(r?.status==='queued'?`Search queued for up to ${r.match_count} good matches.`:r?.status==='running'?'Your search is already running.':'This request has already finished.');}
    }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
  };
  const active=data?.requests.find(r=>['queued','running'].includes(r.status));
  return html`<section class="search-settings"><header class="topbar"><h1>Job searches</h1></header>
    <p>Dubai and Abu Dhabi · senior delivery, programme, transformation and relevant product roles. Accenture, Halian and previously included jobs are excluded.</p>
    <div class="card search-controls"><h2>Your next matches</h2>
      <label>Maximum qualified matches per search <input type="number" min="1" max="20" step="1" value=${count} disabled=${busy || !data} onInput=${e=>{dirty.current=true;setCount(Number(e.target.value));}} /></label>
      <p class="muted small">1–20 matches. You may receive fewer when there aren’t enough verified good fits. Quality takes priority over the target.</p>
      <button class="btn primary" disabled=${busy || !data || !!active} onClick=${()=>act('request')}>${active?.status==='running'?'Search running…':active?'Search queued':'Search now'}</button>
      <p class="muted small">Requests are checked about every 5 minutes while the Codex desktop runner is available; research takes additional time. Keep Codex and the computer running. This uses your Codex allowance.</p>
      <h2>Schedule · Dubai time</h2><p>Daily at <strong>09:00</strong>. Add up to three extra daily searches.</p>
      ${times.map((time,i)=>html`<div class="actions" key=${i}><label>Extra time ${i+1} <input type="time" value=${time} disabled=${busy || !data} onInput=${e=>{dirty.current=true;setTimes(times.map((t,n)=>n===i?e.target.value:t));}} /></label><button class="btn ghost" disabled=${busy} onClick=${()=>{dirty.current=true;setTimes(times.filter((_,n)=>n!==i));}}>Remove</button></div>`)}
      <div class="actions">${times.length<3?html`<button class="btn" disabled=${busy || !data} onClick=${()=>{dirty.current=true;setTimes([...times,'']);}}>Add time</button>`:null}<button class="btn" disabled=${busy || !data} onClick=${()=>act('save')}>Save preferences</button></div>
      <p class="muted small">Save applies the match limit to scheduled searches. Search now uses the number above immediately. Missed schedules are picked up for 30 minutes; searches never overlap.</p>
    </div>
    ${error?html`<p role="alert" class="error-text">${error}</p>`:null}${message?html`<p role="status">${message}</p>`:null}
    <h2>Recent searches</h2>${!data?html`<p>Connecting…</p>`:!data.requests.length?html`<p class="muted">No requests yet. Earlier deliveries remain in Discover.</p>`:data.requests.map(r=>html`<article class="card search-history" key=${r.id}><strong>${r.status==='completed'?'Completed':r.status==='failed'?'Could not finish':r.status==='running'?'Researching':'Queued'} · up to ${r.match_count} matches</strong><p class="small muted">${new Date(r.created_at).toLocaleString('en-GB',{timeZone:'Asia/Dubai'})} Dubai · ${r.source==='manual'?'On demand':'Scheduled'}</p>${r.summary?html`<p>${r.summary}</p>`:null}${r.added!=null?html`<p class="small">${r.added} added · ${r.skipped} duplicates skipped</p>`:null}</article>`)}
  </section>`;
}
