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


-- =====================================================================
-- PART 2 — roles and permissions, billing, automated SMS  (v3)
--
-- Everything below is also safe to re-run. It replaces some of the
-- policies and triggers defined above, so always run the whole file.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 16. Roles and users
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  permissions text[] not null default '{}',
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.admins add column if not exists role_id   uuid references public.roles(id) on delete set null;
alter table public.admins add column if not exists email     text;
alter table public.admins add column if not exists phone     text;
alter table public.admins add column if not exists group_id  uuid references public.groups(id) on delete set null;
alter table public.admins add column if not exists ministry  text;
alter table public.admins add column if not exists photo_url text;
alter table public.admins add column if not exists is_active boolean not null default true;

insert into public.roles (name, description, permissions, is_system) values
  ('Administrator', 'Full access to everything, including users and settings',
   array['members.view_all','members.manage','attendance.manage','finance.view','finance.record',
         'finance.manage','sms.send','assets.manage','reports.view','settings.manage','users.manage'], true),
  ('Finance Manager', 'Runs contributions, billing, expenses and the accounts',
   array['members.view_all','attendance.manage','finance.view','finance.record','finance.manage',
         'sms.send','assets.manage','reports.view'], true),
  ('Group Leader', 'Sees and follows up their own group',
   array['attendance.manage','sms.send','reports.view'], true),
  ('Ministry Leader', 'Sees and follows up their own ministry',
   array['attendance.manage','sms.send','reports.view'], true),
  ('Usher', 'Marks attendance only', array['attendance.manage'], true)
on conflict (name) do nothing;

-- Anyone already set up keeps full access
update public.admins
   set role_id = (select id from public.roles where name = 'Administrator')
 where role_id is null;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and is_active);
$$;

create or replace function public.can(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    join public.roles r on r.id = a.role_id
    where a.user_id = auth.uid() and a.is_active
      and (r.name = 'Administrator' or p_permission = any(r.permissions))
  );
$$;

create or replace function public.my_group()
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from public.admins where user_id = auth.uid();
$$;

create or replace function public.my_ministries()
returns text[] language sql stable security definer set search_path = public as $$
  select case when ministry is null then '{}'::text[] else array[ministry] end
    from public.admins where user_id = auth.uid();
$$;

create or replace function public.my_profile()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'user_id', a.user_id, 'full_name', a.full_name, 'email', a.email, 'phone', a.phone,
    'photo_url', a.photo_url, 'is_active', a.is_active, 'group_id', a.group_id,
    'group_name', g.name, 'ministry', a.ministry,
    'role', r.name, 'role_id', r.id,
    'permissions', case when r.name = 'Administrator' then
        array['members.view_all','members.manage','attendance.manage','finance.view','finance.record',
              'finance.manage','sms.send','assets.manage','reports.view','settings.manage','users.manage']
      else coalesce(r.permissions, '{}') end)
    from public.admins a
    left join public.roles r on r.id = a.role_id
    left join public.groups g on g.id = a.group_id
   where a.user_id = auth.uid();
$$;

grant execute on function public.can(text)        to authenticated;
grant execute on function public.my_profile()     to authenticated;
grant execute on function public.my_group()       to authenticated;
grant execute on function public.my_ministries()  to authenticated;

-- ---------------------------------------------------------------------
-- 17. Billing: welfare batches and special contributions
-- ---------------------------------------------------------------------
alter table public.contribution_types add column if not exists is_billable boolean not null default false;
alter table public.contribution_types add column if not exists kind text not null default 'general';
alter table public.contribution_types add column if not exists receivable_account_id uuid references public.accounts(id) on delete set null;
alter table public.contribution_types add column if not exists default_amount numeric(14,2);
alter table public.contribution_types add column if not exists is_archived boolean not null default false;

