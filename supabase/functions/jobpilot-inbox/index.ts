import { createHandler } from './handler.js';
import { canonicalJobUrl } from './jobUrl.js';
import { prepareJobImport } from './jobImport.js';

async function rpc(name: string, payload: unknown) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Server credential missing');
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
    method:'POST', headers:{apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json'},
    body:JSON.stringify(payload), signal:AbortSignal.timeout(15000)
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error('Database request failed'), {code:data.code});
  return data;
}
// Custom scoped, revocable capability keys are checked on EVERY GET and POST.
// verify_jwt=false is intentional: these are not Supabase user-session JWTs.
Deno.serve(createHandler({rpc, canonicalJobUrl, prepareJobImport}));
