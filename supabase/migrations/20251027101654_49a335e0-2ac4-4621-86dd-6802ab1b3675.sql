-- Удаляем старые RLS политики для system_logs
DROP POLICY IF EXISTS "Admins can view all logs" ON public.system_logs;
DROP POLICY IF EXISTS "Authenticated users can insert logs" ON public.system_logs;

-- Создаем новые политики которые позволяют работу без аутентификации Supabase
CREATE POLICY "Anyone can view logs"
ON public.system_logs
FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert logs"
ON public.system_logs
FOR INSERT
WITH CHECK (true);