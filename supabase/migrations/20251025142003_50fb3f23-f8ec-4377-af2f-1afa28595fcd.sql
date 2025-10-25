-- Добавляем недостающие поля в таблицу products для полной совместимости с localStorage

-- Добавляем поле unit (единица измерения)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'шт';

-- Добавляем поля для учета оплаты
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'full',
ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS debt_amount numeric NOT NULL DEFAULT 0;

-- Добавляем ограничения на payment_type
ALTER TABLE public.products
ADD CONSTRAINT products_payment_type_check 
CHECK (payment_type IN ('full', 'partial', 'debt'));

-- Добавляем ограничения на суммы (не могут быть отрицательными)
ALTER TABLE public.products
ADD CONSTRAINT products_paid_amount_check CHECK (paid_amount >= 0),
ADD CONSTRAINT products_debt_amount_check CHECK (debt_amount >= 0);

-- Создаем индексы для улучшения производительности поиска
CREATE INDEX IF NOT EXISTS idx_products_unit ON public.products(unit);
CREATE INDEX IF NOT EXISTS idx_products_payment_type ON public.products(payment_type);

COMMENT ON COLUMN public.products.unit IS 'Единица измерения товара (шт, кг)';
COMMENT ON COLUMN public.products.payment_type IS 'Тип оплаты: full (полная), partial (частичная), debt (в долг)';
COMMENT ON COLUMN public.products.paid_amount IS 'Оплаченная сумма';
COMMENT ON COLUMN public.products.debt_amount IS 'Сумма долга';