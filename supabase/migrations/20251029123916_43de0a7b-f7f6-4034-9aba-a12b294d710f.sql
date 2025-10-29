-- Обновляем политику для загрузки фото товаров
-- Разрешаем всем загружать фото в product-images
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;

CREATE POLICY "Anyone can upload product images"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'product-images');

-- Обновляем политику вставки в таблицу product_images
-- Разрешаем всем добавлять записи о фото товаров
DROP POLICY IF EXISTS "Authenticated users can insert product images" ON product_images;

CREATE POLICY "Anyone can insert product images"
ON product_images
FOR INSERT
TO public
WITH CHECK (true);