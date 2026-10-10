// Dependency injected so the same authorization and intake code is tested in Node.
export function createHandler({ rpc, canonicalJobUrl, prepareJobImport, cryptoImpl = crypto }) {
  const digest = async s => [...new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2,'0')).join('');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': 'https://jobpilotgcc.netlify.app',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' };
  const reply = (data, status = 200) => new Response(JSON.stringify(data), {status, headers});
  return async req => {
    if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
    if (!['GET','POST'].includes(req.method)) return reply({error:'Method not allowed'},405);
    const token = (req.headers.get('authorization') || '').match(/^Bearer (jp_[A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) return reply({error:'Connect JobPilot with a valid inbox key.'},401);
    try {
      const scope = await rpc('jobpilot_authorize', {p_hash:await digest(token)});
      if (!scope) return reply({error:'Inbox key is invalid or revoked.'},401);
      if (req.method === 'GET') {
        const after = new URL(req.url).searchParams.get('after') || '0';
        if (!/^\d{1,18}$/.test(after)) return reply({error:'Invalid cursor'},400);
        return reply(await rpc('jobpilot_feed',{p_after:after}));
      }
      if (scope !== 'write') return reply({error:'This key cannot import jobs.'},403);
      if (!req.headers.get('content-type')?.startsWith('application/json')) return reply({error:'Expected JSON'},415);
      // Cap the stream as well as Content-Length, including chunked requests.
      const reader = req.body?.getReader(); let size = 0; const chunks = [];
      if (!reader) return reply({error:'Missing request body'},400);
      for (;;) { const {done,value} = await reader.read(); if (done) break; size += value.length;
        if (size > 400000) { await reader.cancel(); return reply({error:'Batch too large'},413); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c,offset); offset += c.length; }
      let body; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({error:'Invalid JSON'},400); }
      if (!body || !/^[a-zA-Z0-9_.:-]{1,120}$/.test(body.runId || '') || !Array.isArray(body.jobs) || body.jobs.length > 5
        || typeof body.summary !== 'string' || body.summary.length > 4000) return reply({error:'Expected runId, summary and up to five jobs'},400);
      let jobs = [];
      if (body.jobs.length) {
        const p = prepareJobImport({jobs:body.jobs});
        if (p.invalid) return reply({error:'Invalid jobs', details:p.rows.filter(r=>r.errors.length).map(r=>({index:r.index,errors:r.errors}))},400);
        jobs = p.rows.map(r => ({job_key:canonicalJobUrl(r.input.sourceUrl),
          role_key:[r.input.company,r.input.title,r.input.location].map(s=>s.toLowerCase().replace(/\s+/g,' ').trim()).join('|'),
          payload:{...r.input, description:r.input.raw}}));
      }
      const hash = await digest(JSON.stringify({runId:body.runId, summary:body.summary, jobs}));
      return reply(await rpc('jobpilot_import',{p_run_id:body.runId,p_hash:hash,p_summary:body.summary,p_jobs:jobs}));
    } catch (e) {
      if (e.code === '23505') return reply({error:'Run ID already used with different content'},409);
      console.error('JobPilot request failed', e.code || 'upstream');
      return reply({error:'JobPilot service is unavailable. Retry this batch later.'},503);
    }
  };
}
