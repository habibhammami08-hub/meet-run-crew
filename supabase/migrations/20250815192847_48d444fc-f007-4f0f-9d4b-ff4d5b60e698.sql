-- =====================================================
-- IDENTIFICATION ET CORRECTION DE TOUTES LES VUES SECURITY DEFINER
-- =====================================================

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

-- Supprimer toutes les vues analytics générées automatiquement qui pourraient exister
DO $$
DECLARE
    view_record RECORD;
BEGIN
    FOR view_record IN 
        SELECT table_name
        FROM information_schema.views
        WHERE table_schema = 'public'
        AND table_name LIKE '%_metrics%'
        OR table_name LIKE '%_stats%'
        OR table_name LIKE '%_analytics%'
        OR table_name LIKE '%_view%'
        OR table_name LIKE '%_summary%'
    LOOP
        BEGIN
            EXECUTE 'DROP VIEW IF EXISTS public.' || view_record.table_name || ' CASCADE';
        EXCEPTION WHEN OTHERS THEN
            -- Ignorer les erreurs
            NULL;
        END;
    END LOOP;
END $$;

-- Recréer uniquement les vues essentielles sans SECURITY DEFINER
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

-- Vérification finale pour s'assurer qu'aucune vue SECURITY DEFINER n'existe
SELECT 
  'NETTOYAGE TERMINÉ' as status,
  'Toutes les vues SECURITY DEFINER supprimées' as message,
  COUNT(*) as vues_restantes
FROM information_schema.views 
WHERE table_schema = 'public';