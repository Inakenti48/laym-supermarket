-- Таблица для реал-тайм синхронизации формы добавления товара между админами
CREATE TABLE IF NOT EXISTS public.product_form_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  barcode text,
  name text,
  category text,
  supplier text,
  purchase_price numeric,
  retail_price numeric,
  quantity numeric,
  unit text,
  expiry_date date,
  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Включаем RLS
ALTER TABLE public.product_form_state ENABLE ROW LEVEL SECURITY;

-- Политика: админы могут видеть состояние формы всех других админов
CREATE POLICY "Admins can view all form states"
  ON public.product_form_state
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Политика: пользователи могут вставлять свое состояние формы
CREATE POLICY "Users can insert their own form state"
  ON public.product_form_state
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Политика: пользователи могут обновлять свое состояние формы
CREATE POLICY "Users can update their own form state"
  ON public.product_form_state
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Политика: пользователи могут удалять свое состояние формы
CREATE POLICY "Users can delete their own form state"
  ON public.product_form_state
  FOR DELETE
  USING (auth.uid() = user_id);

-- Включаем realtime
ALTER TABLE public.product_form_state REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_form_state;

-- Автоматическое удаление старых записей (старше 1 часа)
CREATE OR REPLACE FUNCTION public.cleanup_old_form_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.product_form_state
  WHERE last_updated < now() - interval '1 hour';
END;
$$;