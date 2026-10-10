/** Small id helpers. ulid(): time-sortable 26-char id. slug(): filename/id-safe lowercase. */
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function ulid(now = Date.now()) {
  let t = now, time = '';
  for (let i = 0; i < 10; i++) { time = B32[t % 32] + time; t = Math.floor(t / 32); }
  let rand = '';
  const bytes = new Uint8Array(16);
  (globalThis.crypto || { getRandomValues: a => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
  for (let i = 0; i < 16; i++) rand += B32[bytes[i] % 32];
  return time + rand;
}
export function slug(s, max = 40) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, max) || 'x';
}
export function nowIso() { return new Date().toISOString(); }
