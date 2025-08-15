-- =====================================================
-- PERFORMANCE & OBSERVABILITY IMPROVEMENTS - FIXED
-- Implementation of production-ready optimizations
-- =====================================================

-- =====================================================
-- 1. PERFORMANCE RLS OPTIMIZATION
-- =====================================================

-- Create SECURITY DEFINER functions to avoid RLS overhead in complex queries
CREATE OR REPLACE FUNCTION public.get_user_sessions(user_id uuid)
RETURNS TABLE(
  session_id uuid,
  title text,
  description text,
  scheduled_at timestamptz,
  duration_minutes integer,
  start_lat numeric,
  start_lng numeric,
  end_lat numeric,
  end_lng numeric,
  location_hint text,
  distance_km numeric,
  intensity text,
  session_type text,
  max_participants integer,
  min_participants integer,
  price_cents integer,
  host_fee_cents integer,
  status text,
  created_at timestamptz,
  host_name text,
  host_avatar text,
  current_enrollments bigint,
  available_spots bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Direct query without RLS overhead for user's own sessions
  RETURN QUERY 
  SELECT 
    s.id as session_id,
    s.title,
    s.description,
    s.scheduled_at,
    s.duration_minutes,
    s.start_lat,
    s.start_lng,
    s.end_lat,
    s.end_lng,
    s.location_hint,
    s.distance_km,
    s.intensity,
    s.session_type,
    s.max_participants,
    s.min_participants,
    s.price_cents,
    s.host_fee_cents,
    s.status,
    s.created_at,
    p.full_name as host_name,
    p.avatar_url as host_avatar,
    COALESCE(e.enrollment_count, 0) as current_enrollments,
    (s.max_participants - COALESCE(e.enrollment_count, 0)) as available_spots
  FROM sessions s
  JOIN profiles p ON s.host_id = p.id
  LEFT JOIN (
    SELECT 
      session_id, 
      COUNT(*) as enrollment_count
    FROM enrollments 
    WHERE status IN ('paid', 'confirmed', 'present')
    GROUP BY session_id
  ) e ON s.id = e.session_id
  WHERE s.host_id = user_id;
END;
$$;

-- Optimized function for getting user enrollments
CREATE OR REPLACE FUNCTION public.get_user_enrollments(user_id uuid)
RETURNS TABLE(
  enrollment_id uuid,
  session_id uuid,
  session_title text,
  session_date timestamptz,
  host_name text,
  enrollment_status text,
  amount_paid_cents integer,
  paid_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as enrollment_id,
    s.id as session_id,
    s.title as session_title,
    s.scheduled_at as session_date,
    p.full_name as host_name,
    e.status as enrollment_status,
    e.amount_paid_cents,
    e.paid_at
  FROM enrollments e
  JOIN sessions s ON e.session_id = s.id
  JOIN profiles p ON s.host_id = p.id
  WHERE e.user_id = user_id
  ORDER BY s.scheduled_at DESC;
END;
$$;

-- =====================================================
-- 2. STRATEGIC DENORMALIZATION
-- =====================================================

-- Add denormalized fields to avoid JOINs in frequent queries
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS host_name text,
ADD COLUMN IF NOT EXISTS host_avatar text,
ADD COLUMN IF NOT EXISTS current_enrollments integer DEFAULT 0;

-- Function to update denormalized data
CREATE OR REPLACE FUNCTION public.update_session_denormalized_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update host information when profile changes
  IF TG_TABLE_NAME = 'profiles' THEN
    UPDATE sessions 
    SET 
      host_name = NEW.full_name,
      host_avatar = NEW.avatar_url
    WHERE host_id = NEW.id;
    RETURN NEW;
  END IF;
  
  -- Update enrollment count when enrollments change
  IF TG_TABLE_NAME = 'enrollments' THEN
    UPDATE sessions 
    SET current_enrollments = (
      SELECT COUNT(*) 
      FROM enrollments 
      WHERE session_id = COALESCE(NEW.session_id, OLD.session_id)
        AND status IN ('paid', 'confirmed', 'present')
    )
    WHERE id = COALESCE(NEW.session_id, OLD.session_id);
    
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create triggers for denormalization
DROP TRIGGER IF EXISTS update_sessions_on_profile_change ON public.profiles;
CREATE TRIGGER update_sessions_on_profile_change
  AFTER UPDATE OF full_name, avatar_url ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_session_denormalized_data();

DROP TRIGGER IF EXISTS update_sessions_on_enrollment_change ON public.enrollments;
CREATE TRIGGER update_sessions_on_enrollment_change
  AFTER INSERT OR UPDATE OR DELETE ON public.enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_session_denormalized_data();