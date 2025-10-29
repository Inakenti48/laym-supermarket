-- =====================================================
-- CRITICAL SECURITY FIX: Lock down public database access
-- =====================================================

-- 1. Make storage buckets PRIVATE
UPDATE storage.buckets 
SET public = false 
WHERE id IN ('product-photos', 'product-images');

-- 2. Remove dangerous public policies on products table
DROP POLICY IF EXISTS "Anyone can view products" ON products;
DROP POLICY IF EXISTS "Anyone can insert products" ON products;
DROP POLICY IF EXISTS "Anyone can update products" ON products;
DROP POLICY IF EXISTS "Anyone can delete products" ON products;

-- Add secure authenticated policies for products
CREATE POLICY "Authenticated users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 3. Lock down suppliers table
DROP POLICY IF EXISTS "Anyone can view suppliers" ON suppliers;
DROP POLICY IF EXISTS "Anyone can insert suppliers" ON suppliers;
DROP POLICY IF EXISTS "Anyone can update suppliers" ON suppliers;
DROP POLICY IF EXISTS "Anyone can delete suppliers" ON suppliers;

CREATE POLICY "Authenticated users can view suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 4. Lock down system_logs table
DROP POLICY IF EXISTS "Anyone can view logs" ON system_logs;
DROP POLICY IF EXISTS "Anyone can insert logs" ON system_logs;

CREATE POLICY "Authenticated users can view logs"
  ON system_logs FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert logs"
  ON system_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Lock down product_images table - drop existing first
DROP POLICY IF EXISTS "Anyone can insert product images" ON product_images;
DROP POLICY IF EXISTS "Anyone can view product images" ON product_images;
DROP POLICY IF EXISTS "Users can update their own product images" ON product_images;
DROP POLICY IF EXISTS "Users can delete their own product images" ON product_images;

CREATE POLICY "Authenticated users can view product images"
  ON product_images FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert product images"
  ON product_images FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update product images"
  ON product_images FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Authenticated users can delete product images"
  ON product_images FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by OR created_by IS NULL);

-- 6. Secure storage.objects policies
DROP POLICY IF EXISTS "Anyone can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own images" ON storage.objects;

-- Authenticated users can upload to both buckets
CREATE POLICY "Authenticated can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id IN ('product-images', 'product-photos') AND auth.uid() IS NOT NULL);

-- Authenticated users can view images
CREATE POLICY "Authenticated can view product images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id IN ('product-images', 'product-photos'));

-- Users can update their own uploads
CREATE POLICY "Authenticated users can update images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id IN ('product-images', 'product-photos') AND (owner = auth.uid() OR owner IS NULL));

-- Users can delete their own uploads
CREATE POLICY "Authenticated users can delete images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id IN ('product-images', 'product-photos') AND (owner = auth.uid() OR owner IS NULL));

-- 7. Add roles for the inventory system
DO $$ 
BEGIN
  ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'cashier';
  ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'inventory';
  ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'employee';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;