create table if not exists public.billing_runs (
  id                   uuid primary key default gen_random_uuid(),
  contribution_type_id uuid not null references public.contribution_types(id) on delete cascade,
  title                text not null,
  description          text,
  amount               numeric(14,2) not null check (amount > 0),
  bill_date            date not null default current_date,
  due_date             date,
  scope_group_id       uuid references public.groups(id) on delete set null,
  billed_count         int not null default 0,
  total_amount         numeric(14,2) not null default 0,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists billing_runs_type_idx on public.billing_runs(contribution_type_id);

create table if not exists public.member_bills (
  id                   uuid primary key default gen_random_uuid(),
  run_id               uuid not null references public.billing_runs(id) on delete cascade,
  member_id            uuid not null references public.members(id) on delete cascade,
  contribution_type_id uuid not null references public.contribution_types(id) on delete cascade,
  amount               numeric(14,2) not null check (amount > 0),
  bill_date            date not null default current_date,
  due_date             date,
  note                 text,
  created_at           timestamptz not null default now(),
  unique (run_id, member_id)
);
create index if not exists member_bills_member_idx on public.member_bills(member_id, contribution_type_id);

-- Billing entries need their own journal source
alter table public.journal_entries drop constraint if exists journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'contribution', 'expense', 'asset', 'billing'));

