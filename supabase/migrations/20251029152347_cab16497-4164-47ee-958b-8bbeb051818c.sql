-- Enable realtime for all tables to sync data across devices
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cancellation_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_images;