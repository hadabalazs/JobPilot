# Decision history

Current architecture and deployment status are in README.md and STATE.md. Older dated entries below describe the design at that time, not necessarily the current release.

## 2026-10-10: discovery and review sync

Use the existing isolated Supabase schema and scoped publishing API. Authenticated membership gates the swipe feed. Persist decisions with revision checks; map right to Selected and left to Archived without overwriting later application progress. Keep CVs and provider secrets local. Email links remain disabled until the exact redirect is configured and tested. Ship a runtime allowlist, never the repository root.

# DECISIONS.md (append-only)

- 2026-09-03 · v1 plan (Python backend, Claude Code) superseded by v2: client-side PWA on Netlify, built via free claude.ai chat, multi-provider AI layer.
- 2026-09-03 · Preact + htm vendored (no CDN at runtime) with an importmap; chosen over vanilla DOM for React-like components without a build step.
- 2026-09-03 · PDF = print stylesheet + browser "Save as PDF". Real text, ATS-safe, zero dependencies. DOCX deferred to next session.
- 2026-09-03 · Guardrails are deterministic code, not prompt instructions: unknown id / new number / forbidden claim = hard fail (export blocked); new proper noun / low summary overlap = warning (one-click confirm).
- 2026-09-03 · No URL fetching in-browser (CORS + ToS). Intake is paste or the bookmarklet, which only reads the page the user is viewing.
- 2026-09-03 · Local score = weighted keyword coverage (55) + competency breadth (15) + title (15) + location (10) + industry (5) − penalties. Triage only.
- 2026-09-03 · Sentence-initial capitalised words are ignored by the proper-noun check; the remainder of a sentence-initial phrase is still checked.
- 2026-09-03 · Anthropic adapter sends `anthropic-dangerous-direct-browser-access: true` (verified against community reports; docs to be re-checked when implementing structured outputs).
- 2026-09-03 · Added an in-app CV-text → cv_master builder so deployment does not require hand-writing JSON. Same manual paste loop, strict copy-facts-only prompt, validated before save.
- 2026-09-03 · Added Core42 Compass preset after checking GCC providers: it is the only self-serve GCC option with public per-token pricing. Base URL is a best guess pending a live account; Humain is enterprise-first, Bedrock ME needs SigV4 (no browser-only path).
- 2026-09-03 · Tested migration against the real CvCustomizator cv_master.json (v2.0 loose shape). Five structural mismatches found and fixed; regression tests added for each.
- 2026-09-03 · Local score rebalanced after the real CV exposed a flaw: alias/skill terms are drawn from the CV itself so they always match, giving 100% coverage on every JD including irrelevant ones. JD-native phrases now carry the weight.
- 2026-09-03 · Side projects migrate into `experience` with `kind:'side_project'` so ids, metrics, guardrails and rendering work unchanged rather than needing a parallel code path.
- 2026-09-03 · Diff is word-level LCS, then coalesced so a changed passage renders as one struck run followed by one green run. changeRatio counts raw word tokens, not coalesced blocks, or it over-reports.
- 2026-09-03 · Highlight lives in print.css under @media screen only; the PDF must never carry shading. Preview passes highlightIds; renderCvHtml takes an opts arg so the default render is unchanged.
- 2026-09-03 · UI copy says "AI", not "Claude" — the app is provider-agnostic and the manual loop works with any chat.
- 2026-09-03 · Job links: one primary `sourceUrl` (what the bookmarklet captures, what the header and inbox link to) plus a free `links[]` array for everything else. Kept separate so the posting link stays unambiguous.
- 2026-09-04 · Why-notes live inside the rendered CV HTML (a .why span under the bullet) rather than as a side panel, so the explanation sits next to the text it explains. Hidden in @media print like the highlight.
- 2026-09-04 · Run progress is stage-based rather than a percentage of real work: the network wait is one opaque await, so the bar advances to a fixed point during 'sending' and the elapsed counter carries the honesty.
- 2026-09-04 · Guardrail hard failures are overridable but never silently: two-step confirm, recorded on the run as `overridden`/`overriddenAt`, and the failure list stays on screen afterwards. The guard is advice about traceability, not proof of falsehood — the user knows facts the master CV does not contain.
- 2026-09-04 · Bulk API runs are sequential, not parallel: it keeps the cost cap check meaningful between jobs, avoids rate limits, and makes cancel behave sensibly. Batch manual results are matched by echoed job_id with positional fallback only when the array length matches exactly.
- 2026-09-04 · Auto-tailor gates on the deterministic local score before spending anything: the keyword pre-filter is free and already runs on add, so weak matches never reach the API. Default threshold 50, off by default.
- 2026-09-04 · Board drag-and-drop forces the transition rather than validating it: the pipeline order is a suggestion, and real job searches skip stages (a referral jumps straight to interviewing). The skip is recorded on the event instead of being blocked.
- 2026-09-04 · HTML5 DnD has no touch support, so every card also carries a status <select> — hidden until hover on pointer devices, always visible on touch.
- 2026-09-04 · Inbox select-all selects only the filtered rows, and bulk move acts on the current selection — filter first, then act, so a bulk move can never touch a job you cannot see.
- 2026-09-04 · One-click PDF uses jsPDF text layout, not html2canvas: canvas-rendered PDFs aren't real extractable text and would break ATS parsing, which the whole render pipeline is built to avoid. jsPDF trades pixel-perfect fidelity with the HTML/print version for genuine vector text.
- 2026-09-04 · job.bestRunId (not 'latest run') drives the download button: an overridden or passing run stays the exportable one even if a later run fails guardrails, so a bad re-run never silently disables a good existing download.
- 2026-09-04 · bestRunId backfill added after confirming the actual bug: Preview never depended on the field so it kept working, while Inbox (new in the same release as bestRunId) exposed that pre-existing job records had never had it set. Root-caused via a seeded pre-migration job + full page reload, not guessed.
- 2026-09-04 · isProviderReady is a configuration heuristic (model + key present), not a live API health check — verifying connectivity would mean a network call just to decide whether to show a button. Good enough to gate the UI; the run itself still surfaces real auth/network errors if the key turns out to be bad.
- 2026-09-04 · Bulk tailor entry point (Inbox bulk bar) only opens BulkRun when a provider is ready, so its manual-batch-prompt branch is effectively unreachable from this entry — left in place since BulkRun is written to support both and may get a second entry point later.

