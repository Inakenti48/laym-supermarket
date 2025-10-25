-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create product_images table to store product photos
CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT NOT NULL,
  product_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_images
CREATE POLICY "Anyone can view product images"
  ON public.product_images
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert product images"
  ON public.product_images
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own product images"
  ON public.product_images
  FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own product images"
  ON public.product_images
  FOR DELETE
  USING (auth.uid() = created_by);

-- Storage policies for product-images bucket
CREATE POLICY "Public can view product images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can upload product images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can update product images"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can delete product images"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

-- Create index for faster barcode lookups
CREATE INDEX IF NOT EXISTS idx_product_images_barcode 
  ON public.product_images(barcode);

-- Create index for faster date queries
CREATE INDEX IF NOT EXISTS idx_product_images_created_at 
  ON public.product_images(created_at DESC);