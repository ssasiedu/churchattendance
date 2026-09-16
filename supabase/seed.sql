-- =====================================================================
-- OPTIONAL demo data: 40 members, 6 months of Sunday + midweek services,
-- and randomised attendance so the dashboard has something to show.
-- Run AFTER schema.sql. To remove later:
--   truncate public.attendance, public.services, public.members cascade;
-- =====================================================================

insert into public.members (full_name, phone, gender, age_group, department, member_type, joined_on) values
  ('Abena Mensah',        '0240000001', 'Female', 'Adults',       'Choir',          'Worker',      current_date - 400),
  ('Kwame Asante',        '0240000002', 'Male',   'Adults',       'Ushering',       'Worker',      current_date - 400),
  ('Esi Boateng',         '0240000003', 'Female', 'Young Adults', 'Media',          'Member',      current_date - 400),
  ('Kofi Owusu',          '0240000004', 'Male',   'Seniors',      'Elders',         'Worker',      current_date - 400),
  ('Ama Serwaa',          '0240000005', 'Female', 'Youth',        'Youth Ministry', 'Member',      current_date - 400),
  ('Yaw Darko',           '0240000006', 'Male',   'Young Adults', 'Media',          'Member',      current_date - 400),
  ('Akosua Frimpong',     '0240000007', 'Female', 'Adults',       'Women''s Ministry','Member',    current_date - 400),
  ('Samuel Addo',         '0240000008', 'Male',   'Adults',       'Men''s Fellowship','Member',    current_date - 400),
  ('Grace Ofori',         '0240000009', 'Female', 'Seniors',      'Prayer Team',    'Worker',      current_date - 400),
  ('Daniel Tetteh',       '0240000010', 'Male',   'Youth',        'Youth Ministry', 'Member',      current_date - 400),
  ('Mary Quaye',          '0240000011', 'Female', 'Adults',       'Choir',          'Member',      current_date - 400),
  ('Joseph Amoah',        '0240000012', 'Male',   'Adults',       'Ushering',       'Worker',      current_date - 400),
  ('Priscilla Agyei',     '0240000013', 'Female', 'Young Adults', 'Choir',          'Member',      current_date - 400),
  ('Emmanuel Nkrumah',    '0240000014', 'Male',   'Adults',       'Protocol',       'Worker',      current_date - 400),
  ('Comfort Adjei',       '0240000015', 'Female', 'Seniors',      'Women''s Ministry','Member',    current_date - 400),
  ('Isaac Bonsu',         '0240000016', 'Male',   'Youth',        'Media',          'Member',      current_date - 400),
  ('Linda Osei',          '0240000017', 'Female', 'Adults',       'Children''s Ministry','Worker', current_date - 400),
  ('Michael Appiah',      '0240000018', 'Male',   'Young Adults', 'Men''s Fellowship','Member',    current_date - 400),
  ('Ruth Antwi',          '0240000019', 'Female', 'Children',     'Children''s Ministry','Member', current_date - 400),
  ('Peter Sarpong',       '0240000020', 'Male',   'Children',     'Children''s Ministry','Member', current_date - 400),
  ('Hannah Baah',         '0240000021', 'Female', 'Adults',       'Prayer Team',    'Member',      current_date - 400),
  ('Stephen Kyei',        '0240000022', 'Male',   'Seniors',      'Elders',         'Worker',      current_date - 400),
  ('Deborah Ansah',       '0240000023', 'Female', 'Youth',        'Choir',          'Member',      current_date - 400),
  ('Francis Opoku',       '0240000024', 'Male',   'Adults',       'Protocol',       'Member',      current_date - 400),
  ('Joyce Amponsah',      '0240000025', 'Female', 'Young Adults', 'Women''s Ministry','Member',    current_date - 400),
  ('Charles Wiredu',      '0240000026', 'Male',   'Adults',       'Men''s Fellowship','Member',    current_date - 400),
  ('Patience Acheampong', '0240000027', 'Female', 'Adults',       'Ushering',       'Member',      current_date - 400),
  ('George Manu',         '0240000028', 'Male',   'Young Adults', null,             'New Convert', current_date - 120),
  ('Rebecca Yeboah',      '0240000029', 'Female', 'Youth',        null,             'New Convert', current_date - 90),
  ('Paul Oduro',          '0240000030', 'Male',   'Adults',       null,             'New Convert', current_date - 60),
  ('Sarah Asiedu',        '0240000031', 'Female', 'Adults',       null,             'Visitor',     current_date - 150),
  ('David Gyamfi',        '0240000032', 'Male',   'Young Adults', null,             'Visitor',     current_date - 45),
  ('Naomi Kusi',          '0240000033', 'Female', 'Children',     'Children''s Ministry','Member', current_date - 400),
  ('John Badu',           '0240000034', 'Male',   'Children',     'Children''s Ministry','Member', current_date - 400),
  ('Lydia Awuah',         '0240000035', 'Female', 'Seniors',      'Prayer Team',    'Member',      current_date - 400),
  ('Andrews Fosu',        '0240000036', 'Male',   'Adults',       'Media',          'Worker',      current_date - 400),
  ('Martha Oppong',       '0240000037', 'Female', 'Adults',       'Choir',          'Member',      current_date - 400),
  ('Benjamin Koomson',    '0240000038', 'Male',   'Youth',        'Youth Ministry', 'Member',      current_date - 400),
  ('Eunice Pobee',        '0240000039', 'Female', 'Young Adults', 'Protocol',       'Member',      current_date - 30),
  ('Thomas Quarshie',     '0240000040', 'Male',   'Seniors',      'Elders',         'Member',      current_date - 400);

-- Sundays for the last ~26 weeks
insert into public.services (title, service_type, service_date, is_open)
select 'Sunday Service', 'Sunday Service', d::date, false
from generate_series(
  date_trunc('week', current_date) - interval '26 weeks' + interval '6 days',
  current_date - 1,
  interval '7 days'
) as d;

-- Wednesdays for the last ~26 weeks
insert into public.services (title, service_type, service_date, is_open)
select 'Midweek Bible Study', 'Midweek Service', d::date, false
from generate_series(
  date_trunc('week', current_date) - interval '26 weeks' + interval '2 days',
  current_date - 1,
  interval '7 days'
) as d;

-- Random attendance, weighted by member type and service type
insert into public.attendance (service_id, member_id, checked_in_at, method)
select s.id,
       m.id,
       (s.service_date + time '08:30' + random() * interval '90 minutes'),
       'self'
from public.services s
cross join public.members m
where m.joined_on <= s.service_date
  and random() < (
        case m.member_type
          when 'Worker'      then 0.92
          when 'Member'      then 0.72
          when 'New Convert' then 0.55
          else 0.35
        end
      * case when s.service_type = 'Midweek Service' then 0.55 else 1 end
      * (0.9 + extract(month from s.service_date)::int % 3 * 0.05)
  );
