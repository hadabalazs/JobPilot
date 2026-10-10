import { test, assert } from './harness.js';
import { prepareJobImport } from '../app/intake/jobImport.js';
import { canonicalJobUrl } from '../app/intake/jobUrl.js';
import { createJobRecord } from '../app/ui/store.js';
const description = 'Lead cross-functional delivery teams, manage risks and dependencies, facilitate Scrum ceremonies and coordinate digital banking releases.';
const entry = (extra = {}) => ({ title: 'Delivery Manager', company: 'Example', location: 'Dubai', sourceUrl: 'https://ae.linkedin.com/jobs/view/delivery-manager-1234567890', description, notes: 'Good banking match; verify certification requirement.', ...extra });

test('jobs intake accepts researched packages, arrays and jobs-only backups', () => {
  for (const payload of [{ jobs: [entry()] }, [entry()], { stores: { jobs: [entry()], meta: [{ key: 'cvMaster', value: 'do not import' }] } }]) {
    const p = prepareJobImport(JSON.stringify(payload));
    assert.equal(p.ready, 1); assert.equal(p.rows[0].input.raw, description);
    assert.equal(p.rows[0].input.company, 'Example');
  }
});
test('LinkedIn duplicates match locale hosts, slugs and search result links', () => {
  const key = canonicalJobUrl(entry().sourceUrl);
  assert.equal(key, canonicalJobUrl('https://www.linkedin.com/jobs/search-results/?currentJobId=1234567890&trackingId=foo'));
  assert.equal(key, canonicalJobUrl('https://uk.linkedin.com/jobs/view/another-slug-1234567890?trk=search'));
  assert.ok(key !== canonicalJobUrl('https://linkedin.com/jobs/view/1234567891'));
  const p = prepareJobImport({ jobs: [entry(), entry({ sourceUrl: 'https://linkedin.com/jobs/view/1234567890' })] }, [{ sourceUrl: 'https://www.linkedin.com/jobs/search/?currentJobId=1234567890', archived: 1 }]);
  assert.equal(p.ready, 0); assert.equal(p.duplicates, 2);
});
test('repeated package links are skipped without overwriting anything', () => {
  const p = prepareJobImport([entry(), entry({ sourceUrl: 'https://linkedin.com/jobs/view/1234567890' })]);
  assert.equal(p.ready, 1); assert.equal(p.rows[1].duplicate, 'Repeated in this package');
});
test('invalid entries do not hide a later valid duplicate', () => {
  const p = prepareJobImport([entry({ description: 'too short' }), entry()]);
  assert.equal(p.invalid, 1); assert.equal(p.ready, 1);
});
test('jobs intake rejects dangerous URLs, missing descriptions and malformed data', () => {
  const p = prepareJobImport([entry({ sourceUrl: 'javascript:alert(1)' }), entry({ sourceUrl: 'https://user:password@example.com/job' }), entry({ description: '' }), null]);
  assert.equal(p.ready, 0); assert.equal(p.invalid, 4);
  assert.throws(() => prepareJobImport('not JSON'));
  assert.throws(() => prepareJobImport({ stores: { meta: [] } }));
  assert.throws(() => prepareJobImport(Array.from({ length: 201 }, () => entry())));
  assert.throws(() => prepareJobImport(' '.repeat(2_000_001)));
});
test('imported ids, statuses, fabricated scores, credentials and CV fields are discarded', () => {
  const p = prepareJobImport([entry({ id: 'existing-id', status: 'applied', fitScore: 100, localScore: 100, apiKey: 'secret', cvMaster: { fake: true } })]);
  const input = p.rows[0].input;
  for (const field of ['id', 'status', 'fitScore', 'localScore', 'apiKey', 'cvMaster']) assert.equal(input[field], undefined);
  const record = createJobRecord(input, null);
  assert.ok(record.id !== 'existing-id'); assert.equal(record.status, 'inbox'); assert.equal(record.localScore, null);
  assert.equal(record.notes, entry().notes); assert.equal(record.jdRaw, description);
});
test('imported notes, ages and safe extra links survive jobs-only normalization', () => {
  const p = prepareJobImport([entry({ postingAgeText: '1 day ago', sourcedAt: '2026-10-03T12:00:00Z', links: [{ label: 'Company', url: 'https://example.com/careers' }, { label: 'Bad', url: 'data:text/html,bad' }] })]);
  const record = createJobRecord(p.rows[0].input, null);
  assert.equal(record.postingAgeText, '1 day ago'); assert.equal(record.sourcedAt, '2026-10-03T12:00:00Z');
  assert.equal(record.links.length, 1); assert.equal(record.links[0].label, 'Company');
});
