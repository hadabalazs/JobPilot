/** Per-run model selection. It never edits the provider stored in Settings. */
import { html } from './components.js';
import { availableRunModels } from './store.js';

export function RunModelPicker({ settings, providerId, modelId, busy, onProviderChange, onModelChange }) {
  const models = availableRunModels(settings, providerId);
  return html`<label class="small muted">AI provider <select value=${providerId} disabled=${busy} onChange=${e => { onProviderChange(e.target.value); onModelChange(''); }}>${settings.providers.map(p => html`<option value=${p.id}>${p.name}${p.model ? ` (${p.model})` : ''}</option>`)}</select></label>
    ${models.length ? html`<label class="small muted">Model <select value=${modelId || (models[0]?.id || '')} disabled=${busy} onChange=${e => onModelChange(e.target.value)}>${models.map(m => html`<option value=${m.id}>${m.label}<//>`)}</select><//>` : null}`;
}
