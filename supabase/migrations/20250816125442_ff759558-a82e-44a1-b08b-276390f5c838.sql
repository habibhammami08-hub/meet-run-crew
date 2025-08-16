-- Add route-related columns to sessions table (idempotent)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS route_polyline TEXT,
  ADD COLUMN IF NOT EXISTS route_distance_m INTEGER,
  ADD COLUMN IF NOT EXISTS start_place TEXT,
  ADD COLUMN IF NOT EXISTS end_place TEXT;

-- Add total_km to profiles for distance tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_km NUMERIC DEFAULT 0;

-- Create function to mark enrollment completed and add distance to profile
CREATE OR REPLACE FUNCTION public.mark_enrollment_completed(p_session_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  session_distance_km NUMERIC;
BEGIN
  -- Get session distance
  SELECT COALESCE(route_distance_m/1000.0, distance_km, 0) INTO session_distance_km
  FROM sessions 
  WHERE id = p_session_id;
  
  -- Update enrollment status to completed
  UPDATE enrollments 
  SET status = 'completed', updated_at = NOW()
  WHERE session_id = p_session_id AND user_id = p_user_id;
  
  -- Add distance to user profile
  UPDATE profiles 
  SET total_km = COALESCE(total_km, 0) + session_distance_km,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;