-- Replace the placeholder values before running this script.
-- Recommended order:
-- 1. Store your project URL, anon key, and optional cron secret in Vault.
-- 2. Schedule the main runner every 30 minutes.
-- 3. Schedule the watchdog every 60 minutes.

select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'job_radar_project_url')
where not exists (
  select 1 from vault.decrypted_secrets where name = 'job_radar_project_url'
);

select vault.create_secret('YOUR_SUPABASE_ANON_KEY', 'job_radar_anon_key')
where not exists (
  select 1 from vault.decrypted_secrets where name = 'job_radar_anon_key'
);

select vault.create_secret('YOUR_JOB_RADAR_CRON_SECRET', 'job_radar_cron_secret')
where not exists (
  select 1 from vault.decrypted_secrets where name = 'job_radar_cron_secret'
);

select cron.schedule(
  'job-radar-run-every-30-minutes',
  '*/30 * * * *',
  $$
  select
    net.http_post(
      url:=(
        select decrypted_secret from vault.decrypted_secrets where name = 'job_radar_project_url'
      ) || '/functions/v1/job-radar-run',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'job_radar_anon_key'
        ),
        'x-job-radar-secret', (
          select decrypted_secret from vault.decrypted_secrets where name = 'job_radar_cron_secret'
        )
      ),
      body:='{}'::jsonb
    ) as request_id;
  $$
);

select cron.schedule(
  'job-radar-watchdog-hourly',
  '15 * * * *',
  $$
  select
    net.http_post(
      url:=(
        select decrypted_secret from vault.decrypted_secrets where name = 'job_radar_project_url'
      ) || '/functions/v1/job-radar-watchdog',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'job_radar_anon_key'
        ),
        'x-job-radar-secret', (
          select decrypted_secret from vault.decrypted_secrets where name = 'job_radar_cron_secret'
        )
      ),
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- To remove the schedules later:
-- select cron.unschedule('job-radar-run-every-30-minutes');
-- select cron.unschedule('job-radar-watchdog-hourly');
