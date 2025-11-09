-- Create product returns table
CREATE TABLE public.product_returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name TEXT NOT NULL,
  purchase_price NUMERIC NOT NULL,
  quantity INTEGER NOT NULL,
  supplier TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_returns ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can insert returns"
ON public.product_returns
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view returns"
ON public.product_returns
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage returns"
ON public.product_returns
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_returns;