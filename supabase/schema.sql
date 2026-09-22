-- =====================================================================
-- Church Management System — full schema (v2)
-- Safe to run more than once. Running it on a v1 database upgrades it
-- in place without touching existing members, services or attendance.
-- Supabase → SQL Editor → New query → paste → Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Admins and helper
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'Administrator',
  created_at timestamptz not null default now()
);
alter table public.admins add column if not exists full_name text;
alter table public.admins add column if not exists role text not null default 'Administrator';

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 2. Church profile + SMS credentials (single row)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id                   int primary key default 1 check (id = 1),
  church_name          text not null default 'Our Church',
  denomination         text,
  address              text,
  location             text,
  city                 text,
  country              text default 'Ghana',
  phone                text,
  email                text,
  website              text,
  logo_url             text,
  motto                text,
  currency_code        text not null default 'GHS',
  currency_symbol      text not null default 'GH₵',
  country_dial_code    text not null default '233',
  fiscal_year_start    int not null default 1 check (fiscal_year_start between 1 and 12),
  sms_enabled          boolean not null default false,
  sms_provider         text not null default 'hubtel',
  sms_client_id        text,
  sms_client_secret    text,
  sms_sender_id        text,
  follow_up_threshold  int not null default 3,
  updated_at           timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Configurable dropdowns — every dropdown in the app reads this table
-- ---------------------------------------------------------------------
create table if not exists public.lookups (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  value       text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (category, value)
);
create index if not exists lookups_category_idx on public.lookups(category, sort_order);

-- ---------------------------------------------------------------------
-- 4. Groups
-- ---------------------------------------------------------------------
create table if not exists public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  leader_name  text,
  leader_phone text,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Members
-- ---------------------------------------------------------------------
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone       text,
  gender      text,
  age_group   text not null default 'Adults',
  department  text,
  member_type text not null default 'Member',
  joined_on   date not null default current_date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.members drop constraint if exists members_gender_check;
alter table public.members drop constraint if exists members_age_group_check;
alter table public.members drop constraint if exists members_member_type_check;

alter table public.members add column if not exists member_no           text;
alter table public.members add column if not exists group_id            uuid references public.groups(id) on delete set null;
alter table public.members add column if not exists phone_alt           text;
alter table public.members add column if not exists email               text;
alter table public.members add column if not exists date_of_birth       date;
alter table public.members add column if not exists marital_status      text;
alter table public.members add column if not exists postal_address      text;
alter table public.members add column if not exists location_landmark   text;
alter table public.members add column if not exists ministries          text[] not null default '{}';
alter table public.members add column if not exists communication_prefs text[] not null default '{}';
alter table public.members add column if not exists baptism_date        date;
alter table public.members add column if not exists talents             text;
alter table public.members add column if not exists occupation          text;
alter table public.members add column if not exists emergency_name      text;
alter table public.members add column if not exists emergency_phone     text;
alter table public.members add column if not exists photo_url           text;
alter table public.members add column if not exists notes               text;

create index if not exists members_group_idx on public.members(group_id);
create index if not exists members_name_idx  on public.members(full_name);

-- ---------------------------------------------------------------------
-- 6. Services and attendance
-- ---------------------------------------------------------------------
create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  service_type text not null default 'Sunday Service',
  service_date date not null default current_date,
  is_open      boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.services add column if not exists notes text;

