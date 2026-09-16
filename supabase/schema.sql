-- =====================================================================
-- Church Attendance — Supabase schema
-- Run this whole file once in Supabase: SQL Editor → New query → Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.members (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  phone        text,
  gender       text check (gender in ('Male', 'Female')),
  age_group    text not null default 'Adults'
               check (age_group in ('Children', 'Youth', 'Young Adults', 'Adults', 'Seniors')),
  department   text,
  member_type  text not null default 'Member'
               check (member_type in ('Member', 'Worker', 'New Convert', 'Visitor')),
  joined_on    date not null default current_date,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  service_type  text not null default 'Sunday Service',
  service_date  date not null default current_date,
  is_open       boolean not null default true,   -- open = check-in allowed
  created_at    timestamptz not null default now()
);

create table if not exists public.attendance (
  id             uuid primary key default gen_random_uuid(),
  service_id     uuid not null references public.services(id) on delete cascade,
  member_id      uuid not null references public.members(id) on delete cascade,
  checked_in_at  timestamptz not null default now(),
  method         text not null default 'self' check (method in ('self', 'admin')),
  unique (service_id, member_id)
);

create index if not exists attendance_service_idx on public.attendance(service_id);
create index if not exists attendance_member_idx  on public.attendance(member_id);
create index if not exists services_date_idx      on public.services(service_date);
create index if not exists members_name_idx       on public.members(full_name);

-- Admins: only users listed here can manage data
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.members    enable row level security;
alter table public.services   enable row level security;
alter table public.attendance enable row level security;
alter table public.admins     enable row level security;

drop policy if exists "admins manage members"    on public.members;
drop policy if exists "admins manage services"   on public.services;
drop policy if exists "admins manage attendance" on public.attendance;
drop policy if exists "admins read self"         on public.admins;

create policy "admins manage members" on public.members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins manage services" on public.services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins manage attendance" on public.attendance
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins read self" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Anonymous users (people scanning the QR code) get NO direct table access.
-- They can only use the two functions below, which expose names only.

-- ---------------------------------------------------------------------
-- Public check-in: load the service + member names
-- Pass NULL to get the most recent open service (for a permanent QR code)
-- ---------------------------------------------------------------------
create or replace function public.get_checkin_data(p_service_id uuid default null)
returns json
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_service public.services;
begin
  if p_service_id is null then
    select * into v_service from public.services
     where is_open
     order by service_date desc, created_at desc
     limit 1;
  else
    select * into v_service from public.services
     where id = p_service_id and is_open;
  end if;

  if not found then
    return null;
  end if;

  return json_build_object(
    'service', json_build_object(
      'id', v_service.id,
      'title', v_service.title,
      'service_type', v_service.service_type,
      'service_date', v_service.service_date
    ),
    'members', coalesce((
      select json_agg(json_build_object(
               'id', m.id,
               'full_name', m.full_name,
               'department', m.department,
               'present', a.id is not null
             ) order by m.full_name)
        from public.members m
        left join public.attendance a
          on a.member_id = m.id and a.service_id = v_service.id
       where m.is_active
    ), '[]'::json)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Public check-in: mark a member present
-- Returns: 'ok' | 'already' | 'closed' | 'invalid'
-- ---------------------------------------------------------------------
create or replace function public.mark_present(p_service_id uuid, p_member_id uuid)
returns text
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  if not exists (select 1 from public.services where id = p_service_id and is_open) then
    return 'closed';
  end if;

  if not exists (select 1 from public.members where id = p_member_id and is_active) then
    return 'invalid';
  end if;

  insert into public.attendance (service_id, member_id, method)
  values (p_service_id, p_member_id, 'self')
  on conflict (service_id, member_id) do nothing;

  get diagnostics v_rows = row_count;
  return case when v_rows > 0 then 'ok' else 'already' end;
end;
$$;

revoke all on function public.get_checkin_data(uuid) from public;
revoke all on function public.mark_present(uuid, uuid) from public;
grant execute on function public.get_checkin_data(uuid)   to anon, authenticated;
grant execute on function public.mark_present(uuid, uuid) to anon, authenticated;
grant execute on function public.is_admin()               to authenticated;

-- ---------------------------------------------------------------------
-- After creating your admin user in Authentication → Users, run:
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@yourchurch.org';
-- ---------------------------------------------------------------------
