-- Включаем realtime для таблицы devices
ALTER TABLE public.devices REPLICA IDENTITY FULL;

-- Добавляем таблицу в публикацию supabase_realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;