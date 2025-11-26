-- Проверяем и создаем публичный bucket для фотографий товаров (если не существует)
DO $$
BEGIN
  -- Проверяем существование bucket
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product-photos') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'product-photos',
      'product-photos',
      true,
      10485760,
      ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
    );
  ELSE
    -- Обновляем существующий bucket на публичный
    UPDATE storage.buckets 
    SET public = true
    WHERE id = 'product-photos';
  END IF;
END $$;