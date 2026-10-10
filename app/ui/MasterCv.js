import { useState } from 'preact/hooks';
import { html, Note, Field, Chip, toast, download, readFileText } from './components.js';
import { validateCVMaster, migrateV1toV2, factCounts } from '../schemas/cv_master.js';
import { saveCV, rescoreAll } from './store.js';
import { render as renderImportPrompt } from '../prompts/cv_import_v1.js';
import { extractJSON } from '../providers/parse.js';
import { copyText } from './components.js';
import { TailoringContext } from './TailoringContext.js';

export function MasterCv({ cv, refresh }) {
  const [pending, setPending] = useState(null); // { before, after, counts, errors }
  const [builder, setBuilder] = useState(false);
  const onFile = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const src = JSON.parse(await readFileText(f));
      const after = migrateV1toV2(src);
      const v = validateCVMaster(after);
      setPending({ before: factCounts(src.schema_version === 2 ? src : { experience: src.experience || src.roles || src.work || [], summary_variants: src.summary_variants || src.summaries || (src.summary ? [1] : []), education: src.education || [], certifications: src.certifications || src.certs || [], skills: Array.isArray(src.skills) ? { groups: [{ items: src.skills }] } : src.skills, competencies: src.competencies || [] }), after, counts: factCounts(after), errors: v.errors, migrated: src.schema_version !== 2 });
    } catch (err) { toast('Could not read file: ' + err.message, 'bad'); }
    e.target.value = '';
  };
  const lost = pending && ['roles', 'bullets', 'summaries', 'education', 'certifications'].some(k => (pending.counts[k] || 0) < (pending.before[k] || 0));
  const commit = async () => { await saveCV(pending.after); await rescoreAll(pending.after); setPending(null); toast('Master CV saved and jobs rescored'); refresh(); };
  const counts = cv ? factCounts(cv) : null;
  return html`
    <div class="topbar"><div><h1>Master CV</h1><div class="muted small">Source of truth. The AI can only select, reorder and rephrase what's here.</div></div>
      <div class="actions"><label class="btn primary">${cv ? 'Re-import JSON' : 'Import cv_master.json'}<input type="file" accept="application/json,.json" class="sr-only" onChange=${onFile} /></label>
        ${cv ? html`<button class="btn" onClick=${() => download('cv_master.v2.json', JSON.stringify(cv, null, 2))}>Export v2</button>` : null}
        <button class="btn" onClick=${() => setBuilder(b => !b)}>${builder ? 'Close builder' : "Build one from my CV text"}</button>
        <a class="btn ghost" href="tests/fixtures/cv_master.sample.json" download>Sample file</a></div></div>
    ${builder ? html`<${CvBuilder} onResult=${obj => { const after = migrateV1toV2(obj); setPending({ before: factCounts(after), after, counts: factCounts(after), errors: validateCVMaster(after).errors, migrated: false }); setBuilder(false); }} />` : null}
    ${pending ? html`<div class="panel" style="margin-bottom:18px"><div class="head"><h2>${pending.migrated ? 'Migration preview' : 'Import preview'}</h2></div><div class="body stack">
      <table><thead><tr><th>Fact</th><th>In file</th><th>After import</th></tr></thead><tbody>
        ${Object.keys(pending.counts).map(k => html`<tr><td>${k}</td><td>${pending.before[k] ?? '—'}</td><td class=${(pending.counts[k] || 0) < (pending.before[k] || 0) ? 'score' : ''} style=${(pending.counts[k] || 0) < (pending.before[k] || 0) ? 'color:var(--bad-ink)' : ''}>${pending.counts[k]}</td></tr>`)}
      </tbody></table>
      ${lost ? html`<${Note} kind="bad">Import blocked: some facts would be lost. Check the file structure or ask for help mapping the fields.<//>` : null}
      ${pending.errors.length ? html`<${Note} kind="bad">Validation errors:<ul>${pending.errors.slice(0, 12).map(e => html`<li>${e}</li>`)}</ul><//>` : html`<${Note} kind="good">Schema valid. ${pending.migrated ? 'Stable ids were assigned to every role and bullet.' : ''}<//>`}
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" onClick=${() => setPending(null)}>Cancel</button><button class="btn primary" disabled=${lost || pending.errors.length > 0} onClick=${commit}>Save as master CV</button></div>
    </div></div>` : null}
    ${!cv && !builder && !pending ? html`<div class="empty"><h2>No master CV yet</h2><p>Two ways in: import an existing <code>cv_master.json</code> (a v1 file is migrated here in your browser with a fact-count check), or paste your CV as plain text and let the AI structure it once — free, same copy-paste loop as tailoring.</p><button class="btn primary" onClick=${() => setBuilder(true)}>Build one from my CV text</button></div>` : !cv ? null : html`
      <${TailoringContext} cv=${cv} refresh=${refresh} />
      <div class="grid-2">
        <div class="panel"><div class="head"><h2>${cv.identity.full_name}</h2><span class="muted small">${cv.identity.headline}</span></div><div class="body">
          <dl class="kv">${Object.entries(counts).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl></div></div>
        <div class="panel"><div class="head"><h2>Competencies</h2></div><div class="body small">${cv.competencies.map(c => html`<div style="margin-bottom:6px"><b>${c.label}</b> <span class="mono muted">${c.id}</span><div class="muted">${(c.aliases || []).join(' · ')}</div></div>`)}</div></div>
      </div>
      ${(() => { const ph = cv.experience.flatMap(e => e.bullets.filter(b => b.placeholder)); const nm = cv.experience.flatMap(e => e.bullets.filter(b => !b.placeholder && !Object.keys(b.metrics || {}).length));
        return (ph.length || nm.length) ? html`<div style="margin-top:16px"><${Note} kind="warn">${ph.length ? html`<div>${ph.length} placeholder bullet${ph.length > 1 ? 's' : ''} — excluded from every prompt, so those roles render short. Replace the text and re-import to use them.</div>` : ''}${nm.length ? html`<div>${nm.length} bullet${nm.length > 1 ? 's have' : ' has'} no <code>metrics</code>. Any figure in the text can still be checked, but adding metrics makes the fabrication guard stricter.</div>` : ''}<//></div>` : null; })()}
      <div class="panel" style="margin-top:16px"><div class="head"><h2>Experience & bullet ids</h2></div><div class="body">
        ${cv.experience.map(e => html`<div style="margin-bottom:14px"><b>${e.title}</b> · ${e.employer} <span class="mono muted small">${e.id}</span>
          <ul class="list-plain small">${e.bullets.map(b => html`<li><span class="mono muted">${b.id}</span> ${b.placeholder ? html`<${Chip} kind="stretch">placeholder — never sent to the AI<//> ` : ''}${b.text}${Object.keys(b.metrics || {}).length ? html`<span class="muted"> · metrics: ${Object.values(b.metrics).join('; ')}</span>` : html`<span class="muted"> · no metrics</span>`}</li>`)}</ul></div>`)}
      </div></div>`}`;
}