-- Bill everyone at once, and post the receivable in the same transaction
create or replace function public.create_billing_run(
  p_type_id uuid, p_title text, p_amount numeric, p_bill_date date default current_date,
  p_due_date date default null, p_group_id uuid default null, p_description text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_run uuid; v_count int; v_total numeric(14,2);
  v_type public.contribution_types; v_entry uuid;
begin
  if not public.can('finance.record') then raise exception 'You do not have permission to raise bills'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;

  select * into v_type from public.contribution_types where id = p_type_id;
  if not found then raise exception 'Unknown payment type'; end if;

  insert into public.billing_runs (contribution_type_id, title, description, amount, bill_date, due_date, scope_group_id, created_by)
  values (p_type_id, p_title, p_description, p_amount, coalesce(p_bill_date, current_date), p_due_date, p_group_id, auth.uid())
  returning id into v_run;

  insert into public.member_bills (run_id, member_id, contribution_type_id, amount, bill_date, due_date)
  select v_run, m.id, p_type_id, p_amount, coalesce(p_bill_date, current_date), p_due_date
    from public.members m
   where m.is_active and (p_group_id is null or m.group_id = p_group_id);

  get diagnostics v_count = row_count;
  v_total := v_count * p_amount;
  update public.billing_runs set billed_count = v_count, total_amount = v_total where id = v_run;

  -- Debit what members now owe, credit the income it belongs to
  if v_count > 0 and v_type.receivable_account_id is not null and v_type.income_account_id is not null then
    insert into public.journal_entries (entry_date, reference, description, source, source_id, created_by)
    values (coalesce(p_bill_date, current_date), null, p_title || ' — billed to ' || v_count || ' members', 'billing', v_run, auth.uid())
    returning id into v_entry;

    insert into public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
    values (v_entry, v_type.receivable_account_id, v_total, 0, p_title, 1),
           (v_entry, v_type.income_account_id, 0, v_total, p_title, 2);
  end if;

  return json_build_object('run_id', v_run, 'billed', v_count, 'total', v_total);
end $$;

create or replace function public.delete_billing_run(p_run_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can('finance.record') then raise exception 'You do not have permission to remove bills'; end if;
  delete from public.journal_entries where source = 'billing' and source_id = p_run_id;
  delete from public.billing_runs where id = p_run_id;
end $$;

-- Raise a special contribution: creates the payment type, then bills everyone
create or replace function public.create_special_contribution(
  p_name text, p_amount numeric, p_income_account_id uuid, p_cash_account_id uuid,
  p_bill_date date default current_date, p_due_date date default null,
  p_group_id uuid default null, p_description text default null
) returns json language plpgsql security definer set search_path = public as $$
declare v_type uuid; v_receivable uuid;
begin
  if not public.can('finance.record') then raise exception 'You do not have permission to raise a special contribution'; end if;

  select id into v_receivable from public.accounts where code = '1200' limit 1;

  insert into public.contribution_types
    (name, income_account_id, default_cash_account_id, receivable_account_id,
     per_member, is_billable, kind, default_amount, sort_order)
  values (p_name, p_income_account_id, p_cash_account_id, v_receivable, true, true, 'special', p_amount,
          (select coalesce(max(sort_order), 0) + 1 from public.contribution_types))
  returning id into v_type;

  return public.create_billing_run(v_type, p_name, p_amount, p_bill_date, p_due_date, p_group_id, p_description);
end $$;

grant execute on function public.create_billing_run(uuid, text, numeric, date, date, uuid, text) to authenticated;
grant execute on function public.delete_billing_run(uuid) to authenticated;
grant execute on function public.create_special_contribution(text, numeric, uuid, uuid, date, date, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 18. A payment against a billable type settles the debt, it is not new income
-- ---------------------------------------------------------------------
create or replace function public.sync_contribution_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_credit uuid; v_cash uuid; v_entry uuid; v_name text; v_member text;
  v_type public.contribution_types;
begin
  v_id := coalesce(new.id, old.id);
  delete from public.journal_entries where source = 'contribution' and source_id = v_id;
  if tg_op = 'DELETE' then return old; end if;

  select * into v_type from public.contribution_types where id = new.contribution_type_id;
  v_name := v_type.name;
  v_cash := coalesce(new.cash_account_id, v_type.default_cash_account_id);

  -- A payment against something the member was billed for clears the receivable,
  -- because the income was already recognised when the bill was raised.
  -- Anything else (tithes, offerings, an unbilled welfare payment) is income now.
  v_credit := case
    when v_type.is_billable
     and v_type.receivable_account_id is not null
     and new.member_id is not null
     and exists (select 1 from public.member_bills b
                  where b.member_id = new.member_id
                    and b.contribution_type_id = new.contribution_type_id)
    then v_type.receivable_account_id
    else v_type.income_account_id end;

  if v_credit is null or v_cash is null then return new; end if;

  select full_name into v_member from public.members where id = new.member_id;

  insert into public.journal_entries (entry_date, reference, description, source, source_id, created_by)
  values (new.contribution_date, new.reference, v_name || coalesce(' — ' || v_member, ''), 'contribution', new.id, new.recorded_by)
  returning id into v_entry;

  insert into public.journal_lines (entry_id, account_id, debit, credit, description, member_id, line_no)
  values (v_entry, v_cash,   new.amount, 0, v_name, new.member_id, 1),
         (v_entry, v_credit, 0, new.amount, v_name, new.member_id, 2);
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 19. Balances, bills and defaulters
-- ---------------------------------------------------------------------
drop view if exists public.v_member_balances;
create view public.v_member_balances with (security_invoker = on) as
with billed as (
  select member_id, contribution_type_id, sum(amount) as amount, max(bill_date) as last_bill
    from public.member_bills group by 1, 2
), paid as (
  select member_id, contribution_type_id, sum(amount) as amount, max(contribution_date) as last_paid
    from public.contributions where member_id is not null group by 1, 2
)
select m.id as member_id, m.full_name, m.phone, m.group_id, g.name as group_name, m.is_active,
       ct.id as contribution_type_id, ct.name as contribution_type, ct.is_billable, ct.kind,
       coalesce(b.amount, 0) as billed,
       coalesce(p.amount, 0) as paid,
       coalesce(b.amount, 0) - coalesce(p.amount, 0) as balance,
       b.last_bill, p.last_paid
  from public.members m
  cross join public.contribution_types ct
  left join public.groups g on g.id = m.group_id
  left join billed b on b.member_id = m.id and b.contribution_type_id = ct.id
  left join paid   p on p.member_id = m.id and p.contribution_type_id = ct.id
 where coalesce(b.amount, 0) > 0 or coalesce(p.amount, 0) > 0;

-- Each bill, and how much of it is still outstanding (oldest bills settled first)
drop view if exists public.v_bills;
create view public.v_bills with (security_invoker = on) as
with paid as (
  select member_id, contribution_type_id, sum(amount) as total
    from public.contributions where member_id is not null group by 1, 2
), ordered as (
  select b.*, sum(b.amount) over (
           partition by b.member_id, b.contribution_type_id
           order by b.bill_date, b.created_at, b.id
           rows between unbounded preceding and current row) as cumulative
    from public.member_bills b
)
select o.id, o.run_id, o.member_id, o.contribution_type_id, o.amount, o.bill_date, o.due_date, o.note,
       m.full_name, m.phone, m.group_id, g.name as group_name, m.is_active,
       ct.name as contribution_type, r.title as run_title,
       least(o.amount, greatest(0, coalesce(p.total, 0) - (o.cumulative - o.amount))) as settled,
       o.amount - least(o.amount, greatest(0, coalesce(p.total, 0) - (o.cumulative - o.amount))) as outstanding
  from ordered o
  join public.members m on m.id = o.member_id
  left join public.groups g on g.id = m.group_id
  join public.contribution_types ct on ct.id = o.contribution_type_id
  join public.billing_runs r on r.id = o.run_id
  left join paid p on p.member_id = o.member_id and p.contribution_type_id = o.contribution_type_id;

-- ---------------------------------------------------------------------
-- 20. Settings for automatic messages and photos
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists sms_on_payment boolean not null default false;
alter table public.settings add column if not exists sms_payment_template text
  default 'Dear {name}, we have received your {type} of {amount} on {date}. Outstanding balance: {balance}. Thank you and God bless you. - {church}';
alter table public.settings add column if not exists sms_on_billing boolean not null default false;
alter table public.settings add column if not exists sms_billing_template text
  default 'Dear {name}, your {type} of {amount} is due{due}. Your total outstanding balance is {balance}. - {church}';
alter table public.settings add column if not exists sms_birthday_enabled boolean not null default false;
alter table public.settings add column if not exists sms_birthday_template text
  default 'Happy birthday {name}! The whole {church} family celebrates with you today. May the Lord bless you and keep you.';
alter table public.settings add column if not exists birthday_last_run date;
alter table public.settings add column if not exists cron_secret text;
alter table public.settings add column if not exists show_photos_on_checkin boolean not null default false;

update public.settings
   set sms_payment_template = coalesce(sms_payment_template, 'Dear {name}, we have received your {type} of {amount} on {date}. Outstanding balance: {balance}. Thank you and God bless you. - {church}'),
       sms_billing_template = coalesce(sms_billing_template, 'Dear {name}, your {type} of {amount} is due{due}. Your total outstanding balance is {balance}. - {church}'),
       sms_birthday_template = coalesce(sms_birthday_template, 'Happy birthday {name}! The whole {church} family celebrates with you today. May the Lord bless you and keep you.')
 where id = 1;

-- Members whose birthday falls on a given day
create or replace function public.birthdays_on(p_date date default current_date)
returns table (id uuid, full_name text, phone text, date_of_birth date, group_id uuid, photo_url text)
language sql stable security definer set search_path = public as $$
  select m.id, m.full_name, m.phone, m.date_of_birth, m.group_id, m.photo_url
    from public.members m
   where m.is_active and m.date_of_birth is not null
     and to_char(m.date_of_birth, 'MM-DD') = to_char(p_date, 'MM-DD')
   order by m.full_name;
$$;
grant execute on function public.birthdays_on(date) to authenticated;

-- ---------------------------------------------------------------------
-- 21. Check-in now shows photos when the church turns them on
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
               'id', m.id, 'full_name', m.full_name, 'group_name', g.name,
               'photo_url', case when v_settings.show_photos_on_checkin then m.photo_url else null end,
               'present', a.id is not null) order by m.full_name)
        from public.members m
        left join public.groups g on g.id = m.group_id
        left join public.attendance a on a.member_id = m.id and a.service_id = v_service.id
       where m.is_active), '[]'::json)
  );
