# Current implementation and release state

Updated 10 October 2026. Source: **0.21.0**. Last verified frontend: **0.19.0**.

## Search controls (0.21.0)

Search now, a 1–20 match limit and up to three extra daily Dubai times are implemented. Membership-checked preferences/queue RPCs and admin-only claim/finish functions are deployed. The original 09:00 automation remains active, and a new five-minute heartbeat checks requests/due schedules. Both follow SEARCH-RUNNER.md. No genuine on-demand research has yet been triggered by the owner through the new UI. Frontend deployment is still pending.

Transactional database checks passed authorization, range validation, revision conflicts, request deduplication, exclusive claims, lease validation and exact request retries; changes were rolled back. New Node tests passed request/batch validation and API error handling. Browser verification was blocked by an unavailable browser security check; no bypass attempted.

## Compact swipe layout (0.20.5)

Settings menu groups Master CV, app settings and sign-out. Mobile navigation occupies one row. Discover uses the dynamic viewport height, keeps action buttons visible and scrolls long content inside the card. Search/sync history is collapsed. This UI change is packaged; live/mobile visual verification remains pending.

## Completed

- Supabase validated publishing API and isolated jobpilot storage deployed.
- Scheduled search active at 09:00 Asia/Dubai; future searches exclude Accenture and Halian.
- First researched delivery confirmed: 3 added, 0 skipped; owner saw all three on the live v0.19 site.
- Private exclusion inventory includes 54 existing app entries including archived jobs. It is not in Git.
- Private member gate, authenticated review feed and optimistic-concurrency decision RPCs deployed. Database tests covered authorization, idempotent writes, stale revisions and undo in a rolled-back transaction.
- Source adds password login, mobile swipe cards, Selected and Archived views, status projection, undo and 30-second cross-device refresh.
- Right selects; left archives. Projection preserves existing tailored/applied work and manually archived records. No tailoring starts from import/swipe.
- Public source excludes owner membership seed, credentials, CVs, search history and connection files.

## Verification

The Node harness reports 137/137 and the cloud/review/status/exclusion Node suite reports 25/25. Some historical harness cases require a browser and return early under Node; a Node pass does not establish browser/IndexedDB visual acceptance. Runtime packaging checks syntax, imports, offline paths and ZIP integrity.

## Remaining release acceptance

1. Deploy the supplied v0.21.0 runtime ZIP to the existing jobpilotgcc site (or explicitly connect this repo to that site).
2. Owner signs in with their existing confirmed account/password. Email links are disabled pending redirect configuration and a real email-flow test.
3. Verify mobile gestures, buttons, undo, desktop Selected/Archived statuses and cross-device refresh; verify existing CVs and pipeline records remain intact.
4. Queue a search from Job searches, confirm the chosen limit and result receipt/history; verify saved extra times on another device.
5. Record the production version and evidence here only after those checks pass.

Browser automation could read the existing site, but returned blank screenshots for the auth dashboard and did not complete the deployment file-picker action. No frontend v0.20 deployment is claimed. Do not clear browser data to troubleshoot.

## Scope limits

Daily cloud recommendations populate the swipe deck. Local manually entered jobs are not uploaded to that deck. Selected/Archived decisions sync; CVs, provider keys, tailoring and later application statuses remain local. The local Codex research schedule is not a hosted scheduler. Exclusion inventory updates for manually added jobs currently require an operator refresh.

See README.md for commands and architecture, DAILY-INBOX.md for publishing, and DECISIONS.md for historical reasoning.
