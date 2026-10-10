/* JobPilot service worker. Bump CACHE_NAME on every deploy. App shell is cache-first; everything else network-only. */
const CACHE_NAME = 'jobpilot-v0.20.4-swipe-review';
const SHELL = [
  './app/cloud/reviewStatus.js', './app/ui/reconcileReview.js','vendor/supabase-2.117.3.js', 'app/cloud/account.js', 'app/cloud/review.js', 'app/ui/AuthGate.js', 'app/ui/Discover.js', 'app/ui/useReviewQueue.js', 'app/cloud/client.js', 'app/ui/DailyMatches.js', 'app/ui/AtsReport.js', 'app/ui/JobBrief.js', 'app/ui/CareerEvidence.js', 'app/schemas/careerEvidence.js', 'app/intake/jobUrl.js', 'app/ui/selection.js', 'app/prompts/ats_research_v1.js', 'app/prompts/tailor_v3.js', 'app/prompts/enhance_v2.js', 'app/prompts/batch_v2.js', 'tests/fixtures/cv_master.sample.json','./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'app/styles.css', 'app/main.js', 'app/config.js', 'app/db.js', 'app/ids.js',
  'app/schemas/cv_master.js', 'app/schemas/job.js', 'app/schemas/competency_vocab.js', 'app/schemas/tailor.js', 'app/intake/clean.js', 'app/matching/keywords.js', 'app/matching/ats.js', 'app/matching/localScore.js', 'app/matching/fitScore.js', 'app/slice/cvSlice.js',
  'app/prompts/enhance_v1.js', 'app/prompts/mode.js', 'app/prompts/snippets.js', 'app/prompts/tailor_v1.js', 'app/prompts/tailor_v2.js', 'app/prompts/snippets_ats.js', 'app/prompts/batch_v1.js', 'app/prompts/cv_import_v1.js', 'app/prompts/cv_improve_v1.js', 'app/providers/parse.js', 'app/providers/manual.js', 'app/providers/anthropic.js', 'app/providers/openaiCompatible.js', 'app/providers/registry.js', 'app/providers/cost.js',
  'app/guardrails/traceability.js', 'app/guardrails/claims.js', 'app/guardrails/report.js', 'app/render/cvModel.js', 'app/render/diff.js', 'app/render/pdfDoc.js', 'app/render/cvHtml.js', 'app/render/print.css', 'app/tracker/pipeline.js',
  'app/providers/tailorRun.js', 'app/ui/bulkState.js', 'app/ui/components.js', 'app/ui/store.js', 'app/ui/App.js', 'app/ui/Inbox.js', 'app/ui/BulkRun.js', 'app/ui/JobDetail.js', 'app/ui/MasterCv.js', 'app/ui/Settings.js', 'app/ui/Board.js',
  'app/ui/JobImport.js', 'app/intake/jobImport.js',
  'vendor/jspdf.umd.min.js', 'vendor/preact.module.js', 'vendor/preact-hooks.module.js', 'vendor/htm.module.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // provider API calls: network only
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => { if (res.ok && url.pathname.match(/\.(js|css|html|json|svg|png|webmanifest)$/)) caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone())); return res; })));
});
