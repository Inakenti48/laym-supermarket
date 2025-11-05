-- Добавляем поле login в таблицу user_roles для входа по логину
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS login text UNIQUE;

-- Добавляем поле password_hash для хранения пароля (только для входа по логину)
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS password_hash text;

-- Обновляем данные для существующих пользователей
UPDATE public.user_roles SET login = 'admin' WHERE role = 'admin';

-- Создаем функцию для проверки логина и пароля
CREATE OR REPLACE FUNCTION public.verify_login_credentials(_login text, _password text)
RETURNS TABLE(user_id uuid, role app_role, success boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ur.user_id, ur.role, (ur.password_hash = crypt(_password, ur.password_hash)) as success
  FROM public.user_roles ur
  WHERE ur.login = _login AND ur.password_hash IS NOT NULL;
END;
$$;

-- Включаем расширение pgcrypto если его нет
CREATE EXTENSION IF NOT EXISTS pgcrypto;