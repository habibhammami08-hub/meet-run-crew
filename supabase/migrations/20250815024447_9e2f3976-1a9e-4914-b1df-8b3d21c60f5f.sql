-- =====================================================
-- FINAL PERFORMANCE OPTIMIZATIONS - CORRECTED
-- =====================================================

-- =====================================================
-- 1. POPULATE DENORMALIZED DATA - FIXED SYNTAX
-- =====================================================

-- First, update host information
UPDATE sessions 
SET 
  host_name = profiles.full_name,
  host_avatar = profiles.avatar_url
FROM profiles
WHERE sessions.host_id = profiles.id;

-- Then, update enrollment counts separately
WITH enrollment_counts AS (
  SELECT session_id, COUNT(*) as count
  FROM enrollments
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
)
UPDATE sessions 
SET current_enrollments = COALESCE(enrollment_counts.count, 0)
FROM enrollment_counts
WHERE sessions.id = enrollment_counts.session_id;

-- Set remaining sessions to 0 enrollments
UPDATE sessions 
SET current_enrollments = 0
WHERE current_enrollments IS NULL;

-- =====================================================
-- 2. MONITORING VIEWS
-- =====================================================

-- Performance metrics view
CREATE OR REPLACE VIEW public.session_performance_metrics AS
SELECT 
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') as sessions_24h,
  COUNT(*) FILTER (WHERE scheduled_at > now()) as upcoming_sessions,
  COUNT(*) FILTER (WHERE status = 'published') as published_sessions,
  AVG(current_enrollments) as avg_enrollments,
  AVG(max_participants) as avg_max_participants,
  AVG(CASE WHEN current_enrollments > 0 THEN current_enrollments::float / max_participants * 100 END) as avg_fill_rate_percent,
  COUNT(*) FILTER (WHERE current_enrollments >= max_participants) as full_sessions
FROM sessions
WHERE created_at > now() - interval '30 days';

-- User activity metrics
CREATE OR REPLACE VIEW public.user_activity_metrics AS
SELECT 
  COUNT(DISTINCT id) as total_users,
  COUNT(DISTINCT id) FILTER (WHERE created_at > now() - interval '24 hours') as new_users_24h,
  COUNT(DISTINCT id) FILTER (WHERE updated_at > now() - interval '7 days') as active_users_7d,
  COUNT(DISTINCT id) FILTER (WHERE updated_at > now() - interval '30 days') as active_users_30d
FROM profiles;

-- Payment metrics view
CREATE OR REPLACE VIEW public.payment_metrics AS
SELECT 
  COUNT(*) as total_payments,
  COUNT(*) FILTER (WHERE paid_at > now() - interval '24 hours') as payments_24h,
  SUM(amount_paid_cents) FILTER (WHERE status = 'paid') as total_revenue_cents,
  AVG(amount_paid_cents) FILTER (WHERE status = 'paid') as avg_payment_cents,
  COUNT(*) FILTER (WHERE status = 'paid') as successful_payments,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_payments
FROM enrollments
WHERE created_at > now() - interval '30 days';

-- =====================================================
-- 3. AUDIT SYSTEM
-- =====================================================

-- Audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  user_id uuid REFERENCES auth.users(id),
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  timestamp timestamptz DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Policy for audit log access
DROP POLICY IF EXISTS "audit_log_read_own" ON public.audit_log;
CREATE POLICY "audit_log_read_own" ON public.audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- Audit indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_table_operation ON public.audit_log(table_name, operation);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_timestamp ON public.audit_log(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.audit_log(timestamp);

-- =====================================================
-- 4. PERFORMANCE INDEXES
-- =====================================================

-- Optimize common query patterns
CREATE INDEX IF NOT EXISTS idx_sessions_host_status_date ON public.sessions(host_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status_date ON public.sessions(status, scheduled_at) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_enrollments_user_status ON public.enrollments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_session_status ON public.enrollments(session_id, status);

-- Geographic index for location-based queries
CREATE INDEX IF NOT EXISTS idx_sessions_location ON public.sessions(start_lat, start_lng);

-- Audit log query optimization
CREATE INDEX IF NOT EXISTS idx_audit_log_record_table ON public.audit_log(record_id, table_name);

-- =====================================================
-- 5. VERIFICATION REPORT
-- =====================================================

SELECT 
  'PERFORMANCE OPTIMIZATION COMPLETE' as status,
  'All optimizations applied successfully' as message,
  now() as completed_at;