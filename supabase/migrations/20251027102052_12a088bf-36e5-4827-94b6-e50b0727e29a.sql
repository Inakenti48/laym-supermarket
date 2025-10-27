-- Удаляем старые RLS политики для products
DROP POLICY IF EXISTS "Admin and inventory can insert products" ON public.products;
DROP POLICY IF EXISTS "Admin and inventory can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Only admins can delete products" ON public.products;

-- Создаем новые политики которые позволяют работу без аутентификации Supabase
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