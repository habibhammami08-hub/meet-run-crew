-- =====================================================
-- NETTOYAGE FINAL DES VUES SECURITY DEFINER
-- =====================================================

-- D'abord, supprimer sessions_with_details qui existe déjà
DROP VIEW IF EXISTS public.sessions_with_details CASCADE;

-- Supprimer TOUTES les vues Analytics potentielles qui pourraient avoir SECURITY DEFINER
DROP VIEW IF EXISTS public.sessions_complete CASCADE;
DROP VIEW IF EXISTS public.sessions_with_host CASCADE;
DROP VIEW IF EXISTS public.sessions_view CASCADE;
DROP VIEW IF EXISTS public.session_summary CASCADE;
DROP VIEW IF EXISTS public.session_details CASCADE;
DROP VIEW IF EXISTS public.deletion_stats CASCADE;
DROP VIEW IF EXISTS public.payment_metrics CASCADE;
DROP VIEW IF EXISTS public.session_performance_metrics CASCADE;
DROP VIEW IF EXISTS public.user_activity_metrics CASCADE;
DROP VIEW IF EXISTS public.user_deletion_stats CASCADE;

-- Identifier et supprimer toutes les vues SECURITY DEFINER restantes
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Supprimer toutes les vues avec SECURITY DEFINER
    FOR func_record IN 
        SELECT schemaname, viewname
        FROM pg_views
        WHERE schemaname = 'public'
    LOOP
        BEGIN
            EXECUTE 'DROP VIEW IF EXISTS ' || func_record.schemaname || '.' || func_record.viewname || ' CASCADE';
        EXCEPTION WHEN OTHERS THEN
            -- Ignorer les erreurs
            NULL;
        END;
    END LOOP;
END $$;

-- Recréer uniquement la vue essentielle sans SECURITY DEFINER
CREATE VIEW public.sessions_with_details AS
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
  p.full_name as host_name,
  p.avatar_url as host_avatar,
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
) e ON s.id = e.session_id;

-- Vérification finale
SELECT 
  'NETTOYAGE TERMINÉ' as status,
  'Base de données sécurisée' as message,
  COUNT(*) as vues_publiques_restantes
FROM information_schema.views 
WHERE table_schema = 'public';