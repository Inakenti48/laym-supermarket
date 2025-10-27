-- Удаляем старые RLS политики для suppliers
DROP POLICY IF EXISTS "Admin and inventory can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON public.suppliers;

-- Создаем новые политики которые позволяют работу без аутентификации Supabase
-- (так как приложение использует свою систему аутентификации)

-- Разрешаем всем просматривать поставщиков
CREATE POLICY "Anyone can view suppliers"
ON public.suppliers
FOR SELECT
USING (true);

-- Разрешаем всем добавлять поставщиков
CREATE POLICY "Anyone can insert suppliers"
ON public.suppliers
FOR INSERT
WITH CHECK (true);

-- Разрешаем всем обновлять поставщиков
CREATE POLICY "Anyone can update suppliers"
ON public.suppliers
FOR UPDATE
USING (true);

-- Разрешаем всем удалять поставщиков
CREATE POLICY "Anyone can delete suppliers"
ON public.suppliers
FOR DELETE
USING (true);