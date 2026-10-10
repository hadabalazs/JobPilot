import { useState, useEffect, useCallback } from 'preact/hooks';
import { html, ToastHost, toast } from './components.js';
import { loadSettings, loadCV, loadJobs, loadEvents, loadUsage, backfillBestRunIds, recalibrateFitScores } from './store.js';
import { Discover } from './Discover.js';
import { useReviewQueue } from './useReviewQueue.js';
import { isUntailored } from '../cloud/reviewStatus.js';
import { matchingJob } from '../cloud/review.js';
import { account } from '../cloud/account.js';
import { Inbox } from './Inbox.js';
import { JobDetail } from './JobDetail.js';
import { MasterCv } from './MasterCv.js';
import { Settings } from './Settings.js';
import { Board } from './Board.js';
import { APP_VERSION } from '../config.js';

const useHash = () => { const [h, setH] = useState(location.hash || '#/'); useEffect(() => { const f = () => setH(location.hash || '#/'); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []); return h; };
const navigate = h => { location.hash = h; window.scrollTo(0, 0); };

export function App() {
  const hash = useHash();
  const [signingOut,setSigningOut] = useState(false);
  const signOut = async () => { setSigningOut(true); const {error}=await account.auth.signOut({scope:'local'}); if(error) { toast(error.message); setSigningOut(false); } };
  const [state, setState] = useState({ ready: false, settings: null, cv: null, jobs: [], events: [], usage: [] });
  const refresh = useCallback(async () => { const [settings, cv, jobs, events, usage] = await Promise.all([loadSettings(), loadCV(), loadJobs(), loadEvents(), loadUsage()]); setState({ ready: true, settings, cv, jobs, events, usage }); }, []);
  const queue = useReviewQueue(refresh);
  useEffect(() => { (async () => { const n = await backfillBestRunIds(); const scored = await recalibrateFitScores(); await refresh(); if (n) toast(`Reconnected ${n} previously tailored job${n === 1 ? '' : 's'} to their PDF`); else if (scored) toast(`Recalibrated ${scored} saved fit score${scored === 1 ? '' : 's'}`); })(); }, []);
  if (!state.ready) return html`<div style="padding:40px" class="muted">Loading…</div>`;
  const route = hash.replace(/^#/, '');
  let payload = null;
  if (route.startsWith('/intake')) { try { payload = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(new URLSearchParams(route.split('?')[1]).get('p')))))); } catch { payload = null; } }
  const page = route.startsWith('/job/') ? 'job' : route.startsWith('/board') ? 'board' : route.startsWith('/cv') ? 'cv' : route.startsWith('/settings') ? 'settings' : route.startsWith('/inbox') || route.startsWith('/intake') ? 'inbox' : route.startsWith('/saved') ? 'saved' : route.startsWith('/passed') ? 'passed' : 'discover';
  const nav = (id, label, href, count) => html`<button class="nav" aria-current=${page === id ? 'page' : null} onClick=${() => navigate(href)}>${label}${count != null ? html`<span class="count">${count}</span>` : null}</button>`;
  const active = state.jobs.filter(j => !j.archived);
  return html`<div class="shell">
    <aside class="side"><div class="logo"><i></i>JobPilot<small>v${APP_VERSION}</small></div>
      ${nav('discover', 'Discover', '#/discover', queue.feed.jobs.filter(j=>j.decision==='unseen' && isUntailored(matchingJob(j.job,state.jobs))).length)}
      ${nav('saved', 'Selected', '#/saved', queue.feed.jobs.filter(j=>j.decision==='keep').length)}
      ${nav('inbox', 'Inbox', '#/inbox', active.filter(j => ['inbox', 'scored'].includes(j.status)).length)}
      ${nav('board', 'Pipeline', '#/board', active.filter(j => !['inbox', 'scored'].includes(j.status)).length)}
      ${nav('cv', 'Master CV', '#/cv')}
      ${nav('settings', 'Settings', '#/settings')}
      <button class="nav signout" disabled=${signingOut} onClick=${signOut}>${signingOut ? 'Signing out…' : 'Sign out'}</button>
      <div class="foot">${state.cv ? state.cv.identity.full_name : 'No master CV'}<br/>Provider: ${(state.settings.providers.find(p => p.id === state.settings.activeProviderId) || {}).name || 'Manual'}</div>
    </aside>
    <main>
      ${['discover','saved','passed'].includes(page) ? html`<${Discover} queue=${queue} view=${page} jobs=${state.jobs} cv=${state.cv} refresh=${refresh} navigate=${navigate} />` : null}
      ${page === 'inbox' ? html`<${Inbox} jobs=${state.jobs} cv=${state.cv} settings=${state.settings} refresh=${refresh} navigate=${navigate} initialPayload=${payload} />` : null}
      ${page === 'job' ? html`<${JobDetail} id=${route.slice(5)} jobs=${state.jobs} cv=${state.cv} settings=${state.settings} refresh=${refresh} navigate=${navigate} />` : null}
      ${page === 'board' ? html`<${Board} jobs=${state.jobs} events=${state.events} settings=${state.settings} refresh=${refresh} navigate=${navigate} />` : null}
      ${page === 'cv' ? html`<${MasterCv} cv=${state.cv} refresh=${refresh} />` : null}
      ${page === 'settings' ? html`<${Settings} key=${JSON.stringify(state.settings).length} settings=${state.settings} usage=${state.usage} refresh=${refresh} />` : null}
    </main>
    <${ToastHost} />
  </div>`;
}
