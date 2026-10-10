import { test, assert } from './harness.js';
import { loadCV } from './fixtures/load.js';
import { validateCVMaster, migrateV1toV2, factCounts } from '../app/schemas/cv_master.js';
import { validateTailorResult } from '../app/schemas/tailor.js';
import { canTransition } from '../app/schemas/job.js';
import { GOOD_RESULT } from './fixtures/load.js';

test('sample master CV validates', async () => { const cv = await loadCV(); const v = validateCVMaster(cv); assert.ok(v.ok, v.errors.join('; ')); });
test('duplicate bullet id is rejected', async () => { const cv = await loadCV(); cv.experience[0].bullets[1].id = cv.experience[0].bullets[0].id; assert.ok(!validateCVMaster(cv).ok); });
test('unknown competency on bullet is rejected', async () => { const cv = await loadCV(); cv.experience[0].bullets[0].competencies.push('c_nope'); assert.ok(!validateCVMaster(cv).ok); });
test('v1 loose shape migrates losslessly with stable ids', () => {
  const v1 = { name: 'Test Person', email: 't@x.com', summary: 'Delivery leader.', skills: ['Scrum', 'Jira'], certifications: ['PSM II'],
    experience: [{ company: 'Acme Bank', title: 'PM', start_date: '2020-01', end_date: '2022-01', achievements: ['Did X with 5 teams', { text: 'Did Y', tags: ['Delivery'] }] }, { company: 'Beta', title: 'Lead', start_date: '2018', achievements: ['Z'] }] };
  const v2 = migrateV1toV2(v1);
  assert.ok(validateCVMaster(v2).ok, validateCVMaster(v2).errors.join('; '));
  const c = factCounts(v2);
  assert.equal(c.roles, 2); assert.equal(c.bullets, 3); assert.equal(c.summaries, 1); assert.equal(c.skills, 2); assert.equal(c.certifications, 1);
  assert.equal(v2.experience[0].id, 'exp_acme_bank'); assert.equal(v2.experience[0].bullets[0].id, 'b_acme_bank_01');
  assert.equal(v2.experience[0].bullets[1].competencies[0], 'c_delivery'); assert.equal(v2.competencies[0].label, 'Delivery management');
  assert.equal(v2.identity.full_name, 'Test Person');
});
test('migration is idempotent on v2', async () => { const cv = await loadCV(); assert.deepEqual(migrateV1toV2(cv), cv); });
test('valid tailor result passes structural validation', () => { assert.ok(validateTailorResult(GOOD_RESULT('j1')).ok); });
test('tailor result with bad verdict/score fails', () => { const r = GOOD_RESULT('j1'); r.fit.verdict = 'meh'; r.fit.score = 140; const v = validateTailorResult(r); assert.ok(!v.ok); assert.ok(v.errors.length >= 2); });
test('status transitions', () => { assert.ok(canTransition('scored', 'tailored')); assert.ok(!canTransition('inbox', 'offer')); assert.ok(canTransition('applied', 'interviewing')); });

test('v1 with object summary_variants, tag arrays, string metrics and side_projects migrates', () => {
  const v1 = { name: 'X', headline: 'H', contact: { email: 'a@b.c', location: 'Dubai, UAE' },
    summary_variants: { pm_delivery: 'Delivery text.', agile_senior: 'Agile text.' },
    experience: [{ company: 'Acme Bank', role: 'DM', start: '2024-12', end: 'present', location: 'Dubai',
      bullets: [
        { text: 'Lead 90+ person org.', tags: ['delivery', 'banking', 'made-up-tag'], metrics: ['90+ people'], keep_priority: 'high' },
        { text: 'NEEDS_DETAIL — placeholder.', tags: [], metrics: [], keep_priority: 'high', improvement_note: 'NEEDS_DETAIL' }] }],
    side_projects: [{ name: 'GeoLearn', role: 'Solo developer', url: 'https://example.com', summary: 'Shipped an iOS quiz app with 8 maps.', tags: ['ios', 'app-store'], metrics: ['8 maps'] }],
    skills: { tools: ['Jira'] }, certifications: [{ name: 'PSM I', issuer: 'Scrum.org', date: '2019-04' }] };
  const v2 = migrateV1toV2(v1);
  const v = validateCVMaster(v2); assert.ok(v.ok, v.errors.join('; '));
  assert.equal(v2.summary_variants.length, 2); assert.equal(v2.summary_variants[0].id, 'sum_pm_delivery');
  assert.equal(v2.experience.length, 2); assert.equal(v2.experience[1].id, 'exp_side_geolearn');
  assert.equal(v2.experience[1].kind, 'side_project');
  const b = v2.experience[0].bullets[0];
  assert.includes(b.competencies, 'c_delivery'); assert.includes(b.competencies, 'c_banking');
  assert.includes(b.keywords, 'made-up-tag');            // unmapped tag kept as a keyword
  assert.equal(b.metrics.m_01, '90+ people'); assert.equal(b.strength, 3);
  assert.equal(v2.experience[0].bullets[1].placeholder, true);
  assert.ok(v2.competencies.some(c => c.id === 'c_delivery' && c.aliases.length > 0));
});
