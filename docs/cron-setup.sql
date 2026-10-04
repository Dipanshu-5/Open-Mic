-- Run only after deployment. Add site_url and cron_secret through Supabase Vault UI.
-- This script contains no credential values.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('conversation-maintenance','* * * * *',$job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='site_url') || '/api/cron/tick',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
 );
$job$);
