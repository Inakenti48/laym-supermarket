-- Исправление RLS политик для storage bucket product-photos
-- Разрешаем аутентифицированным пользователям загружать файлы во временную папку

-- Удаляем старые политики если они есть
DROP POLICY IF EXISTS "Allow authenticated users to upload to temporary folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to read temporary photos" ON storage.objects;

-- Создаем политику для загрузки во временную папку
CREATE POLICY "Allow authenticated users to upload to temporary folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-photos' 
  AND (storage.foldername(name))[1] = 'temporary'
);

-- Создаем политику для чтения временных фото
CREATE POLICY "Allow authenticated users to read temporary photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-photos' 
  AND (storage.foldername(name))[1] = 'temporary'
);