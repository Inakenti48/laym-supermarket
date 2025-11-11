-- Обновляем RLS политики для таблицы suppliers
-- Разрешаем всем просматривать поставщиков
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated users can manage suppliers" ON public.suppliers;

CREATE POLICY "Anyone can view suppliers"
ON public.suppliers
FOR SELECT
USING (true);

CREATE POLICY "Anyone can manage suppliers"
ON public.suppliers
FOR ALL
USING (true)
WITH CHECK (true);