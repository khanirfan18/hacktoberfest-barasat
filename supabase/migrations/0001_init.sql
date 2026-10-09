-- GymGo Database Schema Migration: 0001_init.sql
-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 1. PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'owner', 'super_admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Profiles RLS: read own, update own display_name only
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Trigger: create profile on auth.users signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger: block role changes unless caller is service role or internal approve_claim
create or replace function public.check_profile_role_update()
returns trigger as $$
begin
  if old.role is distinct from new.role then
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
       and coalesce(current_setting('app.allow_role_change', true), 'false') <> 'true'
       and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Unauthorized: Profile role cannot be changed directly';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_profile_role_guard on public.profiles;
create trigger trg_profile_role_guard
  before update on public.profiles
  for each row execute function public.check_profile_role_update();

-- 2. CITIES
create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  lat double precision not null,
  lng double precision not null,
  timezone text not null,
  currency text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table public.cities enable row level security;

drop policy if exists "cities_read_all" on public.cities;
create policy "cities_read_all" on public.cities
  for select using (true);

-- 3. GYMS
create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  osm_id text unique,
  website text,
  phone text,
  description text,
  hero_image_url text,
  og_image_url text,
  opening_hours jsonb not null default '{}'::jsonb,
  hours_estimated boolean not null default false,
  capacity_per_hour integer not null default 10,
  price_minor integer null,
  price_currency text,
  price_source text not null default 'none' check (price_source in ('scraped', 'owner', 'estimated', 'none')),
  price_scraped_at timestamptz,
  price_source_url text,
  price_evidence text,
  price_confidence numeric,
  owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'unclaimed' check (status in ('unclaimed', 'claimed')),
  rating_avg numeric not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.gyms enable row level security;

drop policy if exists "gyms_read_all" on public.gyms;
create policy "gyms_read_all" on public.gyms
  for select using (true);

drop policy if exists "gyms_update_owner" on public.gyms;
create policy "gyms_update_owner" on public.gyms
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Trigger: gym update guard (owner cannot modify owner_id, status, osm_id)
create or replace function public.check_gym_update()
returns trigger as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and coalesce(current_setting('app.allow_gym_status_change', true), 'false') <> 'true'
     and coalesce(auth.role(), '') <> 'service_role' then
    if old.owner_id is distinct from new.owner_id then
      raise exception 'Unauthorized: Cannot change gym owner_id';
    end if;
    if old.status is distinct from new.status then
      raise exception 'Unauthorized: Cannot change gym status';
    end if;
    if old.osm_id is distinct from new.osm_id then
      raise exception 'Unauthorized: Cannot change gym osm_id';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_gym_update_guard on public.gyms;
create trigger trg_gym_update_guard
  before update on public.gyms
  for each row execute function public.check_gym_update();

-- 4. EQUIPMENT_TYPES
create table if not exists public.equipment_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  category text not null check (category in ('cardio', 'strength', 'free_weights', 'functional', 'recovery', 'amenity')),
  icon text,
  created_at timestamptz not null default now()
);

alter table public.equipment_types enable row level security;

drop policy if exists "equipment_types_read_all" on public.equipment_types;
create policy "equipment_types_read_all" on public.equipment_types
  for select using (true);

-- 5. GYM_EQUIPMENT
create table if not exists public.gym_equipment (
  gym_id uuid not null references public.gyms(id) on delete cascade,
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  quantity integer not null default 1,
  source text not null default 'seed' check (source in ('owner', 'ai', 'seed')),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (gym_id, equipment_type_id)
);

alter table public.gym_equipment enable row level security;

drop policy if exists "gym_equipment_read_all" on public.gym_equipment;
create policy "gym_equipment_read_all" on public.gym_equipment
  for select using (true);

drop policy if exists "gym_equipment_insert_owner" on public.gym_equipment;
create policy "gym_equipment_insert_owner" on public.gym_equipment
  for insert with check (exists (select 1 from public.gyms where gyms.id = gym_equipment.gym_id and gyms.owner_id = auth.uid()));

