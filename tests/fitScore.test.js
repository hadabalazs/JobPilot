import { test, assert } from './harness.js';
import { loadCV, GOOD_RESULT, JD_DELIVERY, JD_DATA } from './fixtures/load.js';
import { localScore } from '../app/matching/localScore.js';
import { evaluate } from '../app/guardrails/report.js';
import { calibratedFitScore, fitBand, FIT_SCORE_VERSION } from '../app/matching/fitScore.js';

const scored = async (job, mutate = () => {}) => {
  const cv = await loadCV(), result = GOOD_RESULT(job.id || 'fit-test'); mutate(result);
  job.localBreakdown = localScore(job, cv);
  return { cv, result, score: calibratedFitScore({ job, cv, result, report: evaluate(result, cv, {}) }) };
};

test('role fit exposes a transparent 30/40/20/10 breakdown', async () => {
  const { score } = await scored({ id: 'x', title: 'Delivery Manager', location: 'Dubai', jdClean: JD_DELIVERY });
  assert.equal(score.version, FIT_SCORE_VERSION);
  assert.equal(Object.values(score.components).reduce((a, b) => a + b, 0), score.rawScore);
  assert.ok(score.score >= 0 && score.score <= 100);
  assert.equal(score.band, fitBand(score.score));
  assert.equal(score.modelOpinion, 78);
  assert.ok(score.inputs.coveragePct > 0);
});

test('a generous model opinion can move the evidence score by at most ten points', async () => {
  const job = { id: 'x', title: 'Delivery Manager', location: 'Dubai', jdClean: JD_DELIVERY };
  const low = await scored(job, r => { r.fit.score = 0; r.fit.verdict = 'poor'; });
  const high = await scored(job, r => { r.fit.score = 100; r.fit.verdict = 'strong'; });
  assert.ok(high.score.rawScore - low.score.rawScore <= 10);
  assert.equal(high.score.components.modelOpinion, 10);
});

test('missing must-haves cap role fit while draft failures do not change it', async () => {
  const job = { id: 'x', title: 'Delivery Manager', location: 'Dubai', jdClean: JD_DELIVERY };
  const one = await scored(job, r => { r.fit.score = 100; r.fit.missing_requirements = [{ requirement: 'Required licence', severity: 'must' }]; });
  assert.ok(one.score.score <= 74); assert.ok(one.score.caps.some(c => /must-have/.test(c.reason)));
  const clean = await scored(job, r => { r.fit.score = 100; });
  const hard = await scored(job, r => { r.fit.score = 100; r.rewrites[0].text = 'Delivered 999 unsupported projects.'; });
  assert.equal(hard.score.score, clean.score.score);
  assert.ok(!hard.score.caps.some(c => /could not support/.test(c.reason)));
});

test('unrelated roles stay poor even if the model claims 90', async () => {
  const job = { id: 'x', title: 'Senior Data Engineer', location: 'Doha', jdClean: JD_DATA };
  const { score } = await scored(job, r => {
    r.fit.score = 90; r.fit.verdict = 'strong'; r.fit.matched_requirements = [];
    r.fit.missing_requirements = [{ requirement: 'Python', severity: 'must' }, { requirement: 'Arabic', severity: 'must' }];
  });
  assert.ok(score.score < 30, `expected unrelated role below 30, got ${score.score}`);
  assert.equal(score.band, 'poor');
});

test('Browser: saved runs use calibrated score and old runs migrate without API calls', async () => {
  if (typeof indexedDB === 'undefined') return;
  const store = await import('../app/ui/store.js');
  const cv = await loadCV(), now = new Date().toISOString(), id = 'fit-migrate-' + Date.now();
  const job = { id, title: 'Delivery Manager', company: 'Example', location: 'Dubai', jdClean: JD_DELIVERY, status: 'scored', archived: 0, createdAt: now, updatedAt: now };
  const result = GOOD_RESULT(id), report = evaluate(result, cv, {}), runId = id + '-run';
  await store.db.put('jobs', { ...job, localScore: 80, localBreakdown: localScore(job, cv), aiScore: 90, verdict: 'strong' });
  await store.db.put('tailorRuns', { id: runId, jobId: id, createdAt: now, provider: 'Old model', result, report });
  try {
    const changed = await store.recalibrateFitScores({ cv });
    const savedJob = await store.loadJob(id), savedRun = await store.db.get('tailorRuns', runId);
    assert.ok(changed >= 1); assert.equal(savedJob.fitScore, savedRun.fitScore.score);
    assert.equal(savedJob.modelScore, 78); assert.ok(savedJob.fitScore !== 90);
    assert.equal(savedRun.fitScore.version, FIT_SCORE_VERSION);
  } finally { await store.db.del('jobs', id); await store.db.del('tailorRuns', runId); }
});
