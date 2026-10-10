import { useState, useEffect } from 'preact/hooks';
import { html } from './components.js';
import { account, LOGIN_REDIRECT, EMAIL_LINK_ENABLED } from '../cloud/account.js';

export function AuthGate({children}) {
  const [session,setSession] = useState(undefined);
  const [allowed,setAllowed] = useState(false);
  const [error,setError] = useState('');
  const [checking,setChecking] = useState(false);
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    const {data:{subscription}} = account.auth.onAuthStateChange((_event,next) => { if (live) setSession(next); });
    account.auth.getSession().then(({data,error}) => { if (live) { setSession(data.session); if (error) setError('Your sign-in link expired or could not be opened. Request a new link.'); } });
    return () => { live = false; subscription.unsubscribe(); };
  },[]);
  useEffect(() => {
    let live = true; setAllowed(false); setError('');
    if (!session?.user?.id) return;
    setChecking(true);
    (async () => {
      try {
        const {error} = await account.rpc('jobpilot_review_feed',{p_after:0}).abortSignal(AbortSignal.timeout(20000));
        if (!live) return;
        if (error) setError(error.code === '42501' ? 'This email does not have access to this private JobPilot account.' : 'Could not verify your account. Check your connection and try again.');
        else setAllowed(true);
      } catch { if (live) setError('Could not verify your account. Check your connection and try again.'); }
      finally { if (live) setChecking(false); }
    })();
    return () => { live=false; };
  },[session?.user?.id,attempt]);
  if (session && allowed) return children;
  if (session === undefined || checking) return html`<div class="login-shell"><div class="login-card" role="status">Opening your private workspace…</div></div>`;
  if (session) return html`<div class="login-shell"><section class="login-card stack"><h1>JobPilot</h1><p role="alert">${error}</p><button class="btn primary" onClick=${()=>setAttempt(a=>a+1)}>Try again</button><button class="btn" onClick=${()=>account.auth.signOut({scope:'local'})}>Use another account</button></section></div>`;
  return html`<${SignIn} initialError=${error} />`;
}

function SignIn({initialError}) {
  const [email,setEmail] = useState(''); const [password,setPassword] = useState('');
  const [usePassword,setUsePassword] = useState(!EMAIL_LINK_ENABLED); const [busy,setBusy] = useState(false);
  const [error,setError] = useState(initialError || ''); const [sent,setSent] = useState(false);
  const submit = async event => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const {error} = usePassword ? await account.auth.signInWithPassword({email:email.trim(),password}) :
        await account.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:LOGIN_REDIRECT}});
      if (error) throw error;
      if (!usePassword) setSent(true);
    } catch(e) { setError(e.message || 'Sign-in failed. Please try again.'); }
    finally { setBusy(false); setPassword(''); }
  };
  return html`<div class="login-shell"><section class="login-card">
    <div class="login-brand"><span>J</span> JobPilot</div><p class="eyebrow">YOUR NEXT MOVE</p>
    <h1>Find it on your phone.<br/>Make it happen on desktop.</h1>
    <p class="muted">Swipe through your daily job matches. Keep the ones worth a closer look, then pick up where you left off on any device.</p>
    <form onSubmit=${submit} class="stack">
      <label class="field">Email<input type="email" autocomplete="email" required value=${email} onInput=${e=>setEmail(e.target.value)} placeholder="you@example.com" /></label>
      ${usePassword ? html`<label class="field">Password<input type="password" autocomplete="current-password" required value=${password} onInput=${e=>setPassword(e.target.value)} /></label>` : null}
      <button class="btn primary login-submit" disabled=${busy}>${busy ? 'Please wait…' : usePassword ? 'Sign in' : sent ? 'Send another sign-in link' : 'Email me a sign-in link'}</button>
      ${sent && !usePassword ? html`<p role="status" class="login-notice">Check your email and open the sign-in link on this device. If it is not there, check spam. Allow a minute before requesting another.</p>` : null}
      ${error ? html`<p role="alert" class="error-text">${error}</p>` : null}
    </form>
    ${EMAIL_LINK_ENABLED ? html`<button class="btn ghost" onClick=${()=>{setUsePassword(!usePassword);setError('');}}>${usePassword ? 'Use an email link instead' : 'Use an existing password instead'}</button>` : html`<p class="small muted">Use the existing password for your account.</p>`}
    <p class="small muted">Private workspace · Your selected and archived jobs sync securely.</p>
  </section></div>`;
}
