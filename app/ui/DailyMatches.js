import { useState, useEffect, useRef } from 'preact/hooks';
import { html, toast } from './components.js';
import { db, loadCV, loadJobs, importJobs } from './store.js';
import { CONNECTION_KEY, loadConnection, validateConnection, getFeed, syncFeed } from '../cloud/client.js';

export function DailyMatches({refresh}) {
  const [config, setConfig] = useState(loadConnection);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inflight = useRef(false);
  const lastAttempt = useRef(0);
  const stateKey = 'dailyInbox:' + (config?.endpoint || '');
  const check = async () => {
    if (!config || inflight.current) return;
    inflight.current = true; lastAttempt.current = Date.now(); setBusy(true); setError('');
    try {
      const run = async () => syncFeed({config, getState:()=>db.getMeta(stateKey), saveState:s=>db.setMeta(stateKey,s),
        loadJobs, importJobs, cv:await loadCV()});
      const result = navigator.locks ? await navigator.locks.request('jobpilot-daily-import', run) : await run();
      setState(result); await refresh();
      if (result.added) toast(`${result.added} daily match${result.added === 1 ? '' : 'es'} added to your inbox`);
    } catch (e) { setError(e.message); }
    finally { inflight.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (!config) return;
    db.getMeta(stateKey).then(setState);
    check();
    const maybeCheck = () => { if (document.visibilityState === 'visible' && Date.now()-lastAttempt.current > 30000) check(); };
    const interval = setInterval(maybeCheck, 300000);
    window.addEventListener('focus',maybeCheck); window.addEventListener('online',maybeCheck);
    return () => { clearInterval(interval); window.removeEventListener('focus',maybeCheck); window.removeEventListener('online',maybeCheck); };
  }, [config?.endpoint, config?.readKey]);
  const connect = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setError('');
    try {
      if (file.size > 5000) throw new Error('Choose the small JobPilot connection file.');
      const next = validateConnection(JSON.parse(await file.text()));
      await getFeed(next);
      localStorage.setItem(CONNECTION_KEY, JSON.stringify(next)); setConfig(next);
      toast('Daily matches connected');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); event.target.value = ''; }
  };
  const date = s => new Date(s).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  return html`<section class="panel" aria-label="Daily matches" style="margin-bottom:18px">
    <div class="head"><h2>Daily matches</h2><span class="muted small">Every day · 9 am Dubai</span></div>
    <div class="body stack">
      ${config ? html`<div class="actions"><button class="btn" disabled=${busy} onClick=${check}>${busy ? 'Checking matches…' : 'Check now'}</button>
        <button class="btn ghost" disabled=${busy} onClick=${()=>{localStorage.removeItem(CONNECTION_KEY);setConfig(null);setError('');setState(null);}}>Disconnect this device</button></div>
        <div class="small">${state?.latestRun ? `Last search: ${date(state.latestRun.completedAt)} — ${state.latestRun.summary}` : 'Connected. Waiting for the first daily shortlist.'}</div>
        ${state?.checkedAt ? html`<div class="muted small">Inbox checked ${date(state.checkedAt)}. New matches appear automatically when you open JobPilot.</div>` : null}`
      : html`<p>Receive your daily shortlist here, with fit notes and links to apply. Connect once on each device using your private connection file.</p>
        <label class="btn">${busy ? 'Connecting…' : 'Connect daily matches'}<input class="sr-only" type="file" accept=".json,application/json" disabled=${busy} onChange=${connect} /></label>`}
      ${error ? html`<div role="alert" class="small">${error}</div>` : null}
      <div class="muted small">Recommendations sync across connected devices. CVs, tailored documents and application statuses stay in this browser. Imports never start paid tailoring.</div>
    </div>
  </section>`;
}
