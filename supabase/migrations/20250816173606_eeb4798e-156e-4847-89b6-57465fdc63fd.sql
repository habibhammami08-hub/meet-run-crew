-- Add blur_radius_m column to sessions table
ALTER TABLE public.sessions 
ADD COLUMN blur_radius_m INTEGER DEFAULT 1000;