-- Create temporary product photos table
CREATE TABLE IF NOT EXISTS public.vremenno_product_foto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  storage_path TEXT NOT NULL,
  image_url TEXT NOT NULL,
  barcode TEXT NOT NULL,
  product_name TEXT NOT NULL,
  UNIQUE(barcode, product_name)
);

-- Enable RLS
ALTER TABLE public.vremenno_product_foto ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view temporary product photos"
  ON public.vremenno_product_foto
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert temporary product photos"
  ON public.vremenno_product_foto
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can delete their own temporary product photos"
  ON public.vremenno_product_foto
  FOR DELETE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can update their own temporary product photos"
  ON public.vremenno_product_foto
  FOR UPDATE
  USING (auth.uid() = created_by);