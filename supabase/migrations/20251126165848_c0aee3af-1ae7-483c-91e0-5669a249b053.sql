-- Добавляем индексы для ускорения работы с большой очередью товаров
CREATE INDEX IF NOT EXISTS idx_vremenno_product_foto_created_at 
ON vremenno_product_foto(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vremenno_product_foto_barcode 
ON vremenno_product_foto(barcode);

-- Индекс для быстрого поиска по штрихкоду при проверке дубликатов
CREATE INDEX IF NOT EXISTS idx_products_barcode 
ON products(barcode);