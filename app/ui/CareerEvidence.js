import { useState } from 'preact/hooks';
import { html, Field, Note, toast } from './components.js';
import { addCareerEvidence } from '../schemas/careerEvidence.js';
import { loadCV, saveCV, rescoreAll } from './store.js';

export function CareerEvidence({ cv, refresh }) {
  const [roleId, setRoleId] = useState(cv.experience[0]?.id || '');
  const [text, setText] = useState(''), [tools, setTools] = useState(''), [source, setSource] = useState('');
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const next = addCareerEvidence(await loadCV(), { roleId, text, tools, source, confirmed });
      await saveCV(next); setText(''); setTools(''); setSource(''); setConfirmed(false);
      await rescoreAll(next); await refresh(); toast('Verified achievement added. Future API and copied prompts can use it.');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return html`<details class="panel" style="margin:16px 0"><summary class="body"><b>Add verified career evidence</b> <span class="muted small">Projects, outcomes and tools missing from your CV</span></summary><div class="body stack">
    <${Note}>Better source material creates stronger tailoring. Add facts you can defend—not the employer’s wish list. These become part of your Master CV and future prompts. Export a backup first if you want to preserve the previous source.<//>
    <${Field} label="Role where this happened"><select value=${roleId} onChange=${e => { setRoleId(e.target.value); setConfirmed(false); }}>${cv.experience.map(e => html`<option value=${e.id}>${e.title} · ${e.employer}</option>`)}</select><//>
    <${Field} label="Verified achievement" hint="Describe your personal contribution, project, scale, relevant methods and outcome. Include exact metrics, units and timeframe only when verified. Qualitative outcomes are fine."><textarea value=${text} onInput=${e => { setText(e.target.value); setConfirmed(false); }} style="min-height:120px" placeholder="I coordinated [actual work] across [verified scope], resulting in [evidenced outcome]. Replace all placeholders before saving."></textarea><//>
    <${Field} label="Tools you personally used (optional, comma-separated)" hint="These are added as confirmed skills. Do not list tools just because the job asks for them."><input value=${tools} onInput=${e => { setTools(e.target.value); setConfirmed(false); }} placeholder="Jira, Confluence" /><//>
    <${Field} label="Evidence reminder (optional, kept out of tailoring prompts)" hint="A short reference such as ‘Q2 project review’. Do not upload confidential documents or personal information about colleagues."><input value=${source} onInput=${e => setSource(e.target.value)} /><//>
    <label class="checkline"><input type="checkbox" checked=${confirmed} onChange=${e => setConfirmed(e.target.checked)} /> I confirm this happened in the selected role, the scope is accurate, and I used the listed tools.</label>
    <div><button class="btn primary" disabled=${busy || !confirmed || text.trim().length < 20 || !roleId} onClick=${save}>${busy ? 'Saving…' : 'Add verified achievement to Master CV'}</button></div>
  </div></details>`;
}
