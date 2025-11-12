-- Обновляем RLS политики для vremenno_product_foto, чтобы они работали с кастомной авторизацией
-- Разрешаем всем создавать, обновлять и удалять записи

DROP POLICY IF EXISTS "Authenticated users can insert temporary product photos" ON vremenno_product_foto;
DROP POLICY IF EXISTS "Users can update their own temporary product photos" ON vremenno_product_foto;
DROP POLICY IF EXISTS "Users can delete their own temporary product photos" ON vremenno_product_foto;

-- Новые политики, которые не зависят от Supabase Auth
CREATE POLICY "Anyone can insert temporary product photos"
ON vremenno_product_foto
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Anyone can update temporary product photos"
ON vremenno_product_foto
FOR UPDATE
TO public
USING (true);

CREATE POLICY "Anyone can delete temporary product photos"
ON vremenno_product_foto
FOR DELETE
TO public
USING (true);