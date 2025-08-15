-- =====================================================
-- CRITICAL SECURITY FIXES - PRODUCTION READY
-- Fix RLS policies to prevent data exposure
-- =====================================================

-- =====================================================
-- 1. FIX PROFILES TABLE - RESTRICT PUBLIC ACCESS
-- =====================================================

-- Remove overly permissive public access to profiles
DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;

-- Create limited public access only for essential session host information
CREATE POLICY "profiles_session_hosts_only" ON public.profiles
  FOR SELECT USING (
    -- Only allow viewing profiles of session hosts for published sessions
    id IN (
      SELECT DISTINCT host_id 
      FROM public.sessions 
      WHERE status = 'published'
    )
  );

-- Allow users to view their own profile
CREATE POLICY "profiles_own_profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- =====================================================
-- 2. FIX ENROLLMENTS TABLE - RESTRICT ACCESS
-- =====================================================

-- Remove public access policy
DROP POLICY IF EXISTS "Users can view enrollments" ON public.enrollments;

-- Create restrictive policies for enrollments
CREATE POLICY "enrollments_own_only" ON public.enrollments
  FOR SELECT USING (
    auth.uid() = user_id  -- Users can only see their own enrollments
  );

CREATE POLICY "enrollments_session_hosts" ON public.enrollments
  FOR SELECT USING (
    -- Session hosts can view enrollments for their sessions
    auth.uid() IN (
      SELECT host_id 
      FROM public.sessions 
      WHERE id = enrollments.session_id
    )
  );

-- =====================================================
-- 3. FIX SUBSCRIBERS TABLE - RESTRICT TO OWN RECORDS
-- =====================================================

-- Update overly permissive policies
DROP POLICY IF EXISTS "update_own_subscription" ON public.subscribers;
DROP POLICY IF EXISTS "insert_subscription" ON public.subscribers;

-- Create secure subscription policies
CREATE POLICY "subscribers_own_only" ON public.subscribers
  FOR SELECT USING (
    auth.uid() = user_id OR auth.email() = email
  );

CREATE POLICY "subscribers_insert_own" ON public.subscribers
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND auth.email() = email
  );

CREATE POLICY "subscribers_update_own" ON public.subscribers
  FOR UPDATE USING (
    auth.uid() = user_id OR auth.email() = email
  );

-- =====================================================
-- 4. CREATE SECURE PUBLIC VIEW FOR SESSION DISPLAY
-- =====================================================

-- Drop and recreate the sessions_complete view to ensure it's properly secured
DROP VIEW IF EXISTS public.sessions_complete CASCADE;

-- Create a secure view that only exposes necessary public information
CREATE VIEW public.sessions_complete AS
SELECT 
  s.id,
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
  -- Only expose host's display name and avatar, not sensitive info
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  -- Enrollment counts (safe public information)
  COALESCE(e.enrollment_count, 0) as current_enrollments,
  (s.max_participants - COALESCE(e.enrollment_count, 0)) as available_spots
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_id = p.id
LEFT JOIN (
  SELECT 
    session_id, 
    COUNT(*) as enrollment_count
  FROM public.enrollments 
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
) e ON s.id = e.session_id
WHERE s.status = 'published';  -- Only show published sessions

-- =====================================================
-- 5. VERIFICATION AND CLEANUP
-- =====================================================

-- Verify RLS is enabled on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Final security check
SELECT 
  'SECURITY AUDIT COMPLETE' as status,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'sessions', 'enrollments', 'subscribers', 'registrations')
ORDER BY tablename;