drop policy if exists "gym_equipment_update_owner" on public.gym_equipment;
create policy "gym_equipment_update_owner" on public.gym_equipment
  for update using (exists (select 1 from public.gyms where gyms.id = gym_equipment.gym_id and gyms.owner_id = auth.uid()));

drop policy if exists "gym_equipment_delete_owner" on public.gym_equipment;
create policy "gym_equipment_delete_owner" on public.gym_equipment
  for delete using (exists (select 1 from public.gyms where gyms.id = gym_equipment.gym_id and gyms.owner_id = auth.uid()));

-- 6. GYM_IMAGES
create table if not exists public.gym_images (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  url text not null,
  caption text,
  kind text not null default 'gallery' check (kind in ('hero', 'gallery', 'equipment')),
  ai_tags jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.gym_images enable row level security;

drop policy if exists "gym_images_read_all" on public.gym_images;
create policy "gym_images_read_all" on public.gym_images
  for select using (true);

drop policy if exists "gym_images_insert_owner" on public.gym_images;
create policy "gym_images_insert_owner" on public.gym_images
  for insert with check (exists (select 1 from public.gyms where gyms.id = gym_images.gym_id and gyms.owner_id = auth.uid()));

drop policy if exists "gym_images_update_owner" on public.gym_images;
create policy "gym_images_update_owner" on public.gym_images
  for update using (exists (select 1 from public.gyms where gyms.id = gym_images.gym_id and gyms.owner_id = auth.uid()));

drop policy if exists "gym_images_delete_owner" on public.gym_images;
create policy "gym_images_delete_owner" on public.gym_images
  for delete using (exists (select 1 from public.gyms where gyms.id = gym_images.gym_id and gyms.owner_id = auth.uid()));

-- 7. BOOKINGS
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  price_minor integer not null,
  currency text not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'checked_in', 'cancelled')),
  qr_nonce uuid not null default gen_random_uuid(),
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, gym_id, slot_start)
);

alter table public.bookings enable row level security;

-- Bookings RLS: user reads own; gym owner reads their gym's; no client writes
drop policy if exists "bookings_read_user" on public.bookings;
create policy "bookings_read_user" on public.bookings
  for select using (auth.uid() = user_id);

drop policy if exists "bookings_read_owner" on public.bookings;
create policy "bookings_read_owner" on public.bookings
  for select using (exists (select 1 from public.gyms where gyms.id = bookings.gym_id and gyms.owner_id = auth.uid()));

