-- Добавляем поля для двух отдельных фотографий в таблицу временных товаров
ALTER TABLE vremenno_product_foto
ADD COLUMN IF NOT EXISTS front_photo text,
ADD COLUMN IF NOT EXISTS barcode_photo text,
ADD COLUMN IF NOT EXISTS front_photo_storage_path text,
ADD COLUMN IF NOT EXISTS barcode_photo_storage_path text;

-- Обновляем существующие записи: если есть image_url, копируем его в front_photo
UPDATE vremenno_product_foto
SET front_photo = image_url
WHERE front_photo IS NULL AND image_url IS NOT NULL AND image_url != '';