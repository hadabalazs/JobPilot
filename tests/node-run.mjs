// node tests/node-run.mjs  — runs the same tests without a browser
import { run } from './harness.js';
for (const n of ['schemas','parse','guardrails','prompt','slice','localScore','fitScore','render','tracker','providers','pdfDoc','backfill','ats','improve','enhance','readiness','bulk','jobImport']) await import(`./${n}.test.js`);
const res = await run();
for (const r of res) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '\n      ' + r.error));
const pass = res.filter(r => r.ok).length;
console.log(`\n${pass} / ${res.length} passed`);
process.exit(pass === res.length ? 0 : 1);
