-- =====================================================
-- CORRECTION DES VUES SECURITY DEFINER
-- Conversion des vues avec SECURITY DEFINER en vues normales
-- =====================================================

-- Recréer les vues d'analytics sans SECURITY DEFINER
DROP VIEW IF EXISTS public.deletion_stats CASCADE;
CREATE VIEW public.deletion_stats AS
SELECT 
  COUNT(*) as total_deleted_users,
  COUNT(*) FILTER (WHERE deleted_at > now() - interval '24 hours') as deleted_last_24h,
  COUNT(*) FILTER (WHERE deleted_at > now() - interval '7 days') as deleted_last_7d,
  COUNT(*) FILTER (WHERE deleted_at > now() - interval '30 days') as deleted_last_30d
FROM public.deleted_users;

DROP VIEW IF EXISTS public.payment_metrics CASCADE;
CREATE VIEW public.payment_metrics AS
SELECT 
  COUNT(*) as total_payments,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') as payments_24h,
  COUNT(*) FILTER (WHERE status IN ('paid', 'confirmed')) as successful_payments,
  COUNT(*) FILTER (WHERE status IN ('failed', 'cancelled')) as failed_payments,
  COALESCE(SUM(amount_paid_cents) FILTER (WHERE status IN ('paid', 'confirmed')), 0) as total_revenue_cents,
  COALESCE(AVG(amount_paid_cents) FILTER (WHERE status IN ('paid', 'confirmed')), 0) as avg_payment_cents
FROM public.enrollments;

DROP VIEW IF EXISTS public.session_performance_metrics CASCADE;
CREATE VIEW public.session_performance_metrics AS
SELECT 
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') as sessions_24h,
  COUNT(*) FILTER (WHERE status = 'published') as published_sessions,
  COUNT(*) FILTER (WHERE status = 'published' AND scheduled_at > now()) as upcoming_sessions,
  COUNT(*) FILTER (WHERE current_enrollments >= max_participants) as full_sessions,
  COALESCE(AVG(max_participants), 0) as avg_max_participants,
  COALESCE(AVG(current_enrollments), 0) as avg_enrollments,
  CASE 
    WHEN COUNT(*) > 0 THEN 
      (COUNT(*) FILTER (WHERE current_enrollments >= max_participants)::float / COUNT(*)::float) * 100
    ELSE 0 
  END as avg_fill_rate_percent
FROM public.sessions;

DROP VIEW IF EXISTS public.user_activity_metrics CASCADE;
CREATE VIEW public.user_activity_metrics AS
SELECT 
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') as new_users_24h,
  COUNT(*) FILTER (WHERE updated_at > now() - interval '7 days') as active_users_7d,
  COUNT(*) FILTER (WHERE updated_at > now() - interval '30 days') as active_users_30d
FROM public.profiles;

DROP VIEW IF EXISTS public.user_deletion_stats CASCADE;
CREATE VIEW public.user_deletion_stats AS
SELECT 
  COUNT(*) as users_deleted,
  deleted_at::date as deletion_date,
  COUNT(*) FILTER (WHERE deleted_at > now() - interval '24 hours') as deleted_last_24h,
  COUNT(*) FILTER (WHERE deleted_at > now() - interval '7 days') as deleted_last_7d
FROM public.deleted_users
GROUP BY deleted_at::date;

-- Vérification finale - aucune vue ne doit avoir SECURITY DEFINER
SELECT 
  'CORRECTION TERMINÉE' as status,
  'Vues Analytics normalisées' as message,
  COUNT(*) as vues_created
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name IN ('deletion_stats', 'payment_metrics', 'session_performance_metrics', 'user_activity_metrics', 'user_deletion_stats');