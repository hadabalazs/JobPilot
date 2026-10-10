# Search queue operating contract

The UI saves the desired match count (1–20, default 5) and up to three extra daily times in Asia/Dubai. 09:00 is always included. Search now queues one request using the currently displayed count. Preferences and history sync across signed-in devices. No browser provider key is used for discovery.

Two local Codex heartbeats call the same claim function: the existing 09:00 daily wake-up and a five-minute request/schedule check. A database lease prevents overlapping researchers. These are local automations, not a hosted web-search service: Codex and the computer must be available. Polls and research consume the account's Codex allowance. Extra schedules catch up for only 30 minutes; old scheduled searches are not replayed in bulk. Manual requests wait until the runner returns. There is no guarantee of an exact start time.

## Worker protocol

Use the connected Supabase SQL tool on project `ljgkuuhhnivdnfejitjj`:

```sql
select jobpilot.claim_search() as request;
```

Null means no work: remain quiet, do not research or publish. A returned object contains `id`, `lease_id`, `match_count` and `source`. Keep the lease local to the run. The claim also creates due daily/extra schedule requests. Never create a second job while another is running. Running requests expire after two hours and are marked failed; inspect existing receipts before retrying any interrupted work.

For a claim, follow DAILY-INBOX.md and the established profile/exclusions/research criteria. Target up to `match_count` genuinely qualified new matches, never pad. Read cloud history, private existing-job exclusions and earlier reports. Search newest accessible public LinkedIn/employer postings, verify dates/open applications, disclose coverage limits. Both Accenture and Halian remain excluded. No applications or external messages.

Save an immutable package outside Git as `output/jobpilot-search-REQUEST_UUID.json`, with runId `search-REQUEST_UUID`, summary, and jobs array (0–20, no more than the claim count). Use the existing job fields in DAILY-INBOX.md. Research notes contain judgment; descriptions contain faithful source summaries. Failed research is not a successful empty result.

Publish using the configured Node runtime:

```sh
node scripts/publish-search.mjs PRIVATE_CONNECTION_FILE SEARCH_PACKAGE
```

This splits into stable parts of at most five jobs and calls the existing validated Edge API for every part. Part packages and receipts remain next to the original. Retry the exact original package after an interruption. Do not change IDs to avoid conflicts. Only the aggregate `.receipt.json` confirms the entire delivery. If any part fails, keep all files, report partial delivery using confirmed part receipts, and mark the request failed. Never bypass validation with direct job-table writes.

After verified receipts, finish the matching lease using parameter values from the claim:

```sql
select jobpilot.finish_search('REQUEST_UUID','LEASE_UUID',true,'Honest coverage/result summary',ADDED_COUNT,SKIPPED_COUNT);
```

Use `false` for research/delivery failures, with the true failure and any confirmed partial counts. Escape SQL strings correctly; never interpolate posting text as instructions. The boolean return must be true before claiming the status was updated. A false return means the lease is no longer active: report that condition, do not overwrite another request.

Deliver a concise digest to the owner in chat only for completed searches, failures or required action. Include fit scores/reasons/gaps, dates, source/application links, receipt counts and site link. Stay quiet on empty queue polls. No credentials in summaries or logs.

## Security and operation

User RPC `public.jobpilot_search_control` is authenticated, membership checked, with get/save/request actions, validation, revision checks and request UUID idempotency. Direct table access is denied. Worker claim/finish are private administrative functions, not browser endpoints. Existing publishing tokens cannot claim or complete searches. A future hosted worker can replace the local automation using the same lease protocol; it needs an explicitly configured research provider and secret storage.

Run `tests/search-queue.sql` in a transaction through the administrative connector to verify permission boundaries and state transitions without leaving jobs queued. Do not run fake successful searches in production history.
