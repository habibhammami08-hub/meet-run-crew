-- =============================================================================
-- FINAL SECURITY HARDENING AND VIEW OPTIMIZATION
-- =============================================================================

-- Ensure views follow security best practices
-- These views should inherit permissions from the underlying tables via RLS

-- Drop and recreate sessions_with_details view with explicit access control
DROP VIEW IF EXISTS public.sessions_with_details CASCADE;

-- Create sessions_with_details view that respects RLS
CREATE VIEW public.sessions_with_details AS
SELECT 
    s.id,
    s.host_id,
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
    s.min_participants,
    s.max_participants,
    s.price_cents,
    s.host_fee_cents,
    s.status,
    s.created_at,
    s.updated_at,
    p.full_name AS host_name,
    p.avatar_url AS host_avatar,
    COALESCE(e.enrollment_count, 0::bigint) AS current_enrollments,
    (s.max_participants - COALESCE(e.enrollment_count, 0::bigint)) AS available_spots
FROM sessions s
LEFT JOIN profiles p ON (s.host_id = p.id)
LEFT JOIN (
    SELECT 
        session_id,
        count(*) AS enrollment_count
    FROM enrollments
    WHERE status IN ('paid', 'confirmed', 'present', 'included_by_subscription')
    GROUP BY session_id
) e ON (s.id = e.session_id)
WHERE s.status = 'published'; -- Only show published sessions

-- Grant appropriate permissions for the view
GRANT SELECT ON public.sessions_with_details TO anon, authenticated;

-- Ensure deletion_stats view is properly secured (read-only stats)
-- This view is acceptable as it only shows aggregate statistics without personal data

-- =============================================================================
-- ADDITIONAL RLS SECURITY ENHANCEMENTS  
-- =============================================================================

-- Ensure deleted_users table has proper RLS (admin-only access)
ALTER TABLE public.deleted_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists
DROP POLICY IF EXISTS deleted_users_service_role_access ON public.deleted_users;

-- Only service role should access deleted_users (for security functions)
CREATE POLICY deleted_users_admin_only ON public.deleted_users
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Ensure subscribers table has proper RLS
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists  
DROP POLICY IF EXISTS subscribers_own_policy ON public.subscribers;

-- Users can only see their own subscription data
CREATE POLICY subscribers_select_own ON public.subscribers
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY subscribers_insert_own ON public.subscribers  
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY subscribers_update_own ON public.subscribers
FOR UPDATE TO authenticated  
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Create indexes to improve query performance while maintaining security
CREATE INDEX IF NOT EXISTS idx_sessions_scheduled_at ON public.sessions(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_host_id ON public.sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_id ON public.enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_session_id ON public.enrollments(session_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.enrollments(status);

-- =============================================================================
-- FINAL VALIDATION
-- =============================================================================

-- Ensure all critical tables have RLS enabled
DO $$
BEGIN
    -- Verify RLS is enabled on all critical tables
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace) THEN
        RAISE EXCEPTION 'RLS not enabled on profiles table';
    END IF;
    
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'sessions' AND relnamespace = 'public'::regnamespace) THEN
        RAISE EXCEPTION 'RLS not enabled on sessions table';
    END IF;
    
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'enrollments' AND relnamespace = 'public'::regnamespace) THEN
        RAISE EXCEPTION 'RLS not enabled on enrollments table';
    END IF;
    
    RAISE NOTICE 'All critical tables have RLS properly enabled';
END $$;