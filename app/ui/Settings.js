import { useState } from 'preact/hooks';
import { html, Field, Note, toast, download, readFileText } from './components.js';
import { saveSettings, loadUsage, db } from './store.js';
import { PROVIDER_PRESETS } from '../config.js';
import { ulid } from '../ids.js';
import { monthlyTotal } from '../providers/cost.js';

export function Settings({ settings, refresh, usage }) {
  const [s, setS] = useState(settings);
  const [claims, setClaims] = useState((settings.forbiddenClaims || []).join('\n'));
  const upd = patch => setS(x => ({ ...x, ...patch }));
  const save = async () => { await saveSettings({ ...s, forbiddenClaims: claims.split('\n').map(x => x.trim()).filter(Boolean) }); toast('Settings saved'); refresh(); };
  const addPreset = p => upd({ providers: [...s.providers, { ...p, id: ulid(), apiKey: p.apiKey || '', pricing: p.pricing || { inPerM: 0, outPerM: 0 } }] });
  const updProv = (id, patch) => upd({ providers: s.providers.map(p => (p.id === id ? { ...p, ...patch } : p)) });
  const rmProv = id => upd({ providers: s.providers.filter(p => p.id !== id), activeProviderId: s.activeProviderId === id ? 'manual' : s.activeProviderId });
  const spent = monthlyTotal(usage || []);
  const backup = async () => download(`jobpilot-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await db.exportAll()));
  const restore = async e => { const f = e.target.files[0]; if (!f) return; try { await db.importAll(JSON.parse(await readFileText(f))); toast('Backup imported'); refresh(); } catch (err) { toast(err.message, 'bad'); } e.target.value = ''; };
  const bookmarklet = `javascript:(()=>{const t=(getSelection().toString()||document.body.innerText).slice(0,20000);const u=${JSON.stringify(location.origin + location.pathname)}+'#/intake?p='+encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({title:document.title,url:location.href,text:t})))));window.open(u,'_blank');})();`;
  return html`
    <div class="topbar"><div><h1>Settings</h1><div class="muted small">Stored only in this browser. Back up regularly.</div></div><div class="actions"><button class="btn primary" onClick=${save}>Save settings</button></div></div>
    <div class="grid-2">
      <div class="stack">
        <div class="panel"><div class="head"><h2>Tailoring</h2></div><div class="body">
          <div class="row">
            <${Field} label="Page target"><input type="number" min="1" max="4" value=${s.pageTarget} onInput=${e => upd({ pageTarget: +e.target.value })} /><//>
            <${Field} label="Follow-up after (days)"><input type="number" min="1" value=${s.followUpDays} onInput=${e => upd({ followUpDays: +e.target.value })} /><//>
          </div>
          <${Field} label="Filename pattern" hint="{name} {company} {role}"><input type="text" value=${s.filenamePattern} onInput=${e => upd({ filenamePattern: e.target.value })} /><//>
          <${Field} label="CV slice budget (characters)" hint="Lower this if a free AI chat rejects long pastes. ~4 chars ≈ 1 token."><input type="number" step="1000" value=${s.sliceCharBudget} onInput=${e => upd({ sliceCharBudget: +e.target.value })} /><//>
          <${Field} label="Forbidden claims (one per line)" hint='Hard-fail any output containing these, e.g. "fluent Arabic", "PMP".'><textarea value=${claims} onInput=${e => setClaims(e.target.value)} style="min-height:80px"></textarea><//>
        </div></div>
        <div class="panel"><div class="head"><h2>Backup</h2></div><div class="body stack">
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onClick=${backup}>Export backup</button><label class="btn">Import backup<input type="file" accept=".json" class="sr-only" onChange=${restore} /></label>
            <button class="btn danger" onClick=${async () => { if (confirm('Delete ALL local data (CV, jobs, runs, settings)?')) { await db.wipeAll(); location.reload(); } }}>Wipe all data</button></div>
          <div class="muted small">Your data lives in this browser's IndexedDB. Clearing site data or switching devices loses it unless you export.</div>
        </div></div>
        <div class="panel"><div class="head"><h2>Bookmarklet</h2></div><div class="body stack small">
          <div>Drag this to your bookmarks bar. On any job posting you're viewing, select the text (or select nothing to grab the whole page) and click it — the posting opens here as a new job.</div>
          <a class="btn" href=${bookmarklet} onClick=${e => e.preventDefault()}>➜ Send to JobPilot</a>
          <div class="muted">It captures the posting text and its URL, so you can reopen the listing later. It only reads the page you're looking at — no background crawling.</div>
        </div></div>
      </div>
      <div class="stack">
        <div class="panel"><div class="head"><h2>AI providers</h2><span class="muted small">This month: $${spent.toFixed(2)} of $${s.monthlyCapUsd}</span></div><div class="body stack">
          <${Field} label="Active provider"><select value=${s.activeProviderId} onChange=${e => upd({ activeProviderId: e.target.value })}>${s.providers.map(p => html`<option value=${p.id}>${p.name}${p.kind === 'manual' ? '' : ` (${p.model || 'no model set'})`}</option>`)}</select><//>
          <${Field} label="Monthly cost cap (USD)" hint="When reached, automatic runs stop and the manual flow takes over."><input type="number" min="0" step="1" value=${s.monthlyCapUsd} onInput=${e => upd({ monthlyCapUsd: +e.target.value })} /><//>
          <div class="field">
            <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" checked=${!!s.autoTailor} onChange=${e => upd({ autoTailor: e.target.checked })} /> Tailor new jobs automatically</label>
            <span class="hint">Every job you add runs straight through the active provider. Ignored while the provider is Manual, and it still stops at your cost cap.</span>
          </div>
          ${s.autoTailor ? html`<${Field} label="Only if local fit is at least" hint="The keyword pre-filter runs first, so weak matches don't cost you anything."><input type="number" min="0" max="100" step="5" value=${s.autoTailorMinScore} onInput=${e => upd({ autoTailorMinScore: +e.target.value })} /><//>` : null}
          ${s.autoTailor && (s.providers.find(p => p.id === s.activeProviderId) || {}).kind === 'manual' ? html`<${Note} kind="warn">Auto-tailor is on but the active provider is Manual, so nothing will run automatically. Pick an API provider above.<//>` : null}
          <${Note}>Keys are stored only on this device. Use a scoped key with a spend limit. Anyone with access to this browser profile could read it.<//>
          ${s.providers.filter(p => p.kind !== 'manual').map(p => html`<details class="provider" key=${p.id}><summary>${p.name} <span class="muted small">${p.kind}</span></summary>
            <${Field} label="Name"><input type="text" value=${p.name} onInput=${e => updProv(p.id, { name: e.target.value })} /><//>
            <${Field} label="Base URL"><input type="url" value=${p.baseUrl || ''} onInput=${e => updProv(p.id, { baseUrl: e.target.value })} /><//>
            <${Field} label="Model id" hint="Copy the exact id from the provider's model list."><input type="text" value=${p.model || ''} onInput=${e => updProv(p.id, { model: e.target.value })} placeholder="e.g. provider/model-name" /><//>
            <${Field} label="API key"><input type="password" value=${p.apiKey || ''} onInput=${e => updProv(p.id, { apiKey: e.target.value })} autocomplete="off" /><//>
            ${p.kind === 'anthropic' ? html`<${Field} label="Workspace ID (only for identity-linked keys)" hint="Leave blank for a normal workspace-scoped key. If the API returns 'anthropic-workspace-id is required', paste the workspace id here.">
              <input type="text" value=${(p.extraHeaders || {})['anthropic-workspace-id'] || ''} onInput=${e => { const h = { ...(p.extraHeaders || {}) }; if (e.target.value.trim()) h['anthropic-workspace-id'] = e.target.value.trim(); else delete h['anthropic-workspace-id']; updProv(p.id, { extraHeaders: h }); }} placeholder="wrkspc_…" /><//>` : null}
            <div class="row">
              ${p.kind === 'openai_compatible' ? html`<${Field} label="JSON mode"><select value=${p.jsonMode || 'none'} onChange=${e => updProv(p.id, { jsonMode: e.target.value })}><option value="none">none</option><option value="json_object">json_object</option><option value="json_schema">json_schema (strict)</option></select><//>` : null}
              <${Field} label="Max tokens" hint="8000+ for reasoning models"><input type="number" value=${p.maxTokens || 8000} onInput=${e => updProv(p.id, { maxTokens: +e.target.value })} /><//>
              <${Field} label="Temperature" hint=${p.kind === 'anthropic' ? 'Leave off — newer models reject it.' : ''}>
                ${p.kind === 'anthropic' ? html`<label style="display:flex;gap:6px;align-items:center;padding-top:6px"><input type="checkbox" checked=${p.sendTemperature === true} onChange=${e => updProv(p.id, { sendTemperature: e.target.checked })} /> send temperature</label>`
                  : html`<input type="number" step="0.1" min="0" max="1" value=${p.temperature ?? 0.2} onInput=${e => updProv(p.id, { temperature: +e.target.value })} />`}<//>
            </div>
            ${p.kind === 'openai_compatible' && /^gpt-6-(sol|luna|astra)$/i.test(p.model || '') ? html`<${Field} label="Reasoning effort" hint="Medium is the recommended starting point for CV tailoring."><select value=${p.reasoningEffort || 'medium'} onChange=${e => updProv(p.id, { reasoningEffort: e.target.value })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select><//>` : null}
            ${p.note ? html`<div class="hint" style="margin-top:-4px;margin-bottom:10px">${p.note}<//>` : null}
            <div class="row">
              <${Field} label="Price in / 1M tokens ($)"><input type="number" step="0.01" value=${p.pricing?.inPerM ?? 0} onInput=${e => updProv(p.id, { pricing: { ...(p.pricing || {}), inPerM: +e.target.value } })} /><//>
              <${Field} label="Price out / 1M tokens ($)"><input type="number" step="0.01" value=${p.pricing?.outPerM ?? 0} onInput=${e => updProv(p.id, { pricing: { ...(p.pricing || {}), outPerM: +e.target.value } })} /><//>
            </div>
            <div style="padding-bottom:12px"><button class="btn danger sm" onClick=${() => rmProv(p.id)}>Remove</button></div>
          </details>`)}
          <div><div class="small muted" style="margin-bottom:6px">Add from preset</div><div style="display:flex;gap:6px;flex-wrap:wrap">${PROVIDER_PRESETS.map(p => html`<button class="btn sm" onClick=${() => addPreset(p)}>+ ${p.name}</button>`)}</div></div>
          <div class="muted small">Local models: start Ollama with <code>OLLAMA_ORIGINS=${location.origin}</code> so the browser is allowed to call it.</div>
        </div></div>
      </div>
    </div>`;
}
