# Instructions for contributors and coding agents

Read README.md and STATE.md first. They distinguish source readiness from production deployment. This is a static ES-module Preact/htm app with Supabase discovery/decision sync; do not replace its architecture without a concrete need.

- Keep user CVs, provider keys, backups, scoped API tokens, auth sessions, job history and private connection files out of Git and deployment artifacts. Never print credentials.
- The shared SwarmData project hosts other apps. Change only JobPilot-owned schema/functions and narrow app configuration. Never reset shared authentication or alter unrelated data.
- Preserve IndexedDB IDs, saved CVs, application progress and versioned prompt contracts. Imports and swipes never start tailoring or apply for a job.
- Right swipe maps to Selected; left swipe maps to Archived. Only acknowledged decisions may be shown as synced. Preserve conflict handling, safe retries and protection of later pipeline statuses.
- Discovery excludes Accenture and Halian. Consult the operator's private existing-job history plus cloud history before publishing. Never pad results or fabricate posting dates.
- No npm runtime dependencies are needed. Do not add a framework/bundler just for a small UI change.
- Run `npm test`, then `node scripts/build.mjs <fresh-output-directory>`. For UI/auth changes, also perform browser/mobile acceptance checks and report if they are blocked.
- Update APP_VERSION and the service-worker CACHE_NAME together; list every new runtime asset in SHELL. Ship only the build allowlist.
- Read current SQL and remote migration history before adding a migration. Do not replay setup snapshots or use direct table writes to bypass publishing validation.
- Keep README, STATE and DAILY-INBOX accurate. Never claim a release is live merely because a ZIP or Git commit exists.

Operator-private files live outside this repository. Ask for their paths when working in a new environment; do not search unrelated directories for credentials. The repository's publishable Supabase key is public configuration, not an authorization secret.
