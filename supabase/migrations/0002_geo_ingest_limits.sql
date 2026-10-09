create table if not exists public.geo_ingest_runs (
  id bigint generated always as identity primary key,
  city_slug text not null,
  started_at timestamptz not null default now()
);

alter table public.geo_ingest_runs enable row level security;

revoke all on public.geo_ingest_runs from anon, authenticated;
grant select, insert, delete on public.geo_ingest_runs to service_role;
grant usage, select on sequence public.geo_ingest_runs_id_seq to service_role;

create or replace function public.reserve_geo_ingest(p_city_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if p_city_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'INVALID_CITY_SLUG' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('gymgo-geo-ingest-limits')::bigint);
  delete from public.geo_ingest_runs where started_at < v_now - interval '24 hours';

  if exists (
    select 1 from public.geo_ingest_runs
    where city_slug = p_city_slug and started_at >= v_now - interval '24 hours'
  ) then
    raise exception 'CITY_INGEST_LIMIT' using errcode = 'P0001';
  end if;

  if (select count(*) from public.geo_ingest_runs where started_at >= v_now - interval '1 hour') >= 5 then
    raise exception 'GLOBAL_INGEST_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.geo_ingest_runs (city_slug, started_at) values (p_city_slug, v_now);
end;
$$;

revoke all on function public.reserve_geo_ingest(text) from public, anon, authenticated;
grant execute on function public.reserve_geo_ingest(text) to service_role;