## 2026-09-10 · ATS optimisation (v0.14.0)

Research basis (2026 sources on Workday / Greenhouse / Lever / Taleo / iCIMS):
- Matching is largely literal or lightly stemmed — the posting's exact phrase beats a synonym. "project management" ≠ "managed projects" to most parsers.
- Requirements/Qualifications lines carry the highest-weight terms; perks and About-us text carry almost none. Hence `sectionWeights` drives extraction weight.
- Placement matters: terms inside dated experience entries carry more weight than a standalone skills list. Encoded as the placement multiplier in `atsAudit`.
- 2–3 mentions across different sections is optimal; heavy repetition in one place is a stuffing signal. Hidden/white text is actively flagged as fraud by Workday, Greenhouse and Lever — never implemented, and the guardrails would block it anyway.
- Single column, standard headings, contact in the body (not header/footer), consistent "Mon YYYY" dates, text-selectable PDF. Our jsPDF renderer already emitted vector text; section order and headings were changed to match.
- ML-ranked systems weight quantified outcomes well above duty statements, which reinforces the existing rule never to drop a source number.

Decisions:
- ATS rules are layered *under* the fabrication rules in the prompt and explicitly subordinate to them. Keyword coverage is never worth an unsupportable claim — `skills_selected` is guardrail-checked against the master CV for exactly this reason.
- The ATS score counts only keywords the master CV can support. Scoring against terms the user genuinely lacks (PMP, Azure DevOps) produced a misleading "weak 44" for a CV that was in fact well tailored; splitting fixable misses from genuine gaps made the number actionable and honest.
- Stuffing detection excludes single common words of type title/phrase — "program" and "manager" recurring in a programme-management CV is normal prose, not stuffing.
- tailor_v1 is left in place untouched (runs reference it by `promptVersion`); v2 is the new default.
