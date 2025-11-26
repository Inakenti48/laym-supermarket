-- Optimize pagination on vremenno_product_foto for queue loading
CREATE INDEX IF NOT EXISTS idx_vremenno_product_foto_created_at
ON public.vremenno_product_foto (created_at);