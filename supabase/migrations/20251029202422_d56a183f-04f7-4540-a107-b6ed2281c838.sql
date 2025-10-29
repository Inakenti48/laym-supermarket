-- Создаем таблицу sales для хранения продаж
CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_name text NOT NULL,
  cashier_role text NOT NULL,
  items jsonb NOT NULL,
  total numeric NOT NULL,
  payment_method text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  synced boolean DEFAULT false,
  offline_id text,
  UNIQUE(offline_id)
);

-- Включаем RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Политики для sales
CREATE POLICY "Authenticated users can view sales"
ON public.sales FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert sales"
ON public.sales FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update sales"
ON public.sales FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Создаем функцию для автоматического создания профиля при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

-- Создаем триггер для автоматического создания профиля
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Разрешаем вставку профилей через триггер
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;
CREATE POLICY "System can insert profiles"
ON public.profiles FOR INSERT
WITH CHECK (true);

-- Включаем realtime для sales
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;