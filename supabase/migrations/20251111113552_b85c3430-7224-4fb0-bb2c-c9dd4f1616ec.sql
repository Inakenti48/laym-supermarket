-- Обновляем пользователей с новыми логинами и хешированными паролями
-- SHA-256 хеши для паролей (123456 для всех)
-- Пароль 123456 -> SHA-256 -> 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92

-- Обновляем админа
UPDATE public.user_roles 
SET 
  login = '8080',
  password_hash = crypt('123456', gen_salt('bf'))
WHERE role = 'admin';

-- Обновляем кассира 1
UPDATE public.user_roles 
SET 
  login = '1020',
  password_hash = crypt('123456', gen_salt('bf'))
WHERE role = 'cashier';

-- Обновляем кассира 2
UPDATE public.user_roles 
SET 
  login = '2030',
  password_hash = crypt('123456', gen_salt('bf'))
WHERE role = 'cashier2';

-- Обновляем складского
UPDATE public.user_roles 
SET 
  login = '3040',
  password_hash = crypt('123456', gen_salt('bf'))
WHERE role = 'inventory';