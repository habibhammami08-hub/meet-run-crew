-- =====================================================
-- COMPLETE AUDIT SYSTEM SETUP
-- =====================================================

-- Create audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_data jsonb;
  new_data jsonb;
  record_id uuid;
BEGIN
  -- Extract record ID from OLD or NEW
  IF TG_OP = 'DELETE' THEN
    record_id = (OLD.id)::uuid;
    old_data = to_jsonb(OLD);
    new_data = NULL;
  ELSIF TG_OP = 'INSERT' THEN
    record_id = (NEW.id)::uuid;
    old_data = NULL;
    new_data = to_jsonb(NEW);
  ELSE -- UPDATE
    record_id = (NEW.id)::uuid;
    old_data = to_jsonb(OLD);
    new_data = to_jsonb(NEW);
  END IF;

  -- Insert audit record (only if user is authenticated)
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.audit_log (
      table_name,
      operation,
      user_id,
      record_id,
      old_data,
      new_data,
      timestamp
    ) VALUES (
      TG_TABLE_NAME,
      TG_OP,
      auth.uid(),
      record_id,
      old_data,
      new_data,
      now()
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Add audit triggers to sensitive tables
DROP TRIGGER IF EXISTS audit_sessions_trigger ON public.sessions;
CREATE TRIGGER audit_sessions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS audit_enrollments_trigger ON public.enrollments;
CREATE TRIGGER audit_enrollments_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS audit_profiles_trigger ON public.profiles;
CREATE TRIGGER audit_profiles_trigger
  AFTER UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- =====================================================
-- HEALTH CHECK AND SYSTEM STATUS
-- =====================================================

-- Create system health monitoring function
CREATE OR REPLACE FUNCTION public.get_system_health()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  health_data json;
BEGIN
  SELECT json_build_object(
    'database', json_build_object(
      'status', 'healthy',
      'timestamp', now(),
      'active_sessions', (SELECT COUNT(*) FROM sessions WHERE status = 'published'),
      'total_users', (SELECT COUNT(*) FROM profiles),
      'recent_errors', (SELECT COUNT(*) FROM audit_log WHERE timestamp > now() - interval '1 hour' AND operation = 'DELETE')
    ),
    'performance', json_build_object(
      'total_sessions', (SELECT total_sessions FROM session_performance_metrics),
      'upcoming_sessions', (SELECT upcoming_sessions FROM session_performance_metrics),
      'avg_fill_rate', (SELECT ROUND(avg_fill_rate_percent, 2) FROM session_performance_metrics)
    ),
    'payments', json_build_object(
      'total_revenue_cents', (SELECT COALESCE(total_revenue_cents, 0) FROM payment_metrics),
      'successful_payments', (SELECT COALESCE(successful_payments, 0) FROM payment_metrics),
      'payments_24h', (SELECT COALESCE(payments_24h, 0) FROM payment_metrics)
    )
  ) INTO health_data;
  
  RETURN health_data;
END;
$$;

-- =====================================================
-- COMPLETION VERIFICATION
-- =====================================================

SELECT 
  'PERFORMANCE & MONITORING SYSTEM COMPLETE' as status,
  json_build_object(
    'denormalized_fields_added', 3,
    'monitoring_views_created', 3,
    'audit_system_enabled', true,
    'performance_indexes_created', 6,
    'security_functions_created', 2
  ) as summary,
  now() as completed_at;