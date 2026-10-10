# JobPilot daily inbox

Live frontend: https://jobpilotgcc.netlify.app/

Backend: Supabase project `ljgkuuhhnivdnfejitjj` (SwarmData), isolated `jobpilot` schema. Do not alter unrelated SwarmData tables, users or application settings. The authenticated review interface uses narrowly scoped public.jobpilot_* wrappers and shared Supabase Auth with separate JobPilot membership.

The `jobpilot-inbox` Edge Function accepts GET for paginated recommendations and POST for batches of up to five jobs. Each request requires a scoped bearer key. The browser gets a read-only key; the publisher gets a write key. Only SHA-256 hashes of these randomly generated keys are stored in the database. Revoke a key by setting `jobpilot.api_tokens.revoked_at`. No project-wide service key is distributed to clients. RLS is enabled with no public policies, and only service_role may call the three server RPCs. The function implements custom authentication, so its platform JWT check is intentionally disabled.

## Daily operation

Exclude both **Accenture and Halian** going forward. Read the private `jobpilot-existing-jobs.json` beside the connection file before researching: it records 54 existing entries including archived jobs, earlier report links and excluded employers. Check cloud jobs as well. Do not publish previously included roles or assume an anonymous recruiter advert is a different vacancy. Refresh the private inventory when local manual additions change; it is not automatically synchronized. Keep it out of GitHub.

The publisher requires this history file and rejects matched jobs before network writes. Its shape is `{jobs:[{title,company,location,sourceUrl,links}],previousReportLinks:[url],excludedCompanies:[name]}`. A connection can override its location with `exclusionsPath`. The connection schema is `{endpoint,writeKey,readKey?,exclusionsPath?}`; never print token values.


The existing daily Codex task runs at 09:00 Asia/Dubai. It researches public LinkedIn postings, verifies availability, ranks up to five strong matches, writes a jobs package, and runs `scripts/publish-shortlist.mjs`. It remains a local desktop scheduled task: the computer and app must be running. This release removes the browser dependency for publishing; it does not move research execution into the cloud.

Private configuration is in the workspace `.private/jobpilot-connection.json`. Never print it, attach it to a message, or include it in a deployment. `.private/jobpilot-device-connection.json` contains only the scoped read connection and may be selected in JobPilot on the owner's devices. Treat that file as private too. Never share the writer file with the website.

Publisher invocation:

```text
NODE_RUNTIME scripts/publish-shortlist.mjs PRIVATE_CONNECTION_FILE DAILY_PACKAGE_FILE
```

Use the Node 24 runtime configured in the scheduled task. Pass absolute paths from that task. Network sandbox denial requires the normal approval flow; do not bypass it.

Package shape: `{runId, summary, jobs:[{title,company,location,sourceUrl,description,postingAgeText,postedAt,sourcedAt,notes,links:[{label,url}]}]}`. Description must be at least 80 characters of sourced content or a clearly identified faithful summary. Do not invent job requirements or dates. Scores, ids, CV fields and application statuses are discarded by intake. Put researched fit scores, rank, reasons and gaps in notes. The local app independently scores against the user's CV.

Use `daily-YYYY-MM-DD` in Dubai time as the run ID. Retries must use exactly the same package: the API returns the original receipt for the same payload and rejects changes to a used ID. Transient errors retry up to three times. The receipt is saved alongside the package only after success. A genuinely completed search with no matches may send an empty jobs array. Never record a failed search as successful. Canonical posting URLs and normalized company/title/location prevent duplicate jobs across runs.

## App behavior

The last confirmed deployed frontend is v0.19: connect each device using the scoped reader file, then automatic additive import runs on open, visible five-minute intervals and focus/reconnection. The owner confirmed the first three researched jobs were visible on 10 October 2026.

The v0.20.4 release candidate replaces this screen with authenticated Discover/Selected/Archived views. After deployment, sign in with the existing member account. Daily cloud jobs import without tailoring; right swipe maps to Selected and left swipe to Archived. Decisions are acknowledged by the server, then projected to local statuses; other devices refresh every 30 seconds while visible and on focus/reconnection. Stale revisions cannot overwrite newer decisions. Existing tailored/applied progress and manual archives are protected from rollback. CVs and later application statuses still remain local. Only daily cloud recommendations enter the deck; local manual jobs do not upload automatically. Email-link login is disabled until its redirect is verified. Check STATE.md before describing this candidate as live.

## Deployment and checks

The static Netlify ZIP includes only the frontend runtime. Supabase code, publisher scripts, credentials and documentation are excluded. Update APP_VERSION and the service-worker cache name together before packaging. The original source copy in the earlier chat remains untouched; continued development should use this folder.

Run `npm test` and `node scripts/build.mjs OUTPUT_DIRECTORY`. Live endpoint checks: `node scripts/check-inbox.mjs PRIVATE_CONNECTION_FILE`. The backend migration is in `supabase/migrations/202610100001_jobpilot_inbox.sql`. Function dependencies jobImport.js and jobUrl.js must match the corresponding app/intake files when deploying.