-- 8. SCANS
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  scanned_by uuid not null references public.profiles(id) on delete cascade,
  result text not null check (result in ('ok', 'expired', 'too_early', 'reused', 'wrong_gym', 'invalid', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.scans enable row level security;

-- Scans RLS: owner reads own gym's; no client writes
drop policy if exists "scans_read_owner" on public.scans;
create policy "scans_read_owner" on public.scans
  for select using (exists (select 1 from public.gyms where gyms.id = scans.gym_id and gyms.owner_id = auth.uid()));

-- 9. REVIEWS
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  body text check (char_length(body) <= 600),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (gym_id, user_id)
);

alter table public.reviews enable row level security;

drop policy if exists "reviews_read_all" on public.reviews;
create policy "reviews_read_all" on public.reviews
  for select using (true);

-- Trigger: recalculate rating_avg and rating_count on gym
create or replace function public.recalculate_gym_rating()
returns trigger as $$
declare
  v_gym_id uuid;
  v_avg numeric;
  v_count integer;
begin
  if tg_op = 'DELETE' then
    v_gym_id := old.gym_id;
  else
    v_gym_id := new.gym_id;
  end if;

  select coalesce(round(avg(rating)::numeric, 1), 0), count(*)
  into v_avg, v_count
  from public.reviews
  where gym_id = v_gym_id;

  update public.gyms
  set rating_avg = v_avg, rating_count = v_count
  where id = v_gym_id;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_recalculate_gym_rating on public.reviews;
create trigger trg_recalculate_gym_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recalculate_gym_rating();

-- 10. CLAIM_REQUESTS
create table if not exists public.claim_requests (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_email text not null,
  message text,
  proof_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  ai_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.claim_requests enable row level security;

drop policy if exists "claim_requests_select" on public.claim_requests;
create policy "claim_requests_select" on public.claim_requests
  for select using (
    auth.uid() = user_id or
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'super_admin')
  );

drop policy if exists "claim_requests_insert_user" on public.claim_requests;
create policy "claim_requests_insert_user" on public.claim_requests
  for insert with check (auth.uid() = user_id);

-- 11. AI_CACHE & SCRAPE_LOG (NO policies, service role only)
create table if not exists public.ai_cache (
  key text primary key,
  kind text not null,
  value jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.ai_cache enable row level security;

create table if not exists public.scrape_log (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid references public.gyms(id) on delete cascade,
  url text not null,
  ok boolean not null,
  http_status integer,
  error_class text,
  created_at timestamptz not null default now()
);

alter table public.scrape_log enable row level security;

-- 12. STORAGE BUCKETS & POLICIES
insert into storage.buckets (id, name, public)
values ('gym-images', 'gym-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('claim-proofs', 'claim-proofs', false)
on conflict (id) do nothing;

drop policy if exists "gym_images_public_read" on storage.objects;
create policy "gym_images_public_read" on storage.objects
  for select using (bucket_id = 'gym-images');

drop policy if exists "gym_images_owner_insert" on storage.objects;
create policy "gym_images_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'gym-images' and
    exists (
      select 1 from public.gyms
      where gyms.id::text = split_part(name, '/', 1)
        and gyms.owner_id = auth.uid()
    )
  );

drop policy if exists "gym_images_owner_update" on storage.objects;
create policy "gym_images_owner_update" on storage.objects
  for update using (
    bucket_id = 'gym-images' and
    exists (
      select 1 from public.gyms
      where gyms.id::text = split_part(name, '/', 1)
        and gyms.owner_id = auth.uid()
    )
  );

drop policy if exists "gym_images_owner_delete" on storage.objects;
create policy "gym_images_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'gym-images' and
    exists (
      select 1 from public.gyms
      where gyms.id::text = split_part(name, '/', 1)
        and gyms.owner_id = auth.uid()
    )
  );

drop policy if exists "claim_proofs_select" on storage.objects;
create policy "claim_proofs_select" on storage.objects
  for select using (
    bucket_id = 'claim-proofs' and (
      split_part(name, '/', 1) = auth.uid()::text or
      exists (
        select 1 from public.profiles
        where profiles.id = auth.uid() and profiles.role = 'super_admin'
      )
    )
  );

drop policy if exists "claim_proofs_insert" on storage.objects;
create policy "claim_proofs_insert" on storage.objects
  for insert with check (
    bucket_id = 'claim-proofs' and
    split_part(name, '/', 1) = auth.uid()::text
  );

-- 13. SECURITY DEFINER FUNCTIONS

-- book_slot: auth required; gym claimed; on the hour; inside that weekday's opening hours in city timezone; future; within 7 days; pg_advisory_xact_lock; confirmed+checked_in < capacity; price not null; snapshot price
create or replace function public.book_slot(p_gym uuid, p_start timestamptz)
returns uuid as $$
declare
  v_user_id uuid;
  v_gym record;
  v_tz text;
  v_local_start timestamp;
  v_local_end timestamp;
  v_day_key text;
  v_time_start text;
  v_time_end text;
  v_is_open boolean := false;
  v_interval jsonb;
  v_open_str text;
  v_close_str text;
  v_booked_count int;
  v_booking_id uuid;
begin
  -- 1. auth required
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  -- 2. gym claimed
  select * into v_gym from public.gyms where id = p_gym;
  if not found then
    raise exception 'GYM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_gym.status <> 'claimed' then
    raise exception 'GYM_NOT_CLAIMED' using errcode = 'P0003';
  end if;

  -- 3. price not null
  if v_gym.price_minor is null then
    raise exception 'PRICE_NOT_AVAILABLE' using errcode = 'P0004';
  end if;

  -- 4. on the gym's local hour
  select timezone into v_tz from public.cities where id = v_gym.city_id;
  if v_tz is null then
    v_tz := 'UTC';
  end if;
  v_local_start := p_start at time zone v_tz;
  if date_trunc('hour', v_local_start) <> v_local_start then
    raise exception 'NOT_ON_THE_HOUR' using errcode = 'P0005';
  end if;

  -- 5. future
  if p_start <= now() then
    raise exception 'SLOT_IN_PAST' using errcode = 'P0006';
  end if;

  -- 6. within 7 days
  if p_start > now() + interval '7 days' then
    raise exception 'EXCEEDS_7_DAYS' using errcode = 'P0007';
  end if;

  -- 7. inside opening hours in city timezone
  v_local_end := (p_start + interval '1 hour') at time zone v_tz;

  v_day_key := case extract(isodow from v_local_start)
    when 1 then 'mon'
    when 2 then 'tue'
    when 3 then 'wed'
    when 4 then 'thu'
    when 5 then 'fri'
    when 6 then 'sat'
    when 7 then 'sun'
  end;

  v_time_start := to_char(v_local_start, 'HH24:MI');
  v_time_end := to_char(v_local_end, 'HH24:MI');

  if v_gym.opening_hours is not null and v_gym.opening_hours ? v_day_key then
    for v_interval in select * from jsonb_array_elements(v_gym.opening_hours->v_day_key) loop
      v_open_str := v_interval->>0;
      v_close_str := v_interval->>1;
      if v_time_start >= v_open_str and (v_time_end <= v_close_str or (v_close_str in ('23:59', '24:00', '00:00') and v_time_end = '00:00')) then
        v_is_open := true;
        exit;
      end if;
    end loop;
  end if;

  if not v_is_open then
    raise exception 'OUTSIDE_OPENING_HOURS' using errcode = 'P0008';
  end if;

  -- 8. advisory transaction lock
  perform pg_advisory_xact_lock(hashtext(p_gym::text || p_start::text)::bigint);

  -- 9. confirmed+checked_in count < capacity
  select count(*) into v_booked_count
  from public.bookings
  where gym_id = p_gym
    and slot_start = p_start
    and status in ('confirmed', 'checked_in');

  if v_booked_count >= v_gym.capacity_per_hour then
    raise exception 'SLOT_FULL' using errcode = 'P0009';
  end if;

  -- 10. check already booked
  if exists (
    select 1 from public.bookings
    where gym_id = p_gym
      and user_id = v_user_id
      and slot_start = p_start
      and status in ('confirmed', 'checked_in')
  ) then
    raise exception 'ALREADY_BOOKED' using errcode = 'P0010';
  end if;

  -- 11. insert booking snapshot
  insert into public.bookings (
    gym_id,
    user_id,
    slot_start,
    slot_end,
    price_minor,
    currency,
    status
  ) values (
    p_gym,
    v_user_id,
    p_start,
    p_start + interval '1 hour',
    v_gym.price_minor,
    coalesce(v_gym.price_currency, 'USD'),
    'confirmed'
  ) returning id into v_booking_id;

  return v_booking_id;
end;
$$ language plpgsql security definer set search_path = public;

-- cancel_booking: own, at least 2h before start
create or replace function public.cancel_booking(p_id uuid)
returns boolean as $$
declare
  v_user_id uuid;
  v_booking record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_booking from public.bookings where id = p_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0011';
  end if;

  if v_booking.user_id <> v_user_id then
    raise exception 'UNAUTHORIZED' using errcode = 'P0012';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'CANNOT_CANCEL' using errcode = 'P0013';
  end if;

  if v_booking.slot_start < now() + interval '2 hours' then
    raise exception 'CANCEL_TOO_LATE' using errcode = 'P0014';
  end if;

  update public.bookings
  set status = 'cancelled'
  where id = p_id;

  return true;
end;
$$ language plpgsql security definer set search_path = public;

-- slot_availability: hour, capacity, booked, open (no personal data; anon allowed)
create or replace function public.slot_availability(p_gym uuid, p_day date)
returns table (
  hour integer,
  capacity integer,
  booked integer,
  open boolean
) as $$
declare
  v_gym record;
  v_tz text;
  v_day_local_start timestamp;
  v_day_key text;
  v_h integer;
  v_slot_local_start timestamp;
  v_slot_local_end timestamp;
  v_slot_utc_start timestamptz;
  v_time_start text;
  v_time_end text;
  v_interval jsonb;
  v_open_str text;
  v_close_str text;
  v_is_open boolean;
  v_cnt integer;
begin
  select * into v_gym from public.gyms where id = p_gym;
  if not found then
    return;
  end if;

  select timezone into v_tz from public.cities where id = v_gym.city_id;
  if v_tz is null then
    v_tz := 'UTC';
  end if;

  v_day_local_start := p_day::timestamp;
  v_day_key := case extract(isodow from v_day_local_start)
    when 1 then 'mon'
    when 2 then 'tue'
    when 3 then 'wed'
    when 4 then 'thu'
    when 5 then 'fri'
    when 6 then 'sat'
    when 7 then 'sun'
  end;

  for v_h in 0..23 loop
    v_slot_local_start := v_day_local_start + (v_h || ' hours')::interval;
    v_slot_local_end := v_slot_local_start + interval '1 hour';
    v_slot_utc_start := v_slot_local_start at time zone v_tz;

    v_time_start := to_char(v_slot_local_start, 'HH24:MI');
    v_time_end := to_char(v_slot_local_end, 'HH24:MI');

    v_is_open := false;
    if v_gym.opening_hours is not null and v_gym.opening_hours ? v_day_key then
      for v_interval in select * from jsonb_array_elements(v_gym.opening_hours->v_day_key) loop
        v_open_str := v_interval->>0;
        v_close_str := v_interval->>1;
        if v_time_start >= v_open_str and (v_time_end <= v_close_str or (v_close_str in ('23:59', '24:00', '00:00') and v_time_end = '00:00')) then
          v_is_open := true;
          exit;
        end if;
      end loop;
    end if;

    select count(*)::integer into v_cnt
    from public.bookings
    where gym_id = p_gym
      and slot_start = v_slot_utc_start
      and status in ('confirmed', 'checked_in');

    hour := v_h;
    capacity := v_gym.capacity_per_hour;
    booked := v_cnt;
    open := v_is_open;
    return next;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- check_in_booking: caller must own gym (else wrong_gym); wrong nonce -> invalid; cancelled; already checked_in -> reused; earlier than start - 15min -> too_early; after end -> expired; else checked_in. Writes scans row. Returns result, display_name, slot.
create or replace function public.check_in_booking(
  p_booking uuid,
  p_nonce uuid
)
returns table (
  result text,
  display_name text,
  slot timestamptz
) as $$
declare
  v_caller_id uuid;
  v_booking record;
  v_result text;
  v_name text := null;
  v_slot timestamptz := null;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select b.*, g.owner_id as gym_owner_id, p.display_name as user_display_name
  into v_booking
  from public.bookings b
  join public.gyms g on g.id = b.gym_id
  left join public.profiles p on p.id = b.user_id
  where b.id = p_booking;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0011';
  end if;

  v_slot := v_booking.slot_start;
  v_name := v_booking.user_display_name;

  -- 1. caller must own the gym (else write wrong_gym)
  if v_booking.gym_owner_id is distinct from v_caller_id then
    v_result := 'wrong_gym';
    insert into public.scans (booking_id, gym_id, scanned_by, result)
    values (p_booking, v_booking.gym_id, v_caller_id, v_result);
    return query select v_result, null::text, v_slot;
    return;
  end if;

  -- 2. wrong nonce -> invalid
  if v_booking.qr_nonce <> p_nonce then
    v_result := 'invalid';
    insert into public.scans (booking_id, gym_id, scanned_by, result)
    values (p_booking, v_booking.gym_id, v_caller_id, v_result);
    return query select v_result, null::text, v_slot;
    return;
  end if;

  -- 3. cancelled
  if v_booking.status = 'cancelled' then
    v_result := 'cancelled';
    insert into public.scans (booking_id, gym_id, scanned_by, result)
    values (p_booking, v_booking.gym_id, v_caller_id, v_result);
    return query select v_result, v_name, v_slot;
    return;
  end if;

  -- 4. already checked_in -> reused
  if v_booking.status = 'checked_in' then
    v_result := 'reused';
    insert into public.scans (booking_id, gym_id, scanned_by, result)
    values (p_booking, v_booking.gym_id, v_caller_id, v_result);
    return query select v_result, v_name, v_slot;
    return;
  end if;

  -- 5. earlier than start minus 15 min -> too_early
  if now() < v_booking.slot_start - interval '15 minutes' then
    v_result := 'too_early';
    insert into public.scans (booking_id, gym_id, scanned_by, result)
    values (p_booking, v_booking.gym_id, v_caller_id, v_result);
    return query select v_result, v_name, v_slot;
    return;
  end if;

  -- 6. after end -> expired
  if now() > v_booking.slot_end then
    v_result := 'expired';
    insert into public.scans (booking_id, gym_id, scanned_by, result)
    values (p_booking, v_booking.gym_id, v_caller_id, v_result);
    return query select v_result, v_name, v_slot;
    return;
  end if;

  -- 7. else set checked_in
  update public.bookings
  set status = 'checked_in', checked_in_at = now()
  where id = p_booking;

  v_result := 'ok';
  insert into public.scans (booking_id, gym_id, scanned_by, result)
  values (p_booking, v_booking.gym_id, v_caller_id, v_result);
  return query select v_result, v_name, v_slot;
end;
$$ language plpgsql security definer set search_path = public;

-- submit_review: upsert one per user per gym; verified if checked_in booking exists; triggers recalculate rating
create or replace function public.submit_review(
  p_gym uuid,
  p_rating integer,
  p_body text
)
returns uuid as $$
declare
  v_user_id uuid;
  v_is_verified boolean := false;
  v_review_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING' using errcode = 'P0015';
  end if;

  if p_body is not null and char_length(p_body) > 600 then
    raise exception 'BODY_TOO_LONG' using errcode = 'P0016';
  end if;

  select exists (
    select 1 from public.bookings
    where gym_id = p_gym
      and user_id = v_user_id
      and status = 'checked_in'
  ) into v_is_verified;

  insert into public.reviews (gym_id, user_id, rating, body, verified, created_at)
  values (p_gym, v_user_id, p_rating, p_body, v_is_verified, now())
  on conflict (gym_id, user_id) do update set
    rating = excluded.rating,
    body = excluded.body,
    verified = excluded.verified or reviews.verified,
    created_at = now()
  returning id into v_review_id;

  return v_review_id;
end;
$$ language plpgsql security definer set search_path = public;

-- approve_claim: super_admin only; on approve set gym owner_id/status and profile role owner
create or replace function public.approve_claim(
  p_claim uuid,
  p_approve boolean
)
returns boolean as $$
declare
  v_caller_id uuid;
  v_claim record;
begin
  v_caller_id := auth.uid();
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' and
     (v_caller_id is null or not exists (select 1 from public.profiles where id = v_caller_id and role = 'super_admin')) then
    raise exception 'FORBIDDEN_SUPER_ADMIN_ONLY' using errcode = '42501';
  end if;

  select * into v_claim from public.claim_requests where id = p_claim;
  if not found then
    raise exception 'CLAIM_NOT_FOUND' using errcode = 'P0017';
  end if;

  if v_claim.status <> 'pending' then
    raise exception 'CLAIM_ALREADY_PROCESSED' using errcode = 'P0018';
  end if;

  if p_approve then
    update public.claim_requests
    set status = 'approved', reviewed_by = coalesce(v_caller_id, v_claim.user_id)
    where id = p_claim;

    perform set_config('app.allow_gym_status_change', 'true', true);
    update public.gyms
    set owner_id = v_claim.user_id, status = 'claimed'
    where id = v_claim.gym_id;
    perform set_config('app.allow_gym_status_change', 'false', true);

    perform set_config('app.allow_role_change', 'true', true);
    update public.profiles
    set role = 'owner'
    where id = v_claim.user_id;
    perform set_config('app.allow_role_change', 'false', true);
  else
    update public.claim_requests
    set status = 'rejected', reviewed_by = coalesce(v_caller_id, v_claim.user_id)
    where id = p_claim;
  end if;

  return true;
end;
$$ language plpgsql security definer set search_path = public;

-- 14. REALTIME ENABLEMENT
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table public.bookings;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.scans;
exception
  when duplicate_object then null;
end;
$$;

-- 15. SEED ~40 EQUIPMENT TYPES
insert into public.equipment_types (key, name, category, icon) values
  ('treadmill', 'Treadmill', 'cardio', 'Footprints'),
  ('elliptical', 'Elliptical Trainer', 'cardio', 'Activity'),
  ('rower', 'Rowing Machine', 'cardio', 'Waves'),
  ('assault_bike', 'Assault AirBike', 'cardio', 'Bike'),
  ('spin_bike', 'Spin Bike', 'cardio', 'Bike'),
  ('stair_climber', 'Stair Climber', 'cardio', 'TrendingUp'),
  ('squat_rack', 'Squat Rack', 'strength', 'Dumbbell'),
  ('power_rack', 'Power Rack', 'strength', 'Shield'),
  ('smith_machine', 'Smith Machine', 'strength', 'Layers'),
  ('bench_press', 'Flat Bench Press', 'strength', 'Minus'),
  ('incline_bench', 'Incline Bench Press', 'strength', 'Maximize2'),
  ('dumbbells', 'Dumbbells Set', 'free_weights', 'Dumbbell'),
  ('kettlebells', 'Kettlebells', 'free_weights', 'CircleDot'),
  ('barbells', 'Olympic Barbells & Plates', 'free_weights', 'Minus'),
  ('deadlift_platform', 'Deadlift Platform', 'free_weights', 'Square'),
  ('cable_machine', 'Cable Crossover Machine', 'strength', 'GitBranch'),
  ('lat_pulldown', 'Lat Pulldown', 'strength', 'ArrowDown'),
  ('leg_press', 'Leg Press', 'strength', 'ChevronsUp'),
  ('leg_curl', 'Leg Curl / Extension', 'strength', 'RotateCcw'),
  ('chest_press', 'Chest Press Machine', 'strength', 'Sliders'),
  ('shoulder_press', 'Shoulder Press Machine', 'strength', 'ArrowUp'),
  ('pec_deck', 'Pec Deck / Rear Delt Fly', 'strength', 'Minimize2'),
  ('hack_squat', 'Hack Squat', 'strength', 'CornerRightDown'),
  ('calf_raise', 'Calf Raise Machine', 'strength', 'ChevronsUp'),
  ('preacher_curl', 'Preacher Curl Bench', 'strength', 'Target'),
  ('pull_up_bar', 'Pull-Up Bar', 'strength', 'AlignJustify'),
  ('dip_station', 'Dip Station', 'strength', 'Pause'),
  ('battle_ropes', 'Battle Ropes', 'functional', 'Activity'),
  ('plyo_box', 'Plyo Box Set', 'functional', 'Box'),
  ('sled', 'Push / Pull Sled', 'functional', 'FastForward'),
  ('trx', 'TRX Suspension Trainer', 'functional', 'Anchor'),
  ('medicine_balls', 'Medicine / Slam Balls', 'functional', 'Circle'),
  ('yoga_mats', 'Yoga Mats', 'functional', 'Square'),
  ('stretching_area', 'Dedicated Stretching Area', 'amenity', 'Maximize'),
  ('sauna', 'Infrared / Finnish Sauna', 'recovery', 'Flame'),
  ('steam_room', 'Steam Room', 'recovery', 'CloudRain'),
  ('showers', 'Private Showers', 'amenity', 'Droplet'),
  ('lockers', 'Secure Lockers', 'amenity', 'Lock'),
  ('free_wifi', 'High-Speed Free Wi-Fi', 'amenity', 'Wifi'),
  ('parking', 'Free Member Parking', 'amenity', 'Car')
on conflict (key) do nothing;

-- Permissions
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
