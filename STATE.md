# Current implementation and release state

Updated 10 October 2026. Source: **0.20.4**. Last verified frontend: **0.19.0**.

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

The Node harness reports 137/137 and the cloud/review/status/exclusion Node suite reports 22/22. Some historical harness cases require a browser and return early under Node; a Node pass does not establish browser/IndexedDB visual acceptance. Runtime packaging checks syntax, imports, offline paths and ZIP integrity.

## Remaining release acceptance

1. Deploy the supplied v0.20.4 runtime ZIP to the existing jobpilotgcc site (or explicitly connect this repo to that site).
2. Owner signs in with their existing confirmed account/password. Email links are disabled pending redirect configuration and a real email-flow test.
3. Verify mobile gestures, buttons, undo, desktop Selected/Archived statuses and cross-device refresh; verify existing CVs and pipeline records remain intact.
4. Record the production version and evidence here only after those checks pass.

Browser automation could read the existing site, but returned blank screenshots for the auth dashboard and did not complete the deployment file-picker action. No frontend v0.20 deployment is claimed. Do not clear browser data to troubleshoot.

## Scope limits

Daily cloud recommendations populate the swipe deck. Local manually entered jobs are not uploaded to that deck. Selected/Archived decisions sync; CVs, provider keys, tailoring and later application statuses remain local. The local Codex research schedule is not a hosted scheduler. Exclusion inventory updates for manually added jobs currently require an operator refresh.

See README.md for commands and architecture, DAILY-INBOX.md for publishing, and DECISIONS.md for historical reasoning.
