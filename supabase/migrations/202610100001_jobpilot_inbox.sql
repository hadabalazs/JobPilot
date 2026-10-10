create schema if not exists jobpilot;
revoke all on schema jobpilot from public, anon, authenticated;

create table jobpilot.api_tokens (
  token_hash text primary key check(length(token_hash) = 64),
  scope text not null check(scope in ('read', 'write')),
  label text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table jobpilot.runs (
  run_id text primary key,
  payload_hash text not null,
  completed_at timestamptz not null default now(),
  summary text not null,
  added integer not null default 0,
  skipped integer not null default 0
);
create table jobpilot.jobs (
  id bigint generated always as identity primary key,
  job_key text not null unique,
  role_key text not null unique,
  payload jsonb not null,
  run_id text not null references jobpilot.runs(run_id),
  created_at timestamptz not null default now()
);
alter table jobpilot.api_tokens enable row level security;
alter table jobpilot.runs enable row level security;
alter table jobpilot.jobs enable row level security;

-- These RPCs are callable only by the Edge Function's server credential.
-- Browsers never receive that credential. Tables are not in the public API schema.
create function public.jobpilot_authorize(p_hash text) returns text
language sql stable security definer set search_path = '' as $$
  select scope from jobpilot.api_tokens where token_hash = p_hash and revoked_at is null;
$$;

create function public.jobpilot_import(p_run_id text, p_hash text, p_summary text, p_jobs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old_run jobpilot.runs; item jsonb; inserted integer; total_added integer := 0; total_skipped integer := 0;
begin
  if length(p_run_id) not between 1 and 120 or length(p_hash) <> 64
    or jsonb_typeof(p_jobs) <> 'array' or jsonb_array_length(p_jobs) > 5
    or length(p_summary) > 4000 then raise exception 'Invalid batch'; end if;
  perform pg_advisory_xact_lock(hashtextextended('jobpilot-import', 0));
  select * into old_run from jobpilot.runs where run_id = p_run_id;
  if found then
    if old_run.payload_hash <> p_hash then raise exception 'Run ID already used with different content' using errcode = '23505'; end if;
    return jsonb_build_object('runId', p_run_id, 'added', old_run.added, 'skipped', old_run.skipped, 'replayed', true);
  end if;
  insert into jobpilot.runs(run_id, payload_hash, summary) values(p_run_id, p_hash, p_summary);
  for item in select value from jsonb_array_elements(p_jobs) loop
    if length(item->>'job_key') < 1 or length(item->>'role_key') < 1
      or jsonb_typeof(item->'payload') <> 'object' then raise exception 'Invalid job'; end if;
    insert into jobpilot.jobs(job_key, role_key, payload, run_id)
      values(item->>'job_key', item->>'role_key', item->'payload', p_run_id)
      on conflict do nothing;
    get diagnostics inserted = row_count;
    total_added := total_added + inserted;
    total_skipped := total_skipped + (1 - inserted);
  end loop;
  update jobpilot.runs set added = total_added, skipped = total_skipped where run_id = p_run_id;
  return jsonb_build_object('runId', p_run_id, 'added', total_added, 'skipped', total_skipped, 'replayed', false);
end;
$$;

create function public.jobpilot_feed(p_after bigint default 0) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', id::text, 'job', payload, 'runId', run_id) order by id)
      from (select * from jobpilot.jobs where id > greatest(p_after,0) order by id limit 100) page), '[]'::jsonb),
    'latestRun', (select jsonb_build_object('runId', run_id, 'completedAt', completed_at, 'summary', summary, 'added', added, 'skipped', skipped)
      from jobpilot.runs order by completed_at desc, run_id desc limit 1));
$$;

revoke all on function public.jobpilot_authorize(text) from public, anon, authenticated;
revoke all on function public.jobpilot_import(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.jobpilot_feed(bigint) from public, anon, authenticated;
grant execute on function public.jobpilot_authorize(text) to service_role;
grant execute on function public.jobpilot_import(text,text,text,jsonb) to service_role;
grant execute on function public.jobpilot_feed(bigint) to service_role;
