-- Обновляем RLS политики для таблицы products
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;

CREATE POLICY "Anyone can view products"
ON public.products
FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert products"
ON public.products
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update products"
ON public.products
FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete products"
ON public.products
FOR DELETE
USING (true);

-- Обновляем RLS политики для таблицы system_logs
DROP POLICY IF EXISTS "Authenticated users can view logs" ON public.system_logs;
DROP POLICY IF EXISTS "Authenticated users can insert logs" ON public.system_logs;

CREATE POLICY "Anyone can view logs"
ON public.system_logs
FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert logs"
ON public.system_logs
FOR INSERT
WITH CHECK (true);

-- Обновляем RLS политики для таблицы sales
DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Admins can update sales" ON public.sales;

CREATE POLICY "Anyone can view sales"
ON public.sales
FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert sales"
ON public.sales
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update sales"
ON public.sales
FOR UPDATE
USING (true);