function CvBuilder({ onResult }) {
  const [step, setStep] = useState(1);
  const [cvText, setCvText] = useState('');
  const [notes, setNotes] = useState('');
  const [pasted, setPasted] = useState('');
  const parsed = pasted.trim() ? extractJSON(pasted) : null;
  const prompt = renderImportPrompt({ cvText, notes });
  return html`<div class="panel" style="margin-bottom:18px"><div class="head"><h2>Build cv_master.json from your CV</h2><span class="muted small">One-time. Runs on a free AI chat.</span></div><div class="body stack">
    <div class="steps">
      <div class="step ${cvText.length > 200 ? 'done' : ''}"><b>1 · Paste your CV</b>Word, PDF text, LinkedIn export — anything readable.</div>
      <div class="step ${step > 1 ? 'done' : ''}"><b>2 · Copy prompt → AI chat</b>It structures the facts; it must not invent any.</div>
      <div class="step ${parsed?.ok ? 'done' : ''}"><b>3 · Paste the JSON back</b>Validated here before it is saved.</div>
    </div>
    <${Field} label="Your CV, as plain text" hint="Include every role and bullet. This text goes into the copied AI prompt; remove contact details or confidential information you do not want to share."><textarea value=${cvText} onInput=${e => setCvText(e.target.value)} style="min-height:200px" placeholder="Paste the full text of your current CV…"></textarea><//>
    <${Field} label="Anything to add? (optional)" hint="Target titles and locations, roles to emphasise, facts missing from the CV."><textarea value=${notes} onInput=${e => setNotes(e.target.value)} style="min-height:60px" placeholder="e.g. Targeting Delivery Manager / Head of Delivery roles in Dubai and Abu Dhabi."></textarea><//>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" disabled=${cvText.length < 200} onClick=${async () => { (await copyText(prompt)) ? toast('Prompt copied — paste it into your AI chat') : toast('Copy failed', 'bad'); setStep(2); }}>Copy prompt</button>
      <button class="btn" disabled=${cvText.length < 200} onClick=${() => download('cv_import_prompt.md', prompt, 'text/markdown')}>Download prompt</button></div>
    <${Field} label="AI response"><textarea class="mono" value=${pasted} onInput=${e => setPasted(e.target.value)} style="min-height:160px" placeholder='{"schema_version": 2, …}'></textarea><//>
    ${parsed && !parsed.ok ? html`<${Note} kind="bad">${parsed.error}<//>` : null}
    ${parsed?.ok ? html`<div><button class="btn primary" onClick=${() => onResult(parsed.value)}>Check and preview</button></div>` : null}
  </div></div>`;
}
