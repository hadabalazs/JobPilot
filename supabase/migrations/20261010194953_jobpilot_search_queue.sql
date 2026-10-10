create table jobpilot.search_preferences (
 user_id uuid primary key references jobpilot.members(user_id) on delete cascade,
 match_count integer not null default 5 check(match_count between 1 and 20),
 extra_times text[] not null default '{}', revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create table jobpilot.search_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references jobpilot.members(user_id) on delete cascade,
 match_count integer not null check(match_count between 1 and 20),
 source text not null check(source in ('manual','scheduled')), slot text,
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 lease_id uuid, summary text, added integer, skipped integer,
 unique(user_id,slot)
);
create unique index search_one_active on jobpilot.search_requests(user_id) where status in ('queued','running');
create index search_history on jobpilot.search_requests(user_id,created_at desc);
alter table jobpilot.search_preferences enable row level security;
alter table jobpilot.search_requests enable row level security;
revoke all on jobpilot.search_preferences,jobpilot.search_requests from public,anon,authenticated;

create function jobpilot.search_control(p_action text default 'get', p_count integer default 5, p_times text[] default '{}', p_revision integer default 0, p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); prefs jobpilot.search_preferences; req jobpilot.search_requests;
begin
 if u is null or not exists(select 1 from jobpilot.members where user_id=u) then raise insufficient_privilege using message='JobPilot account access required'; end if;
 if p_action is null or p_action not in ('get','save','request') then raise invalid_parameter_value using message='Invalid search action'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('search:'||u::text,0));
 if p_action in ('save','request') and (p_count is null or p_count not between 1 and 20) then raise invalid_parameter_value using message='Choose 1 to 20 matches'; end if;
 if p_action='save' then
  if p_times is null or cardinality(p_times)>3 or exists(select 1 from unnest(p_times) t where t is null or t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or t='09:00') or cardinality(p_times)<>(select count(distinct t) from unnest(p_times) t) then raise invalid_parameter_value using message='Choose up to three distinct extra times; 09:00 is already included'; end if;
  select * into prefs from jobpilot.search_preferences where user_id=u;
  if p_revision is null or p_revision<>coalesce(prefs.revision,0) then raise serialization_failure using message='Search settings changed on another device. Reload and try again.'; end if;
  insert into jobpilot.search_preferences(user_id,match_count,extra_times,revision) values(u,p_count,p_times,1)
  on conflict(user_id) do update set match_count=excluded.match_count,extra_times=excluded.extra_times,revision=jobpilot.search_preferences.revision+1,updated_at=now();
 elsif p_action='request' then
  if p_request_id is null then raise invalid_parameter_value using message='A request ID is required'; end if;
  select * into req from jobpilot.search_requests where user_id=u and id=p_request_id;
  if req.id is null then
   select * into req from jobpilot.search_requests where user_id=u and status in ('queued','running');
   if req.id is null then
    insert into jobpilot.search_requests(id,user_id,match_count,source) values(p_request_id,u,p_count,'manual') returning * into req;
   end if;
  end if;
 end if;
 select * into prefs from jobpilot.search_preferences where user_id=u;
 return jsonb_build_object('preferences',jsonb_build_object('matchCount',coalesce(prefs.match_count,5),'extraTimes',coalesce(prefs.extra_times,'{}'),'revision',coalesce(prefs.revision,0)),
 'requestId',req.id,'requests',coalesce((select jsonb_agg(to_jsonb(r)-'user_id'-'lease_id' order by r.created_at desc) from (select * from jobpilot.search_requests where user_id=u order by created_at desc limit 10) r),'[]'::jsonb));
end $$;
create function public.jobpilot_search_control(p_action text default 'get',p_count integer default 5,p_times text[] default '{}',p_revision integer default 0,p_request_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select jobpilot.search_control(p_action,p_count,p_times,p_revision,p_request_id) $$;
revoke all on function jobpilot.search_control(text,integer,text[],integer,uuid),public.jobpilot_search_control(text,integer,text[],integer,uuid) from public,anon,authenticated;
grant execute on function jobpilot.search_control(text,integer,text[],integer,uuid),public.jobpilot_search_control(text,integer,text[],integer,uuid) to authenticated;

-- Administrative worker only; never grant these functions to browser roles.
create function jobpilot.claim_search() returns jsonb language plpgsql security definer set search_path='' as $$
declare r jobpilot.search_requests; m record; tm text; due timestamptz; slot_key text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('jobpilot-search-worker',0));
 update jobpilot.search_requests set status='failed',finished_at=now(),summary='Search runner timed out. Check delivery history before requesting another search.' where status='running' and started_at<now()-interval '2 hours';
 for m in select mm.user_id,coalesce(p.match_count,5) n,coalesce(p.extra_times,'{}') times,p.updated_at from jobpilot.members mm left join jobpilot.search_preferences p using(user_id) loop
  foreach tm in array array_prepend('09:00',m.times) loop
   due:=((now() at time zone 'Asia/Dubai')::date+tm::time) at time zone 'Asia/Dubai';
   slot_key:=to_char(due at time zone 'Asia/Dubai','YYYY-MM-DD HH24:MI');
   if due<=now() and due>now()-interval '30 minutes' and (tm='09:00' or m.updated_at<=due) then
    insert into jobpilot.search_requests(user_id,match_count,source,slot) values(m.user_id,m.n,'scheduled',slot_key) on conflict do nothing;
   end if;
  end loop;
 end loop;
 -- One researcher at a time; a second heartbeat must not start another search.
 if exists(select 1 from jobpilot.search_requests where status='running') then return null; end if;
 select * into r from jobpilot.search_requests where status='queued' order by created_at for update skip locked limit 1;
 if r.id is null then return null; end if;
 update jobpilot.search_requests set status='running',started_at=now(),lease_id=gen_random_uuid() where id=r.id returning * into r;
 return to_jsonb(r)-'user_id';
end $$;
create function jobpilot.finish_search(p_id uuid,p_lease uuid,p_success boolean,p_summary text,p_added integer,p_skipped integer) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_success is null or p_summary is null or length(p_summary)>5000 or p_added is null or p_added<0 or p_skipped is null or p_skipped<0 then raise invalid_parameter_value using message='Invalid search outcome'; end if;
 update jobpilot.search_requests set status=case when p_success then 'completed' else 'failed' end,finished_at=now(),summary=p_summary,added=p_added,skipped=p_skipped where id=p_id and lease_id=p_lease and status='running';
 return found;
end $$;
revoke all on function jobpilot.claim_search(),jobpilot.finish_search(uuid,uuid,boolean,text,integer,integer) from public,anon,authenticated;
grant execute on function jobpilot.claim_search(),jobpilot.finish_search(uuid,uuid,boolean,text,integer,integer) to service_role;
