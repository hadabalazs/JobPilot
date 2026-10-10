/** Manual provider: the free path. prepare() → user pastes into claude.ai → ingest() parses the reply. */
import * as tailorV1 from '../prompts/tailor_v2.js';
import { promptFor } from '../prompts/mode.js';
import { extractJSON } from './parse.js';
import { validateTailorResult, normalizeTailorResult, repairTailorShape } from '../schemas/tailor.js';

export function createManualProvider(profile = { id: 'manual', name: 'Manual', kind: 'manual' }) {
  return {
    id: profile.id, name: profile.name, kind: 'manual', pricing: profile.pricing,
    supportsBatch: () => false,
    prepare(req) { const p = promptFor(req); return { promptText: p.render(req), system: null, promptVersion: p.VERSION }; },
    ingest(req, rawText) {
      const p = extractJSON(rawText);
      if (!p.ok) return { ok: false, error: p.error };
      const candidate = Array.isArray(p.value) ? p.value.find(v => v && v.job_id === req.jobId) || (p.value.length === 1 ? p.value[0] : null) : p.value;
      const { value, repairs } = repairTailorShape(candidate, req);
      if (value && typeof value === 'object' && !value.job_id) value.job_id = req.jobId;
      const v = validateTailorResult(value);
      if (value?.job_id && value.job_id !== req.jobId) return { ok: false, error: 'Schema errors: job_id does not match the requested job', value };
      if (!v.ok) return { ok: false, error: 'Schema errors: ' + v.errors.join('; '), value };
      return { ok: true, result: { ...normalizeTailorResult(value), tailoringMode: req.options?.mode === 'enhance' ? 'enhance' : 'tailor' }, shapeRepairs: repairs, truncated: !!p.truncated, usage: null };
    },
    async run() { throw new Error('Manual provider cannot run automatically. Use prepare() and ingest().'); },
  };
}
