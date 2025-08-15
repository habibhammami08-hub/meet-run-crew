-- =====================================================
-- CORRECTION FINALE DES VUES SECURITY DEFINER
-- =====================================================

-- Forcer la suppression de toutes les vues existantes
DROP VIEW IF EXISTS public.sessions_with_details CASCADE;

-- Supprimer toutes les autres vues qui pourraient exister
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

-- Vérification qu'aucune vue Analytics n'existe plus
SELECT 
  'VUES SUPPRIMÉES' as status,
  COUNT(*) as vues_publiques_restantes
FROM information_schema.views 
WHERE table_schema = 'public';