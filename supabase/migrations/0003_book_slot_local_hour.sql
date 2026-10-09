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
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_gym from public.gyms where id = p_gym;
  if not found then
    raise exception 'GYM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_gym.status <> 'claimed' then
    raise exception 'GYM_NOT_CLAIMED' using errcode = 'P0003';
  end if;
  if v_gym.price_minor is null then
    raise exception 'PRICE_NOT_AVAILABLE' using errcode = 'P0004';
  end if;

  select timezone into v_tz from public.cities where id = v_gym.city_id;
  if v_tz is null then
    v_tz := 'UTC';
  end if;

  v_local_start := p_start at time zone v_tz;
  if date_trunc('hour', v_local_start) <> v_local_start then
    raise exception 'NOT_ON_THE_HOUR' using errcode = 'P0005';
  end if;
  if p_start <= now() then
    raise exception 'SLOT_IN_PAST' using errcode = 'P0006';
  end if;
  if p_start > now() + interval '7 days' then
    raise exception 'EXCEEDS_7_DAYS' using errcode = 'P0007';
  end if;

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

  perform pg_advisory_xact_lock(hashtext(p_gym::text || p_start::text)::bigint);

  select count(*) into v_booked_count
  from public.bookings
  where gym_id = p_gym
    and slot_start = p_start
    and status in ('confirmed', 'checked_in');
  if v_booked_count >= v_gym.capacity_per_hour then
    raise exception 'SLOT_FULL' using errcode = 'P0009';
  end if;
  if exists (
    select 1 from public.bookings
    where gym_id = p_gym
      and user_id = v_user_id
      and slot_start = p_start
      and status in ('confirmed', 'checked_in')
  ) then
    raise exception 'ALREADY_BOOKED' using errcode = 'P0010';
  end if;

  insert into public.bookings (
    gym_id, user_id, slot_start, slot_end, price_minor, currency, status
  ) values (
    p_gym, v_user_id, p_start, p_start + interval '1 hour',
    v_gym.price_minor, coalesce(v_gym.price_currency, 'USD'), 'confirmed'
  ) returning id into v_booking_id;

  return v_booking_id;
end;
$$ language plpgsql security definer set search_path = public;
