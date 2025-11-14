-- Создаем индексы для оптимизации загрузки очереди товаров
-- Индекс для сортировки по дате создания (используется при загрузке)
CREATE INDEX IF NOT EXISTS idx_vremenno_product_foto_created_at 
ON vremenno_product_foto(created_at DESC);

-- Индекс для быстрого поиска по штрихкоду
CREATE INDEX IF NOT EXISTS idx_vremenno_product_foto_barcode 
ON vremenno_product_foto(barcode);

-- Индекс для products таблицы для быстрого поиска по штрихкоду
CREATE INDEX IF NOT EXISTS idx_products_barcode 
ON products(barcode);

-- Индекс для быстрой сортировки товаров
CREATE INDEX IF NOT EXISTS idx_products_created_at 
ON products(created_at DESC);