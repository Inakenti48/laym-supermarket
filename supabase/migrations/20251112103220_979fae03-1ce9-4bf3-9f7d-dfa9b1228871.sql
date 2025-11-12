-- Drop existing restrictive policies on product_images
DROP POLICY IF EXISTS "Authenticated users can insert product images" ON product_images;
DROP POLICY IF EXISTS "Authenticated users can update product images" ON product_images;
DROP POLICY IF EXISTS "Authenticated users can delete product images" ON product_images;
DROP POLICY IF EXISTS "Authenticated users can view product images" ON product_images;

-- Create new permissive policies that work with custom authentication
CREATE POLICY "Anyone can view product images"
ON product_images FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert product images"
ON product_images FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update product images"
ON product_images FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete product images"
ON product_images FOR DELETE
USING (true);