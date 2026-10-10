/** Zero-dependency test harness. Works in the browser (run.html) and in Node (node-run.mjs). */
export const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }
export const assert = {
  ok: (v, m = 'expected truthy') => { if (!v) throw new Error(m); },
  equal: (a, b, m) => { if (a !== b) throw new Error(m || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
  deepEqual: (a, b, m) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(m || `deepEqual failed:\n${x}\n!==\n${y}`); },
  throws: (fn, m = 'expected to throw') => { let t = false; try { fn(); } catch { t = true; } if (!t) throw new Error(m); },
  includes: (arr, v, m) => { if (!arr.includes(v)) throw new Error(m || `expected ${JSON.stringify(arr)} to include ${JSON.stringify(v)}`); },
};
export async function run() {
  const results = [];
  for (const t of tests) { try { await t.fn(); results.push({ name: t.name, ok: true }); } catch (e) { results.push({ name: t.name, ok: false, error: e.message }); } }
  return results;
}
