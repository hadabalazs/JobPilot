import { test, assert } from './harness.js';
import { loadCV, GOOD_RESULT } from './fixtures/load.js';
import { hasTerm, termCount, extractAtsKeywords, atsAudit, masterEvidence, screeningRequirements, plainCvText } from '../app/matching/ats.js';
import { buildRenderModel } from '../app/render/cvModel.js';
import { cleanJD, jobTextWarnings } from '../app/intake/clean.js';
import { addCareerEvidence } from '../app/schemas/careerEvidence.js';
import { buildSlice } from '../app/slice/cvSlice.js';
import { buildRequest, saveJob, loadJob, saveCV, loadCV as storedCV, db } from '../app/ui/store.js';
import { getProvider } from '../app/providers/registry.js';
import { evaluate } from '../app/guardrails/report.js';

test('ATS matching respects whole terms, technical punctuation and unicode', () => {
  assert.equal(hasTerm('ASAP NoSQL JavaScript', 'SAP'), false);
  assert.equal(hasTerm('ASAP NoSQL JavaScript', 'SQL'), false);
  assert.equal(hasTerm('ASAP NoSQL JavaScript', 'Java'), false);
  assert.ok(hasTerm('Experienced in C++ and C#', 'C++'));
  assert.ok(hasTerm('Cross-functional leadership', 'cross functional'));
  assert.ok(hasTerm('São Paulo', 'São Paulo'));
  assert.equal(termCount('Scrum scrum scrum', 'scrum'), 3);
});
test('ATS terms come from contiguous JD text and title excludes page suffix', () => {
  const ks = extractAtsKeywords('Requirements\nRisk and stakeholder management using Jira.', { jobTitle: 'Project Manager | Acme | LinkedIn' });
  assert.ok(!ks.some(k => k.term === 'risk stakeholder'));
  assert.ok(ks.some(k => k.term === 'project manager' && k.type === 'title'));
  assert.ok(ks.every(k => k.sources.length > 0));
  assert.ok(!ks.some(k => /linkedin/i.test(k.term)));
});
test('Preferred credentials are not automatically critical and ignore terms is reversible', () => {
  const jd = 'Requirements\nJira is required.\nNice to have\nPMP preferred';
  assert.equal(extractAtsKeywords(jd).find(k => k.term === 'pmp').priority, 'normal');
  assert.equal(extractAtsKeywords(jd).find(k => k.term === 'jira').priority, 'critical');
  assert.ok(!extractAtsKeywords(jd, { excludedTerms: ['JIRA'] }).some(k => k.term === 'jira'));
  assert.ok(extractAtsKeywords(jd).some(k => k.term === 'jira'));
});
test('ATS evidence never treats taxonomy, metadata or placeholders as achievements', async () => {
  const cv = await loadCV();
  cv.competencies.push({ id: 'taxonomy', label: 'Kubernetes', aliases: ['Airflow'] });
  cv.experience[0].bullets.push({ id: 'placeholder', text: 'Snowflake', placeholder: true, keywords: ['Python'] });
  const evidence = masterEvidence(cv).map(e => e.text).join(' ');
  for (const x of ['Kubernetes', 'Airflow', 'Snowflake', 'Python']) assert.ok(!hasTerm(evidence, x));
  const a = atsAudit(buildRenderModel(cv, GOOD_RESULT('j')), 'Requirements\nKubernetes Airflow Snowflake', { masterCv: cv });
  assert.ok(a.genuineGaps.some(k => k.term === 'kubernetes'));
  assert.equal(a.keywordScore, 0);
});
test('All missing terms remain in coverage denominator and empty report is not 100%', async () => {
  const cv = await loadCV(), model = buildRenderModel(cv, GOOD_RESULT('j'));
  const a = atsAudit(model, 'Requirements\nScrum\nKubernetes', { masterCv: cv });
  assert.equal(a.keywordScore, 50);
  assert.equal(atsAudit(model, '').keywordScore, null);
});
test('Rendered coverage includes headline and flags unverified added wording', async () => {
  const cv = await loadCV(), model = buildRenderModel(cv, GOOD_RESULT('j'));
  model.identity = { ...model.identity, headline: 'Kubernetes specialist' };
  const a = atsAudit(model, 'Requirements\nKubernetes', { masterCv: cv });
  assert.ok(a.present.some(k => k.term === 'kubernetes' && k.zones.includes('rest')));
  assert.ok(a.unverifiedAdditions.some(k => k.term === 'kubernetes'));
});
test('JD cleanup removes navigation while preserving real eligibility requirements', () => {
  const raw = '2 notifications\nHome\nMy Network\nRequirements\nWork authorization required.\nMust travel 20% and have 5+ years of experience.\nPMP certification preferred.\nReactivate Premium: 50% Off';
  const cleaned = cleanJD(raw);
  assert.ok(!cleaned.includes('notifications')); assert.ok(!cleaned.includes('Premium'));
  assert.ok(cleaned.includes('travel 20%'));
  assert.equal(screeningRequirements(cleaned).length, 3);
  assert.equal(screeningRequirements('Experience leading Scrum Masters.').length, 0);
  assert.ok(jobTextWarnings(raw).length > 0);
});
test('Plain text preview preserves reading order and content, not raw HTML', async () => {
  const cv = await loadCV(), model = buildRenderModel(cv, GOOD_RESULT('j'));
  const text = plainCvText(model);
  assert.ok(text.indexOf('SUMMARY') < text.indexOf('WORK EXPERIENCE'));
  assert.ok(text.includes(model.experience[0].bullets[0].text));
  assert.ok(!text.includes('<div'));
});
test('Verified evidence requires consent, preserves existing facts and avoids duplicates', async () => {
  const cv = await loadCV(), original = JSON.stringify(cv);
  const data = { roleId: cv.experience[0].id, text: 'Coordinated vendor onboarding for 3 teams using Jira.', tools: 'Jira, Airflow', source: 'Private review reference', confirmed: true };
  let rejected = false; try { addCareerEvidence(cv, { ...data, confirmed: false }); } catch { rejected = true; }
  assert.ok(rejected);
  const next = addCareerEvidence(cv, data);
  assert.equal(JSON.stringify(cv), original);
  assert.equal(next.experience[0].bullets.length, cv.experience[0].bullets.length + 1);
  assert.ok(next.skills.groups.flatMap(g => g.items).includes('Airflow'));
  rejected = false; try { addCareerEvidence(next, data); } catch { rejected = true; } assert.ok(rejected);
  const req = buildRequest({ id: 'j', title: 'Vendor manager', jdClean: 'Requirements\nVendor onboarding and Airflow' }, next, { sliceCharBudget: 20000 });
  assert.ok(JSON.stringify(req.slice).includes(data.text));
  assert.ok(!JSON.stringify(req).includes(data.source));
});
test('Relevant untagged older achievements are selected instead of arbitrary order', async () => {
  const cv = await loadCV(), role = cv.experience.at(-1);
  role.bullets = [{ id: 'generic', text: 'Provided internal administration.', strength: 3 }, { id: 'relevant', text: 'Built Python and SQL pipelines using Airflow.', strength: 1 }];
  const result = buildSlice(cv, 'Requirements\nPython SQL Airflow', { recentRoles: 1, olderCap: 1, charBudget: 30000 });
  assert.ok(result.includedBulletIds.includes('relevant'));
  assert.ok(!result.includedBulletIds.includes('generic'));
});
test('Both modes and all adapters receive recruiter context without treating it as evidence', async () => {
  const cv = await loadCV();
  for (const kind of ['manual', 'anthropic', 'openai_compatible']) for (const mode of ['tailor', 'enhance']) {
    const req = buildRequest({ id: 'context', title: 'Delivery', jdClean: 'Requirements\nScrum', applicationContext: 'Recruiter emphasised vendor onboarding' }, cv, { sliceCharBudget: 14000 }, { mode });
    const prepared = getProvider({ kind }).prepare(req);
    assert.ok(prepared.promptText.includes('Recruiter emphasised vendor onboarding'));
    assert.ok(prepared.promptText.includes('not candidate evidence'));
    const system = prepared.system || prepared.promptText;
    assert.ok(system.includes('no universal ATS score'));
    assert.ok(!system.includes('top third of the CV carries the most ranking weight'));
  }
});
test('Forbidden claims in proposed skills are blocked even in enhanced mode', async () => {
  const cv = await loadCV(), result = { ...GOOD_RESULT('j'), tailoringMode: 'enhance' };
  result.selection.skills_selected = ['Fluent Arabic'];
  assert.ok(!evaluate(result, cv, { forbiddenClaims: ['fluent Arabic'] }).passed);
});
test('Browser: evidence and application readiness settings survive database round-trip', async () => {
  if (typeof indexedDB === 'undefined') return;
  const cv = await loadCV();
  const next = addCareerEvidence(cv, { roleId: cv.experience[0].id, text: 'Coordinated vendor onboarding for 3 delivery teams.', confirmed: true });
  const previous = await storedCV();
  await saveCV(next); assert.equal((await storedCV()).experience[0].bullets.length, next.experience[0].bullets.length);
  await db.setMeta('cvMaster', previous);
  const job = { id: 'readiness-roundtrip', createdAt: new Date().toISOString(), jdRaw: 'original', jdClean: 'clean', atsExcludedTerms: ['irrelevant'], applicationChecks: { master: { accuracy: true } }, applicationContext: 'Vendor priority' };
  await saveJob(job); const stored = await loadJob(job.id);
  assert.equal(stored.jdRaw, 'original'); assert.ok(stored.applicationChecks.master.accuracy);
  assert.equal(stored.applicationContext, 'Vendor priority');
  await db.del('jobs', job.id);
});
