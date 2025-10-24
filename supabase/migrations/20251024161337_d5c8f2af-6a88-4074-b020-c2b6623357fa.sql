-- Create storage bucket for product photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-photos',
  'product-photos',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
);

-- Create RLS policies for product photos bucket
CREATE POLICY "Anyone can view product photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-photos');

CREATE POLICY "Authenticated users can upload product photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-photos' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update product photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete product photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-photos' AND auth.role() = 'authenticated');