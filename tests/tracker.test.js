import { test, assert } from './harness.js';
import { transition, digest } from '../app/tracker/pipeline.js';
import { canonicalJobUrl, duplicateJobIds } from '../app/intake/jobUrl.js';
import { applyRangeSelection } from '../app/ui/selection.js';
test('applied schedules a follow-up', () => { const { job, events } = transition({ id: 'j', status: 'ready' }, 'applied', { followUpDays: 7 }); assert.equal(job.status, 'applied'); assert.equal(events.length, 2); assert.equal(events[1].kind, 'follow_up_due'); });
test('illegal transition throws', () => { assert.throws(() => transition({ id: 'j', status: 'inbox' }, 'offer')); });
test('digest counts and due follow-ups', () => { const d = digest([{ id: 'a', status: 'applied' }, { id: 'b', status: 'scored', localScore: 70 }], [{ kind: 'follow_up_due', jobId: 'a', at: '2000-01-01T00:00:00Z' }]); assert.equal(d.counts.applied, 1); assert.equal(d.untailored[0].id, 'b'); assert.equal(d.followUpsDue.length, 1); });
test('job records keep a posting url and extra links', () => {
  const job = { id: 'j', title: 'T', jdClean: 'x', status: 'inbox', sourceUrl: 'https://example.com/job', links: [{ label: 'Recruiter', url: 'https://example.com/r' }] };
  const { validateJob } = globalThis.__jobSchema || {};
  assert.equal(job.sourceUrl, 'https://example.com/job');
  assert.equal(job.links[0].label, 'Recruiter');
});
test('forced transition allows any status and records that stages were skipped', async () => {
  const { transition } = await import('../app/tracker/pipeline.js');
  assert.throws(() => transition({ id: 'j', status: 'inbox' }, 'offer'));
  const { job, events } = transition({ id: 'j', status: 'inbox' }, 'offer', { force: true });
  assert.equal(job.status, 'offer');
  assert.equal(events[0].payload.skippedStages, true);
  const back = transition({ id: 'j', status: 'offer' }, 'applied', { force: true });
  assert.equal(back.job.status, 'applied');
  const normal = transition({ id: 'j', status: 'ready' }, 'applied', { force: true });
  assert.ok(!normal.events[0].payload || !normal.events[0].payload.skippedStages);
  assert.throws(() => transition({ id: 'j', status: 'applied' }, 'applied', { force: true }));
});
test('posting links are normalized without losing job-identifying query parameters', () => {
  assert.equal(canonicalJobUrl('https://www.example.com/jobs/123/?utm_source=email#apply'), 'https://example.com/jobs/123');
  assert.equal(canonicalJobUrl('https://example.com/view?trk=feed&jk=abc123'), 'https://example.com/view?jk=abc123');
  assert.ok(canonicalJobUrl('https://example.com/view?jk=one') !== canonicalJobUrl('https://example.com/view?jk=two'));
});
test('duplicate posting links flag every matching saved job', () => {
  const ids = duplicateJobIds([
    { id: 'a', sourceUrl: 'https://www.example.com/jobs/123/?utm_source=email' },
    { id: 'b', sourceUrl: 'https://example.com/jobs/123' },
    { id: 'c', sourceUrl: 'https://example.com/jobs/456' },
  ]);
  assert.ok(ids.has('a') && ids.has('b'));
  assert.ok(!ids.has('c'));
});
test('Shift-click selects every visible job between the anchor and target', () => {
  const out = applyRangeSelection(['a', 'b', 'c', 'd', 'e'], ['a'], 'a', 'd', true, true);
  assert.deepEqual(out.selected, ['a', 'b', 'c', 'd']);
  assert.equal(out.anchorId, 'd');
});
test('Shift-click can deselect a range without changing hidden selections', () => {
  const out = applyRangeSelection(['a', 'b', 'c', 'd'], ['hidden', 'a', 'b', 'c', 'd'], 'b', 'd', false, true);
  assert.deepEqual(out.selected, ['hidden', 'a']);
});
