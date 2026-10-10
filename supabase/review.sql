-- Personal JobPilot membership is separate from every other SwarmData account.
create table jobpilot.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Repository copy omits the production owner's membership seed for privacy.
-- Provision the authorized, email-confirmed auth.users.id separately; see README.
create table jobpilot.decisions (
  user_id uuid not null references jobpilot.members(user_id) on delete cascade,
  job_id bigint not null references jobpilot.jobs(id) on delete cascade,
  decision text not null check (decision in ('keep','pass','unseen')),
  revision integer not null default 1 check (revision > 0),
  mutation_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
create index decisions_job_id_idx on jobpilot.decisions(job_id);
alter table jobpilot.members enable row level security;
alter table jobpilot.decisions enable row level security;
revoke all on jobpilot.members, jobpilot.decisions from public, anon, authenticated;

-- Only private, narrowly scoped functions may read these tables.
create function jobpilot.review_feed(p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null or not exists(select 1 from jobpilot.members where user_id=v_user) then
    raise insufficient_privilege using message = 'JobPilot account access required';
  end if;
  if p_after < 0 then raise invalid_parameter_value using message='Invalid cursor'; end if;
  select jsonb_build_object('jobs', coalesce(jsonb_agg(row_data order by id),'[]'::jsonb)) into v_result
  from (select j.id, jsonb_build_object('id',j.id::text,'job',j.payload,'runId',j.run_id,
      'decision',coalesce(d.decision,'unseen'),'revision',coalesce(d.revision,0),'updatedAt',d.updated_at) row_data
    from jobpilot.jobs j left join jobpilot.decisions d on d.job_id=j.id and d.user_id=v_user
    where j.id > p_after order by j.id limit 100) rows;
  return v_result || jsonb_build_object('latestRun',(select jsonb_build_object('runId',run_id,'summary',summary,'completedAt',completed_at)
    from jobpilot.runs order by completed_at desc limit 1));
end $$;

create function jobpilot.decide(p_job_id bigint, p_decision text, p_revision integer, p_mutation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_old jobpilot.decisions; v_next jobpilot.decisions;
begin
  if v_user is null or not exists(select 1 from jobpilot.members where user_id=v_user) then
    raise insufficient_privilege using message = 'JobPilot account access required';
  end if;
  if p_decision is null or p_decision not in ('keep','pass','unseen') or p_revision is null or p_revision < 0 or p_mutation_id is null then
    raise invalid_parameter_value using message='Invalid decision';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':' || p_job_id::text,0));
  select * into v_old from jobpilot.decisions where user_id=v_user and job_id=p_job_id;
  if v_old.mutation_id = p_mutation_id and v_old.decision = p_decision then
    v_next := v_old;
  else
    if coalesce(v_old.revision,0) <> p_revision then
      raise serialization_failure using message='Decision changed on another device; refresh before trying again';
    end if;
    insert into jobpilot.decisions(user_id,job_id,decision,revision,mutation_id)
    values(v_user,p_job_id,p_decision,p_revision+1,p_mutation_id)
    on conflict(user_id,job_id) do update set decision=excluded.decision, revision=excluded.revision,
      mutation_id=excluded.mutation_id, updated_at=now()
    returning * into v_next;
  end if;
  return jsonb_build_object('id',v_next.job_id::text,'decision',v_next.decision,'revision',v_next.revision,'updatedAt',v_next.updated_at);
end $$;

-- Public wrappers are invoker-only. Data tables remain inaccessible through REST.
create function public.jobpilot_review_feed(p_after bigint default 0) returns jsonb
language sql security invoker set search_path='' as $$ select jobpilot.review_feed(p_after) $$;
create function public.jobpilot_decide(p_job_id bigint,p_decision text,p_revision integer,p_mutation_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select jobpilot.decide(p_job_id,p_decision,p_revision,p_mutation_id) $$;
revoke all on function jobpilot.review_feed(bigint), jobpilot.decide(bigint,text,integer,uuid),
 public.jobpilot_review_feed(bigint), public.jobpilot_decide(bigint,text,integer,uuid) from public,anon,authenticated;
grant usage on schema jobpilot to authenticated;
grant execute on function jobpilot.review_feed(bigint),jobpilot.decide(bigint,text,integer,uuid),
 public.jobpilot_review_feed(bigint),public.jobpilot_decide(bigint,text,integer,uuid) to authenticated;
