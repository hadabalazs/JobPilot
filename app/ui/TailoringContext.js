/** User-entered factual context for tailoring. It never changes rendered CV content by itself. */
import { useState } from 'preact/hooks';
import { html, Field, Note, toast } from './components.js';
import { saveCV, rescoreAll } from './store.js';

export function TailoringContext({ cv, refresh }) {
  const current = cv.tailoring_context || {};
  const [certifications, setCertifications] = useState((current.certifications || []).join('\n'));
  const [context, setContext] = useState(current.professional_context || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const next = structuredClone(cv);
      next.tailoring_context = {
        certifications: [...new Set(certifications.split('\n').map(x => x.trim()).filter(Boolean))],
        professional_context: context.trim(),
      };
      await saveCV(next); await rescoreAll(next); await refresh(); toast('Tailoring context saved for future runs');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return html`<details class="panel" style="margin:16px 0"><summary class="body"><b>Tailoring context</b> <span class="muted small">Extra facts for AI; not shown in your CV automatically</span></summary><div class="body stack">
    <${Note}>Use this for facts you personally confirm: additional certifications, specialisms, project scope, industries, work authorisation, languages, and career context. It does not rewrite your CV, add bullets, or appear in an exported CV by itself. It gives Tailor & enhance more accurate source material to work from.<//>
    <${Field} label="Certifications, courses or qualifications" hint="One per line. Add only completed or genuinely held credentials."><textarea value=${certifications} onInput=${e => setCertifications(e.target.value)} style="min-height:90px" placeholder="PRINCE2 Practitioner&#10;ICAgile Certified Professional" /><//>
    <${Field} label="Additional professional context" hint="Facts not clearly captured in your CV: domain exposure, project scale, leadership scope, relevant tools, languages, work authorisation, or career preferences. Do not paste a job description."><textarea value=${context} onInput=${e => setContext(e.target.value)} style="min-height:130px" placeholder="I have delivered mobile banking onboarding programmes in regulated environments and can work in the UAE without sponsorship." /><//>
    <div><button class="btn primary" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save tailoring context'}</button></div>
  </div></details>`;
}
