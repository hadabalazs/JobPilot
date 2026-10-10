import { test, assert } from './harness.js';
import { loadCV, JD_DELIVERY, JD_DATA } from './fixtures/load.js';
import { localScore, bandFor } from '../app/matching/localScore.js';
import { extractKeywords } from '../app/matching/keywords.js';
import { cleanJD, extractMeta } from '../app/intake/clean.js';
test('delivery JD scores strong/good, data JD with deal-breaker scores poor', async () => {
  const cv = await loadCV();
  const a = localScore({ title: 'Delivery Manager – Digital Banking', location: 'Dubai', jdClean: cleanJD(JD_DELIVERY) }, cv);
  const b = localScore({ title: 'Senior Data Engineer', location: 'Doha', jdClean: cleanJD(JD_DATA) }, cv);
  assert.ok(a.score >= 65, `delivery ${a.score}`); assert.ok(b.score < 30, `data ${b.score}`);
  assert.ok(a.score > b.score); assert.equal(b.dealBreakers.length, 1); assert.equal(bandFor(a.score) === 'poor', false);
});
test('scoring is deterministic', async () => { const cv = await loadCV(); const j = { title: 'x', jdClean: cleanJD(JD_DELIVERY) }; assert.equal(localScore(j, cv).score, localScore(j, cv).score); });
test('keywords weight requirements section higher and hit competency aliases', async () => {
  const cv = await loadCV(); const { terms, competencyHits } = extractKeywords(cleanJD(JD_DELIVERY), cv);
  assert.ok(competencyHits.c_agile_scaling > 0); assert.ok(competencyHits.c_vendor > 0);
  assert.ok(terms.some(t => t.term === 'release management' && t.source === 'alias'));
});
test('extractMeta finds title, company, location', () => { const m = extractMeta(JD_DELIVERY); assert.equal(m.title, 'Delivery Manager'); assert.equal(m.company, 'Falcon Bank'); assert.ok(/Dubai/.test(m.location)); });
