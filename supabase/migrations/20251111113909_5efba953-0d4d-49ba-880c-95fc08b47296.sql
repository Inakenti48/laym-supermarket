-- Удаляем поле password_hash из user_roles - теперь вход только по логину
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS password_hash;

-- Обновляем функцию проверки - теперь проверяем только логин (без пароля)
CREATE OR REPLACE FUNCTION public.verify_login_credentials(_login text, _password text DEFAULT NULL)
RETURNS TABLE(user_id uuid, role app_role, success boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Теперь проверяем только логин, пароль игнорируется
  RETURN QUERY
  SELECT ur.user_id, ur.role, true as success
  FROM public.user_roles ur
  WHERE ur.login = _login;
END;
$function$;