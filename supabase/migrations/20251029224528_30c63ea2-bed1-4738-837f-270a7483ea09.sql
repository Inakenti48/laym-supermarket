-- Обновляем триггер чтобы назначать правильные роли на основе email
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.assign_admin_role();

CREATE OR REPLACE FUNCTION public.assign_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Определяем роль на основе email
  IF NEW.email = 'admin@system.local' THEN
    user_role := 'admin';
  ELSIF NEW.email = 'cashier1@system.local' THEN
    user_role := 'cashier';
  ELSIF NEW.email = 'cashier2@system.local' THEN
    user_role := 'cashier2';
  ELSIF NEW.email = 'inventory@system.local' THEN
    user_role := 'inventory';
  ELSE
    user_role := 'employee';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_user_role();

-- Создаем пользователей для разных ролей

-- Касса 1 (cashier1@system.local, пароль: 1020)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  is_super_admin,
  is_sso_user
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'cashier1@system.local',
  crypt('1020', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"cashier_name":"Касса 1"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  '',
  FALSE,
  FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'cashier1@system.local'
);

-- Касса 2 (cashier2@system.local, пароль: 2030)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  is_super_admin,
  is_sso_user
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'cashier2@system.local',
  crypt('2030', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"cashier_name":"Касса 2"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  '',
  FALSE,
  FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'cashier2@system.local'
);

-- Склад (inventory@system.local, пароль: 3040)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  is_super_admin,
  is_sso_user
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'inventory@system.local',
  crypt('3040', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  '',
  FALSE,
  FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'inventory@system.local'
);