-- =====================================================================
-- Optional: send birthday messages automatically every morning
--
-- Without this, birthday messages are sent from the Birthdays page with
-- one tap. With it, Supabase does it for you at 7am every day.
--
-- Before running, replace:
--   YOUR-PROJECT-REF  with your project ref (in your Supabase URL)
--   YOUR-CRON-SECRET  with the secret shown in Settings → Automatic messages
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('church-birthday-sms')
 where exists (select 1 from cron.job where jobname = 'church-birthday-sms');

select cron.schedule(
  'church-birthday-sms',
  '0 7 * * *',                    -- every day at 07:00 (server time, UTC)
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-sms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body    := jsonb_build_object('task', 'birthdays')
  );
  $$
);

-- To check on it later:        select * from cron.job;
-- To see what it has done:     select * from cron.job_run_details order by start_time desc limit 10;
-- To switch it off:            select cron.unschedule('church-birthday-sms');
