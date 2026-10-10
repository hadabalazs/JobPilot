import { test, assert } from './harness.js';
import { loadCV, GOOD_RESULT } from './fixtures/load.js';
import { buildRenderModel } from '../app/render/cvModel.js';
import { renderCvHtml } from '../app/render/cvHtml.js';
test('render model applies selection, rewrites and omissions', async () => {
  const cv = await loadCV(); const m = buildRenderModel(cv, GOOD_RESULT('j'));
  assert.ok(!m.experience.some(e => e.id === 'exp_consult')); assert.equal(m.experience[0].bullets[0].id, 'b_bank_01');
  assert.ok(m.experience[0].bullets[0].text.startsWith('Own end-to-end')); assert.equal(m.experience[0].bullets[1].id, 'b_bank_03');
  assert.equal(m.skills[0].label, 'Agile & Delivery'); assert.equal(m.summary, cv.summary_variants[0].text);
});
test('html contains every selected bullet and escapes', async () => {
  const cv = await loadCV(); cv.experience[0].bullets[0].text = 'A & B <C>'; const g = GOOD_RESULT('j'); g.rewrites = [];
  const html = renderCvHtml(buildRenderModel(cv, g), '');
  assert.ok(html.includes('A &amp; B &lt;C&gt;')); assert.ok(html.includes(cv.experience[1].bullets[0].text)); assert.ok(!html.includes('Strategy Consulting'));
});
test('downloadable CV HTML has no JobPilot or source-posting footer', async () => {
  const cv = await loadCV();
  const html = renderCvHtml(buildRenderModel(cv, GOOD_RESULT('j')), '');
  assert.ok(!/JobPilot|netlify\.app|Date posted|sourceUrl/i.test(html));
});
test('cover letter renders when included', async () => {
  const cv = await loadCV(); const g = GOOD_RESULT('j'); g.cover_letter = { subject: 'Re: Delivery Manager', body_paragraphs: ['P1', 'P2'], tone: 'direct' };
  const html = renderCvHtml(buildRenderModel(cv, g, { includeCover: true, jobMeta: { company: 'Falcon' } }), '');
  assert.ok(html.includes('class="cover"')); assert.ok(html.includes('Re: Delivery Manager')); assert.ok(html.includes('Falcon'));
});
test('change set reports rewrites, dropped bullets and omitted roles', async () => {
  const cv = await loadCV(); const { buildChangeSet, diffWords } = await import('../app/render/diff.js');
  const cs = buildChangeSet(cv, GOOD_RESULT('j'));
  assert.equal(cs.rewrites.length, 1); assert.equal(cs.rewrites[0].bulletId, 'b_bank_01');
  assert.ok(cs.rewrites[0].ratio > 0 && cs.rewrites[0].ratio < 1);
  assert.equal(cs.omittedRoles[0].id, 'exp_consult');
  assert.ok(cs.dropped.some(d => d.bulletId === 'b_retail_03'));
  assert.ok(cs.rewrittenIds.has('b_bank_01'));
  const d = diffWords('a b c', 'a x c');
  assert.deepEqual(d.filter(t => t.type === 'added').map(t => t.text), ['x']);
  assert.deepEqual(d.filter(t => t.type === 'removed').map(t => t.text), ['b']);
});
test('highlight marks only rewritten bullets and never survives print', async () => {
  const cv = await loadCV(); const { buildChangeSet } = await import('../app/render/diff.js');
  const r = GOOD_RESULT('j'); const cs = buildChangeSet(cv, r);
  const on = renderCvHtml(buildRenderModel(cv, r), '', { highlightIds: cs.rewrittenIds });
  const off = renderCvHtml(buildRenderModel(cv, r), '', {});
  assert.equal((on.match(/class="tailored"/g) || []).length, 1);
  assert.equal((off.match(/class="tailored"/g) || []).length, 0);
});
test('why-notes render beside bullets on screen and are hidden in print', async () => {
  const cv = await loadCV(); const { buildChangeSet } = await import('../app/render/diff.js');
  const r = GOOD_RESULT('j'); const cs = buildChangeSet(cv, r);
  assert.ok(cs.notes.b_bank_01.includes('end-to-end delivery'));
  assert.ok(/\d+% new wording/.test(cs.notes.b_bank_01));
  const withNotes = renderCvHtml(buildRenderModel(cv, r), '', { highlightIds: cs.rewrittenIds, notes: cs.notes });
  const without = renderCvHtml(buildRenderModel(cv, r), '', { highlightIds: cs.rewrittenIds });
  assert.equal((withNotes.match(/class="why"/g) || []).length, 1);
  assert.equal((without.match(/class="why"/g) || []).length, 0);
  // read print.css in whichever runtime we're in — Node has no fetch for file URLs,
  // the browser has no node:fs
  const css = typeof window !== 'undefined'
    ? await (await fetch(new URL('../app/render/print.css', import.meta.url))).text()
    : await (await import('node:fs/promises')).readFile(new URL('../app/render/print.css', import.meta.url), 'utf8');
  assert.ok(/@media print[^}]*\{[\s\S]*\.why \{ display: none/.test(css));
});
test('shortReason skips the reason when it just repeats the keywords', async () => {
  const { shortReason } = await import('../app/render/diff.js');
  const a = shortReason({ keywords: ['release management'], reason: "mirrors JD phrase 'release management'", ratio: 0.2 });
  assert.ok(!a.includes('mirrors'));
  const b = shortReason({ keywords: [], reason: 'surfaces the mentoring requirement', ratio: 0.1 });
  assert.ok(b.includes('surfaces the mentoring requirement'));
});
