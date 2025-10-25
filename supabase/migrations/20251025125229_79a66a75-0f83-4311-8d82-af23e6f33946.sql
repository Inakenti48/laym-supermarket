-- Настройка автоматической очистки временных фото каждый день в 2:00 ночи
SELECT cron.schedule(
  'cleanup-temporary-photos-daily',
  '0 2 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://rfkfjfvlcushtejkgbmg.supabase.co/functions/v1/cleanup-temporary-photos',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJma2ZqZnZsY3VzaHRlamtnYm1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMTI4NTksImV4cCI6MjA3Njg4ODg1OX0.f-tHNwFh3a4IEBR6U16txF0cmGzXsCwFBOxtQuEPp5g"}'::jsonb,
      body := '{"scheduled": true}'::jsonb
    ) AS request_id;
  $$
);