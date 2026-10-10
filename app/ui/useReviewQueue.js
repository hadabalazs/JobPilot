import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { reconcileReview } from './reconcileReview.js';
import { account } from '../cloud/account.js';
import { reviewFeed, saveDecision } from '../cloud/review.js';

export function useReviewQueue(onRefresh) {
  const [feed,setFeed] = useState({jobs:[],latestRun:null,checkedAt:null});
  const [loading,setLoading] = useState(true); const [saving,setSaving] = useState(false);
  const [error,setError] = useState(''); const [undo,setUndo] = useState(null);
  const [message,setMessage] = useState(''); const refreshLocal = useRef(onRefresh); refreshLocal.current=onRefresh; const busy = useRef(false); const alive = useRef(true);
  const reload = useCallback(async () => {
    if (busy.current) return;
    busy.current=true; setLoading(true);
    try { const next = await reviewFeed(account); if (await reconcileReview(next.jobs)) await refreshLocal.current?.(); if (alive.current) { setFeed(next); setError(''); } }
    catch(e) { if (alive.current) setError(e.message); }
    finally { busy.current=false; if (alive.current) setLoading(false); }
  },[]);
  useEffect(() => {
    alive.current=true; reload();
    const refresh = () => { if (document.visibilityState === 'visible') reload(); };
    const interval = setInterval(refresh,30000);
    window.addEventListener('focus',refresh); window.addEventListener('online',refresh); document.addEventListener('visibilitychange',refresh);
    return () => { alive.current=false; clearInterval(interval); window.removeEventListener('focus',refresh); window.removeEventListener('online',refresh); document.removeEventListener('visibilitychange',refresh); };
  },[reload]);
  const decide = async (row,decision,isUndo=false) => {
    if (busy.current) return false;
    busy.current=true; setSaving(true); setError(''); setMessage('');
    let failed=false;
    try {
      const next = await saveDecision(account,row,decision);
      await reconcileReview([next]); await refreshLocal.current?.();
      if (!alive.current) return false;
      setFeed(f=>({...f,jobs:f.jobs.map(j=>j.id===next.id ? next : j)}));
      setUndo(isUndo ? null : {row:next,previous:row.decision});
      setMessage(isUndo ? 'Undone · synced' : decision === 'keep' ? 'Selected · synced' : decision === 'pass' ? 'Archived · synced' : 'Returned to your swipe queue · synced');
      return true;
    } catch(e) { failed=true; if (alive.current) setError(e.message); return false; }
    finally {
      busy.current=false; if (alive.current) setSaving(false);
      // A lost response may still have committed. Reload without claiming success.
      if (failed && alive.current) {
        busy.current=true;
        try { const next = await reviewFeed(account); if (await reconcileReview(next.jobs)) await refreshLocal.current?.(); if (alive.current) setFeed(next); } catch {}
        finally { busy.current=false; }
      }
    }
  };
  return {feed,loading,saving,error,message,undo,reload,decide};
}