create table if not exists public.attendance (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references public.services(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  method        text not null default 'self' check (method in ('self', 'admin')),
  unique (service_id, member_id)
);
create index if not exists attendance_service_idx on public.attendance(service_id);
create index if not exists attendance_member_idx  on public.attendance(member_id);
create index if not exists services_date_idx      on public.services(service_date);

-- ---------------------------------------------------------------------
-- 7. Accounting
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  type        text not null check (type in ('Asset', 'Liability', 'Equity', 'Income', 'Expense')),
  subtype     text,
  is_cash     boolean not null default false,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  entry_date  date not null default current_date,
  reference   text,
  description text,
  source      text not null default 'manual' check (source in ('manual', 'contribution', 'expense', 'asset')),
  source_id   uuid,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists journal_entries_date_idx   on public.journal_entries(entry_date);
create index if not exists journal_entries_source_idx on public.journal_entries(source, source_id);

create table if not exists public.journal_lines (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.journal_entries(id) on delete cascade,
  account_id  uuid not null references public.accounts(id) on delete restrict,
  debit       numeric(14,2) not null default 0 check (debit >= 0),
  credit      numeric(14,2) not null default 0 check (credit >= 0),
  description text,
  member_id   uuid references public.members(id) on delete set null,
  line_no     int not null default 1,
  check (debit = 0 or credit = 0)
);
create index if not exists journal_lines_entry_idx   on public.journal_lines(entry_id);
create index if not exists journal_lines_account_idx on public.journal_lines(account_id);

create table if not exists public.contribution_types (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null unique,
  income_account_id       uuid references public.accounts(id) on delete set null,
  default_cash_account_id uuid references public.accounts(id) on delete set null,
  per_member              boolean not null default true,
  is_active               boolean not null default true,
  sort_order              int not null default 0,
  created_at              timestamptz not null default now()
);

create table if not exists public.contributions (
  id                   uuid primary key default gen_random_uuid(),
  member_id            uuid references public.members(id) on delete set null,
  contribution_type_id uuid not null references public.contribution_types(id) on delete restrict,
  amount               numeric(14,2) not null check (amount > 0),
  contribution_date    date not null default current_date,
  service_id           uuid references public.services(id) on delete set null,
  payment_method       text not null default 'Cash',
  cash_account_id      uuid references public.accounts(id) on delete set null,
  reference            text,
  note                 text,
  recorded_by          uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists contributions_date_idx   on public.contributions(contribution_date);
create index if not exists contributions_member_idx on public.contributions(member_id);
create index if not exists contributions_type_idx   on public.contributions(contribution_type_id);

create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  expense_date    date not null default current_date,
  account_id      uuid not null references public.accounts(id) on delete restrict,
  cash_account_id uuid references public.accounts(id) on delete set null,
  amount          numeric(14,2) not null check (amount > 0),
  payee           text,
  description     text,
  reference       text,
  payment_method  text not null default 'Cash',
  recorded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses(expense_date);

-- ---------------------------------------------------------------------
-- 8. Fixed assets
-- ---------------------------------------------------------------------
create table if not exists public.assets (
  id                uuid primary key default gen_random_uuid(),
  asset_code        text unique,
  name              text not null,
  category          text,
  description       text,
  serial_number     text,
  supplier          text,
  acquisition_date  date not null default current_date,
  cost              numeric(14,2) not null default 0 check (cost >= 0),
  quantity          int not null default 1 check (quantity > 0),
  useful_life_years int not null default 5 check (useful_life_years > 0),
  salvage_value     numeric(14,2) not null default 0 check (salvage_value >= 0),
  location          text,
  condition         text default 'Good',
  status            text not null default 'In use',
  custodian         text,
  asset_account_id  uuid references public.accounts(id) on delete set null,
  cash_account_id   uuid references public.accounts(id) on delete set null,
  post_to_accounts  boolean not null default false,
  disposal_date     date,
  disposal_amount   numeric(14,2),
  notes             text,
  photo_url         text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 9. SMS
-- ---------------------------------------------------------------------
create table if not exists public.sms_messages (
  id              uuid primary key default gen_random_uuid(),
  body            text not null,
  audience        text not null,
  audience_label  text,
  service_id      uuid references public.services(id) on delete set null,
  group_id        uuid references public.groups(id) on delete set null,
  recipient_count int not null default 0,
  sent_count      int not null default 0,
  failed_count    int not null default 0,
  status          text not null default 'queued' check (status in ('queued', 'sending', 'completed', 'failed')),
  error           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists public.sms_recipients (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.sms_messages(id) on delete cascade,
  member_id   uuid references public.members(id) on delete set null,
  name        text,
  phone       text not null,
  status      text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_id text,
  error       text,
  sent_at     timestamptz
);
create index if not exists sms_recipients_message_idx on public.sms_recipients(message_id);

-- ---------------------------------------------------------------------
-- 10. Automatic posting to the chart of accounts
-- ---------------------------------------------------------------------
create or replace function public.sync_contribution_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_income uuid; v_cash uuid; v_entry uuid; v_name text; v_member text;
begin
  v_id := coalesce(new.id, old.id);
  delete from public.journal_entries where source = 'contribution' and source_id = v_id;
  if tg_op = 'DELETE' then return old; end if;

  select ct.income_account_id, coalesce(new.cash_account_id, ct.default_cash_account_id), ct.name
    into v_income, v_cash, v_name
    from public.contribution_types ct where ct.id = new.contribution_type_id;

  -- Not mapped to accounts yet: keep the money record, skip the posting
  if v_income is null or v_cash is null then return new; end if;

  select full_name into v_member from public.members where id = new.member_id;

  insert into public.journal_entries (entry_date, reference, description, source, source_id, created_by)
  values (new.contribution_date, new.reference, v_name || coalesce(' — ' || v_member, ''), 'contribution', new.id, new.recorded_by)
  returning id into v_entry;

  insert into public.journal_lines (entry_id, account_id, debit, credit, description, member_id, line_no)
  values (v_entry, v_cash,   new.amount, 0, v_name, new.member_id, 1),
         (v_entry, v_income, 0, new.amount, v_name, new.member_id, 2);
  return new;
end $$;

drop trigger if exists trg_contribution_journal on public.contributions;
create trigger trg_contribution_journal
after insert or update or delete on public.contributions
for each row execute function public.sync_contribution_journal();

create or replace function public.sync_expense_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_entry uuid; v_id uuid;
begin
  v_id := coalesce(new.id, old.id);
  delete from public.journal_entries where source = 'expense' and source_id = v_id;
  if tg_op = 'DELETE' then return old; end if;
  if new.cash_account_id is null then return new; end if;

  insert into public.journal_entries (entry_date, reference, description, source, source_id, created_by)
  values (new.expense_date, new.reference,
          coalesce(new.description, 'Expense') || coalesce(' — ' || new.payee, ''), 'expense', new.id, new.recorded_by)
  returning id into v_entry;

  insert into public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
  values (v_entry, new.account_id,      new.amount, 0, new.description, 1),
         (v_entry, new.cash_account_id, 0, new.amount, new.description, 2);
  return new;
end $$;

drop trigger if exists trg_expense_journal on public.expenses;
create trigger trg_expense_journal
after insert or update or delete on public.expenses
for each row execute function public.sync_expense_journal();

create or replace function public.sync_asset_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_entry uuid; v_id uuid;
begin
  v_id := coalesce(new.id, old.id);
  delete from public.journal_entries where source = 'asset' and source_id = v_id;
  if tg_op = 'DELETE' then return old; end if;
  if not new.post_to_accounts or new.asset_account_id is null or new.cash_account_id is null or new.cost = 0 then
    return new;
  end if;

  insert into public.journal_entries (entry_date, reference, description, source, source_id)
  values (new.acquisition_date, new.asset_code, 'Asset purchase — ' || new.name, 'asset', new.id)
  returning id into v_entry;

  insert into public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
  values (v_entry, new.asset_account_id, new.cost * new.quantity, 0, new.name, 1),
         (v_entry, new.cash_account_id, 0, new.cost * new.quantity, new.name, 2);
  return new;
end $$;

drop trigger if exists trg_asset_journal on public.assets;
create trigger trg_asset_journal
after insert or update or delete on public.assets
for each row execute function public.sync_asset_journal();

-- Manual journal, posted in one transaction and forced to balance
create or replace function public.post_manual_journal(
  p_entry_date date, p_reference text, p_description text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_entry uuid; v_debit numeric(14,2); v_credit numeric(14,2);
begin
  if not public.is_admin() then raise exception 'Not authorised'; end if;

  select coalesce(sum((l->>'debit')::numeric), 0), coalesce(sum((l->>'credit')::numeric), 0)
    into v_debit, v_credit from jsonb_array_elements(p_lines) l;

  if v_debit <= 0 then raise exception 'Enter at least one amount'; end if;
  if round(v_debit, 2) <> round(v_credit, 2) then
    raise exception 'Debits (%) and credits (%) must be equal', v_debit, v_credit;
  end if;

  insert into public.journal_entries (entry_date, reference, description, source, created_by)
  values (p_entry_date, p_reference, p_description, 'manual', auth.uid())
  returning id into v_entry;

  insert into public.journal_lines (entry_id, account_id, debit, credit, description, member_id, line_no)
  select v_entry, (l->>'account_id')::uuid,
         coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0),
         l->>'description', nullif(l->>'member_id', '')::uuid, (row_number() over ())::int
    from jsonb_array_elements(p_lines) l
   where coalesce((l->>'debit')::numeric, 0) + coalesce((l->>'credit')::numeric, 0) > 0;

  return v_entry;
end $$;

-- ---------------------------------------------------------------------
-- 11. Reporting views (these respect row level security)
-- ---------------------------------------------------------------------
drop view if exists public.v_journal_lines;
create view public.v_journal_lines with (security_invoker = on) as
select l.id, l.entry_id, l.account_id, l.debit, l.credit, l.description, l.member_id, l.line_no,
       e.entry_date, e.reference, e.description as entry_description, e.source, e.source_id,
       a.code as account_code, a.name as account_name, a.type as account_type, a.is_cash
  from public.journal_lines l
  join public.journal_entries e on e.id = l.entry_id
  join public.accounts a on a.id = l.account_id;

drop view if exists public.v_member_contributions;
create view public.v_member_contributions with (security_invoker = on) as
select c.id, c.member_id, c.contribution_type_id, c.amount, c.contribution_date, c.payment_method,
       c.reference, c.note, c.service_id,
       m.full_name, m.phone, m.group_id, g.name as group_name, ct.name as contribution_type
  from public.contributions c
  left join public.members m on m.id = c.member_id
  left join public.groups g on g.id = m.group_id
  join public.contribution_types ct on ct.id = c.contribution_type_id;

-- ---------------------------------------------------------------------
-- 12. Row level security
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['members','services','attendance','settings','lookups','groups','accounts',
                           'journal_entries','journal_lines','contribution_types','contributions',
                           'expenses','assets','sms_messages','sms_recipients']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admins manage %s" on public.%I', t, t);
    execute format(
      'create policy "admins manage %s" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

alter table public.admins enable row level security;
drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 13. Public check-in (no login). Names only, open services only.
-- ---------------------------------------------------------------------
create or replace function public.get_checkin_data(p_service_id uuid default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_service public.services; v_settings public.settings;
begin
  if p_service_id is null then
    select * into v_service from public.services where is_open
     order by service_date desc, created_at desc limit 1;
  else
    select * into v_service from public.services where id = p_service_id and is_open;
  end if;
  if not found then return null; end if;

  select * into v_settings from public.settings where id = 1;

  return json_build_object(
    'church', json_build_object('name', v_settings.church_name, 'logo_url', v_settings.logo_url),
    'service', json_build_object('id', v_service.id, 'title', v_service.title,
                                 'service_type', v_service.service_type, 'service_date', v_service.service_date),
    'members', coalesce((
      select json_agg(json_build_object(
               'id', m.id, 'full_name', m.full_name,
               'group_name', g.name, 'present', a.id is not null) order by m.full_name)
        from public.members m
        left join public.groups g on g.id = m.group_id
        left join public.attendance a on a.member_id = m.id and a.service_id = v_service.id
       where m.is_active), '[]'::json)
  );
end $$;

-- Church name and logo for the login and check-in screens (no login needed)
create or replace function public.get_church_brand()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('church_name', church_name, 'logo_url', logo_url, 'motto', motto)
    from public.settings where id = 1;
$$;

create or replace function public.mark_present(p_service_id uuid, p_member_id uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_rows int;
begin
  if not exists (select 1 from public.services where id = p_service_id and is_open) then return 'closed'; end if;
  if not exists (select 1 from public.members where id = p_member_id and is_active) then return 'invalid'; end if;
  insert into public.attendance (service_id, member_id, method)
  values (p_service_id, p_member_id, 'self')
  on conflict (service_id, member_id) do nothing;
  get diagnostics v_rows = row_count;
  return case when v_rows > 0 then 'ok' else 'already' end;
end $$;

revoke all on function public.get_checkin_data(uuid) from public;
revoke all on function public.mark_present(uuid, uuid) from public;
grant execute on function public.get_checkin_data(uuid)   to anon, authenticated;
grant execute on function public.get_church_brand()       to anon, authenticated;
grant execute on function public.mark_present(uuid, uuid) to anon, authenticated;
grant execute on function public.is_admin()               to authenticated;
grant execute on function public.post_manual_journal(date, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 14. Logo storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('church', 'church', true)
on conflict (id) do nothing;

drop policy if exists "church files are public" on storage.objects;
create policy "church files are public" on storage.objects
  for select to public using (bucket_id = 'church');

drop policy if exists "admins upload church files" on storage.objects;
create policy "admins upload church files" on storage.objects
  for insert to authenticated with check (bucket_id = 'church' and public.is_admin());

drop policy if exists "admins update church files" on storage.objects;
create policy "admins update church files" on storage.objects
  for update to authenticated using (bucket_id = 'church' and public.is_admin());

drop policy if exists "admins delete church files" on storage.objects;
create policy "admins delete church files" on storage.objects
  for delete to authenticated using (bucket_id = 'church' and public.is_admin());

-- ---------------------------------------------------------------------
-- 15. Starter data (skipped where it already exists)
-- ---------------------------------------------------------------------
insert into public.lookups (category, value, sort_order) values
  ('gender', 'Male', 1), ('gender', 'Female', 2),
  ('marital_status', 'Single', 1), ('marital_status', 'Married', 2),
  ('marital_status', 'Widow/Widower', 3), ('marital_status', 'Divorced', 4), ('marital_status', 'Co-habiting', 5),
  ('age_group', 'Children', 1), ('age_group', 'Youth', 2), ('age_group', 'Young Adults', 3),
  ('age_group', 'Adults', 4), ('age_group', 'Seniors', 5),
  ('membership_status', 'Member', 1), ('membership_status', 'Presbyter/Officer', 2),
  ('membership_status', 'Worker', 3), ('membership_status', 'New Convert', 4), ('membership_status', 'Visitor', 5),
  ('ministry', 'Youth Ministry', 1), ('ministry', 'Women Ministry', 2), ('ministry', 'Men Ministry', 3),
  ('ministry', 'Children Ministry', 4), ('ministry', 'Evangelism Ministry', 5),
  ('department', 'Choir', 1), ('department', 'Ushering', 2), ('department', 'Protocol', 3),
  ('department', 'Media', 4), ('department', 'Prayer Team', 5), ('department', 'Sunday School', 6),
  ('service_type', 'Sunday Service', 1), ('service_type', 'Midweek Service', 2),
  ('service_type', 'Prayer Meeting', 3), ('service_type', 'Youth Service', 4), ('service_type', 'Special Program', 5),
  ('communication_method', 'Phone Call', 1), ('communication_method', 'WhatsApp', 2),
  ('communication_method', 'Text Message', 3), ('communication_method', 'Email', 4),
  ('payment_method', 'Cash', 1), ('payment_method', 'Mobile Money', 2),
  ('payment_method', 'Bank Transfer', 3), ('payment_method', 'Cheque', 4),
  ('asset_category', 'Land and Buildings', 1), ('asset_category', 'Musical Instruments', 2),
  ('asset_category', 'Furniture and Fittings', 3), ('asset_category', 'Sound and Media Equipment', 4),
  ('asset_category', 'Vehicles', 5), ('asset_category', 'Office Equipment', 6),
  ('asset_condition', 'New', 1), ('asset_condition', 'Good', 2), ('asset_condition', 'Fair', 3),
  ('asset_condition', 'Needs repair', 4),
  ('asset_status', 'In use', 1), ('asset_status', 'In store', 2), ('asset_status', 'Under repair', 3),
  ('asset_status', 'Disposed', 4), ('asset_status', 'Lost', 5)
on conflict (category, value) do nothing;

insert into public.groups (name, is_active)
select v, true from (values ('Group 1'), ('Group 2'), ('Group 3'), ('Group 4'), ('Group 5')) as t(v)
where not exists (select 1 from public.groups)
on conflict (name) do nothing;

insert into public.accounts (code, name, type, subtype, is_cash) values
  ('1000', 'Cash on Hand',            'Asset',   'Current asset', true),
  ('1010', 'Bank Account',            'Asset',   'Current asset', true),
  ('1020', 'Mobile Money Account',    'Asset',   'Current asset', true),
  ('1200', 'Receivables',             'Asset',   'Current asset', false),
  ('1500', 'Land and Buildings',      'Asset',   'Fixed asset',   false),
  ('1510', 'Furniture and Equipment', 'Asset',   'Fixed asset',   false),
  ('1520', 'Musical Instruments',     'Asset',   'Fixed asset',   false),
  ('1530', 'Vehicles',                'Asset',   'Fixed asset',   false),
  ('2000', 'Payables',                'Liability', 'Current liability', false),
  ('3000', 'Accumulated Fund',        'Equity',  null,            false),
  ('4000', 'Tithes',                  'Income',  'Contributions', false),
  ('4010', 'Offerings',               'Income',  'Contributions', false),
  ('4020', 'Welfare Contributions',   'Income',  'Contributions', false),
  ('4030', 'Special Contributions',   'Income',  'Contributions', false),
  ('4040', 'Donations',               'Income',  'Other income',  false),
  ('5000', 'Pastoral Allowances',     'Expense', 'Personnel',      false),
  ('5010', 'Utilities',               'Expense', 'Administration', false),
  ('5020', 'Rent',                    'Expense', 'Administration', false),
  ('5030', 'Maintenance and Repairs', 'Expense', 'Administration', false),
  ('5040', 'Transport and Fuel',      'Expense', 'Administration', false),
  ('5050', 'Evangelism and Outreach', 'Expense', 'Ministry',       false),
  ('5060', 'Welfare Payments',        'Expense', 'Ministry',       false),
  ('5070', 'Church Programs',         'Expense', 'Ministry',       false),
  ('5080', 'Headquarters Remittance', 'Expense', 'Ministry',       false),
  ('5090', 'Bank Charges',            'Expense', 'Administration', false),
  ('5100', 'Stationery and Printing', 'Expense', 'Administration', false)
on conflict (code) do nothing;

insert into public.contribution_types (name, income_account_id, default_cash_account_id, per_member, sort_order)
select t.name, a.id, c.id, t.per_member, t.sort_order
  from (values ('Tithe', '4000', true, 1),
               ('Welfare', '4020', true, 2),
               ('Special Contribution', '4030', true, 3),
               ('Offering', '4010', false, 4),
               ('Donation', '4040', false, 5)) as t(name, code, per_member, sort_order)
  join public.accounts a on a.code = t.code
  join public.accounts c on c.code = '1000'
on conflict (name) do nothing;
