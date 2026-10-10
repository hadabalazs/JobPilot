import { test, assert } from './harness.js';
import { loadCV, JD_DELIVERY } from './fixtures/load.js';
import { buildSlice } from '../app/slice/cvSlice.js';
import { render, VERSION } from '../app/prompts/tailor_v1.js';
import { cleanJD } from '../app/intake/clean.js';

test('prompt renders with schema, example, JD and every sliced bullet id exactly once', async () => {
  const cv = await loadCV(); const jd = cleanJD(JD_DELIVERY);
  const { slice, includedBulletIds } = buildSlice(cv, jd);
  const p = render({ jobId: 'JOB1', jdText: jd, jdMeta: { title: 'Delivery Manager', company: 'Falcon Bank' }, slice, localKeywords: ['scrum'], options: { pageTarget: 2 } });
  assert.ok(p.includes('tailor_result_v1')); assert.ok(p.includes('"job_id":"JOB1"')); assert.ok(p.includes('<<<JD')); assert.ok(p.includes('Requirements'));
  for (const id of includedBulletIds) { const n = p.split(`"${id}"`).length - 1; assert.equal(n, 1, `${id} appears ${n} times`); }
  assert.equal(VERSION, 'tailor_v1');
});
test('cover-letter rules only appear when requested', async () => {
  const cv = await loadCV(); const { slice } = buildSlice(cv, JD_DELIVERY);
  const base = { jobId: 'j', jdText: JD_DELIVERY, slice, localKeywords: [] };
  assert.ok(!render({ ...base, options: {} }).includes('Cover letter:'));
  assert.ok(render({ ...base, options: { includeCover: true } }).includes('Cover letter:'));
});
test('cleanJD strips boilerplate and keeps headings', () => { const c = cleanJD(JD_DELIVERY); assert.ok(!/Apply now/.test(c)); assert.ok(!/Show more/.test(c)); assert.ok(/Requirements/.test(c)); });

test('batch prompt covers every job, echoes ids and asks for an array', async () => {
  const cv = await loadCV();
  const { render, VERSION } = await import('../app/prompts/batch_v1.js');
  const { buildSlice } = await import('../app/slice/cvSlice.js');
  const items = [
    { jobId: 'J1', jdText: JD_DELIVERY, jdMeta: { title: 'Delivery Manager', company: 'Falcon' } },
    { jobId: 'J2', jdText: 'Programme Manager\nRequirements\n- Scrum', jdMeta: { title: 'Programme Manager' } },
  ];
  const { slice } = buildSlice(cv, items.map(i => i.jdText).join('\n'));
  const p = render({ items, slice, localKeywords: [], options: { pageTarget: 2 } });
  assert.equal(VERSION, 'batch_v1');
  assert.ok(p.includes('JSON ARRAY with exactly 2 objects'));
  assert.ok(p.includes('job_id="J1"')); assert.ok(p.includes('job_id="J2"'));
  assert.ok(p.includes('Falcon'));
  assert.ok(p.includes('do not let a strong match make a weak one look better'));
});
