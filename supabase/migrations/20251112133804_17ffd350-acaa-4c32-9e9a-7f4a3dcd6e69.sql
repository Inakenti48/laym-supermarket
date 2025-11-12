-- Create devices table to track all devices
CREATE TABLE public.devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  device_name TEXT NOT NULL,
  can_save_single BOOLEAN NOT NULL DEFAULT true,
  can_save_queue BOOLEAN NOT NULL DEFAULT true,
  last_active TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Admins can view all devices
CREATE POLICY "Admins can view all devices"
ON public.devices
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own device
CREATE POLICY "Users can view their own device"
ON public.devices
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own device
CREATE POLICY "Users can insert their own device"
ON public.devices
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own device
CREATE POLICY "Users can update their own device"
ON public.devices
FOR UPDATE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_devices_user_id ON public.devices(user_id);
CREATE INDEX idx_devices_last_active ON public.devices(last_active DESC);