end $$;
grant execute on function public.get_checkin_data(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 22. Row level security, now driven by each user's role
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  spec record;
begin
  -- clear the blanket policies created in part 1
  foreach t in array array['members','services','attendance','settings','lookups','groups','accounts',
                           'journal_entries','journal_lines','contribution_types','contributions',
                           'expenses','assets','sms_messages','sms_recipients']
  loop
    execute format('drop policy if exists "admins manage %s" on public.%I', t, t);
  end loop;

  for spec in
    select * from (values
      -- table,               read permission,      write permission
      ('services',            null,                 'attendance.manage'),
      ('attendance',          null,                 'attendance.manage'),
      ('settings',            null,                 'settings.manage'),
      ('lookups',             null,                 'settings.manage'),
      ('groups',              null,                 'settings.manage'),
      ('roles',               null,                 'users.manage'),
      ('accounts',            'finance.view',       'finance.manage'),
      ('journal_entries',     'finance.view',       'finance.manage'),
      ('journal_lines',       'finance.view',       'finance.manage'),
      ('contribution_types',  'finance.view',       'finance.manage'),
      ('contributions',       'finance.view',       'finance.record'),
      ('expenses',            'finance.view',       'finance.record'),
      ('billing_runs',        'finance.view',       'finance.record'),
      ('member_bills',        'finance.view',       'finance.record'),
      ('assets',              null,                 'assets.manage'),
      ('sms_messages',        null,                 'sms.send'),
      ('sms_recipients',      null,                 'sms.send')
    ) as v(tbl, read_perm, write_perm)
  loop
    execute format('alter table public.%I enable row level security', spec.tbl);
    execute format('drop policy if exists "read %s" on public.%I', spec.tbl, spec.tbl);
    execute format('drop policy if exists "write %s" on public.%I', spec.tbl, spec.tbl);
    execute format(
      'create policy "read %s" on public.%I for select to authenticated using (%s)',
      spec.tbl, spec.tbl,
      case when spec.read_perm is null then 'public.is_admin()'
           else format('public.can(%L)', spec.read_perm) end);
    execute format(
      'create policy "write %s" on public.%I for all to authenticated using (public.can(%L)) with check (public.can(%L))',
      spec.tbl, spec.tbl, spec.write_perm, spec.write_perm);
  end loop;
end $$;

-- Members: leaders see their own people, everyone else needs members.view_all
alter table public.members enable row level security;
drop policy if exists "read members" on public.members;
create policy "read members" on public.members for select to authenticated
  using (
    public.can('members.view_all')
    or (group_id is not null and group_id = public.my_group())
    or (ministries && public.my_ministries())
  );
drop policy if exists "write members" on public.members;
create policy "write members" on public.members for all to authenticated
  using (public.can('members.manage')) with check (public.can('members.manage'));

-- Users: everyone signed in can see who else has access; only users.manage may change it
alter table public.admins enable row level security;
drop policy if exists "admins read self" on public.admins;
drop policy if exists "read users" on public.admins;
create policy "read users" on public.admins for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "write users" on public.admins;
create policy "write users" on public.admins for all to authenticated
  using (public.can('users.manage')) with check (public.can('users.manage'));

-- ---------------------------------------------------------------------
-- 23. Welfare becomes a billable type, and gets its receivable account
-- ---------------------------------------------------------------------
update public.contribution_types ct
   set is_billable = true,
       kind = 'recurring',
       receivable_account_id = coalesce(ct.receivable_account_id, (select id from public.accounts where code = '1200'))
 where lower(ct.name) = 'welfare';

update public.contribution_types ct
   set receivable_account_id = coalesce(ct.receivable_account_id, (select id from public.accounts where code = '1200'))
 where ct.is_billable;

-- ---------------------------------------------------------------------
-- 24. Everyone may edit their own name, phone and photo — nothing else
-- ---------------------------------------------------------------------
create or replace function public.guard_admin_self_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.can('users.manage') then
    if new.user_id is distinct from old.user_id
       or new.role_id is distinct from old.role_id
       or new.is_active is distinct from old.is_active
       or new.group_id is distinct from old.group_id
       or new.ministry is distinct from old.ministry then
      raise exception 'You may only change your own name, phone and photo';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_admin_self_update on public.admins;
create trigger trg_admin_self_update
before update on public.admins
for each row execute function public.guard_admin_self_update();

drop policy if exists "update self" on public.admins;
create policy "update self" on public.admins for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
