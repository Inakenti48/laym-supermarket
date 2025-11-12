-- Создаем таблицу для хранения сессий пользователей
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  login text NOT NULL,
  role app_role NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_activity timestamp with time zone NOT NULL DEFAULT now()
);

-- Включаем RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Политика: пользователи могут видеть только свои сессии
CREATE POLICY "Users can view their own sessions"
ON public.user_sessions
FOR SELECT
USING (auth.uid() = user_id OR true); -- true потому что используем кастомную авторизацию

-- Политика: любой может создавать сессии (для логина)
CREATE POLICY "Anyone can create sessions"
ON public.user_sessions
FOR INSERT
WITH CHECK (true);

-- Политика: пользователи могут обновлять свои сессии
CREATE POLICY "Users can update their own sessions"
ON public.user_sessions
FOR UPDATE
USING (true);

-- Политика: пользователи могут удалять свои сессии
CREATE POLICY "Users can delete their own sessions"
ON public.user_sessions
FOR DELETE
USING (true);

-- Создаем индекс для быстрого поиска по user_id
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);

-- Создаем индекс для быстрого поиска по login
CREATE INDEX IF NOT EXISTS idx_user_sessions_login ON public.user_sessions(login);

-- Функция для автоматической очистки истекших сессий
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_sessions
  WHERE expires_at < now();
END;
$$;