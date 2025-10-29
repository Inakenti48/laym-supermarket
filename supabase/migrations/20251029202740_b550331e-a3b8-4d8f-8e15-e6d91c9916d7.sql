-- Добавляем cashier2 в enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier2';