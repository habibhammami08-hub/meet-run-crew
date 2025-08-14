-- Add end location columns for arrival point
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS end_lat numeric,
ADD COLUMN IF NOT EXISTS end_lng numeric;

-- Make sure location_lat and location_lng are NOT NULL (departure point is mandatory)
ALTER TABLE public.sessions 
ALTER COLUMN location_lat SET NOT NULL,
ALTER COLUMN location_lng SET NOT NULL;