-- Добавляем поля товара в таблицу временных товаров
ALTER TABLE vremenno_product_foto
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS supplier text,
ADD COLUMN IF NOT EXISTS unit text DEFAULT 'шт',
ADD COLUMN IF NOT EXISTS purchase_price numeric,
ADD COLUMN IF NOT EXISTS retail_price numeric,
ADD COLUMN IF NOT EXISTS quantity integer,
ADD COLUMN IF NOT EXISTS expiry_date date,
ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'full',
ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS debt_amount numeric DEFAULT 0;