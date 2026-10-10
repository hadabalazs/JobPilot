import { test, assert } from './harness.js';
import { loadCV, GOOD_RESULT, JD_DELIVERY } from './fixtures/load.js';
import { extractAtsKeywords, atsAudit, renderedZones } from '../app/matching/ats.js';
import { buildRenderModel } from '../app/render/cvModel.js';

test('ATS extraction ranks tools, certs and title terms as critical', () => {
  const ks = extractAtsKeywords(JD_DELIVERY, { jobTitle: 'Delivery Manager' });
  const byTerm = Object.fromEntries(ks.map(k => [k.term, k]));
  assert.ok(ks.length > 5);
  assert.ok(ks.some(k => k.type === 'method'), 'expected a methodology term');
  assert.ok(ks.some(k => k.priority === 'critical'), 'expected at least one critical term');
  assert.ok(byTerm['delivery manager'], 'the posting title should be a keyword');
  assert.equal(byTerm['delivery manager'].type, 'title');
});

test('ATS extraction weights requirements lines above boilerplate', () => {
  const jd = 'About us\nWe are a lovely company with free coffee and table tennis.\n\nRequirements\n- SAFe and Scrum at scale\n- Jira';
  const ks = extractAtsKeywords(jd);
  const safe = ks.find(k => k.term === 'safe');
  const coffee = ks.find(k => k.term === 'coffee');
  assert.ok(safe, 'SAFe should be extracted');
  assert.ok(!coffee || safe.weight > coffee.weight, 'requirement terms must outweigh perks');
});

test('audit reports coverage, placement zones and structure', async () => {
  const cv = await loadCV();
  const model = buildRenderModel(cv, GOOD_RESULT('j'));
  const a = atsAudit(model, JD_DELIVERY, { jobTitle: 'Delivery Manager' });
  assert.ok(a.score >= 0 && a.score <= 100);
  assert.ok(a.keywords.length > 0);
  assert.ok(a.present.length > 0, 'a tailored CV should hit some posting terms');
  for (const k of a.present) assert.ok(k.zones.length > 0, `${k.term} marked present with no zone`);
  assert.equal(a.missing.every(k => !k.present), true);
  assert.ok(a.checks.some(c => c.id === 'single_column' && c.pass));
  assert.ok(a.checks.some(c => c.id === 'dates'));
  assert.equal(a.quantified.total, model.experience.reduce((n, e) => n + e.bullets.length, 0));
});

test('audit flags keyword stuffing rather than rewarding it', async () => {
  const cv = await loadCV();
  const model = buildRenderModel(cv, GOOD_RESULT('j'));
  model.summary = 'scrum scrum scrum scrum scrum scrum';
  model.skills = [{ label: 'Skills', items: ['scrum', 'scrum'] }];
  const a = atsAudit(model, 'Requirements\n- scrum', { jobTitle: 'x' });
  assert.ok(a.stuffed.some(k => k.term === 'scrum'), 'expected scrum flagged as stuffed');
  assert.ok(a.checks.find(c => c.id === 'no_stuffing').pass === false);
});

test('renderedZones separates the weighted zones', async () => {
  const cv = await loadCV();
  const model = buildRenderModel(cv, GOOD_RESULT('j'));
  const z = renderedZones(model);
  assert.ok(z.summary.length > 0);
  assert.ok(z.experience.includes(model.experience[0].bullets[0].text));
  assert.ok(!z.skills.includes(model.experience[0].bullets[0].text), 'zones must not bleed into each other');
});

test('skills_selected is honoured and must be real CV skills', async () => {
  const cv = await loadCV();
  const { evaluate } = await import('../app/guardrails/report.js');
  const realSkill = cv.skills.groups[0].items[0];
  const g = GOOD_RESULT('j');
  g.selection.skills_selected = [realSkill];
  assert.ok(evaluate(g, cv).passed, 'a real skill should pass');
  assert.equal(buildRenderModel(cv, g).skills[0].items[0], realSkill);
  const bad = GOOD_RESULT('j');
  bad.selection.skills_selected = ['Kubernetes Service Mesh'];
  const r = evaluate(bad, cv);
  assert.ok(!r.passed);
  assert.ok(r.hardFailures.some(f => f.includes('Kubernetes Service Mesh')));
});
