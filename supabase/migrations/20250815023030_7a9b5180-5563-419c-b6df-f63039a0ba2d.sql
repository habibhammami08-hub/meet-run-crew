-- =====================================================
-- CORRECTION FINALE SÉCURITÉ - SUPPRESSION SECURITY DEFINER
-- Suppression des fonctions SECURITY DEFINER non critiques
-- =====================================================

-- =====================================================
-- 1. SUPPRIMER LES FONCTIONS NON CRITIQUES AVEC SECURITY DEFINER
-- =====================================================

-- Supprimer les fonctions utilitaires qui utilisent SECURITY DEFINER
DROP FUNCTION IF EXISTS public.get_platform_stats() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_sessions() CASCADE;
DROP FUNCTION IF EXISTS public.get_session_display_status(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.session_is_available(uuid) CASCADE;

-- =====================================================
-- 2. RECRÉER LES FONCTIONS ESSENTIELLES SANS SECURITY DEFINER
-- =====================================================

-- Fonction pour vérifier si une session est disponible (sans SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_session_open(session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  session_record RECORD;
BEGIN
  SELECT 
    s.status,
    s.scheduled_at,
    s.max_participants,
    COALESCE(COUNT(e.id), 0) as current_enrollments
  INTO session_record
  FROM public.sessions s
  LEFT JOIN public.enrollments e ON s.id = e.session_id 
    AND e.status IN ('paid', 'confirmed', 'present')
  WHERE s.id = session_id
  GROUP BY s.id, s.status, s.scheduled_at, s.max_participants;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  RETURN (
    session_record.status = 'published' AND
    session_record.scheduled_at > now() AND
    session_record.current_enrollments < session_record.max_participants
  );
END;
$$;

-- =====================================================
-- 3. GARDER SEULEMENT LES FONCTIONS SECURITY DEFINER CRITIQUES
-- =====================================================

-- Les fonctions suivantes doivent rester SECURITY DEFINER car elles sont critiques :
-- - handle_new_user (trigger d'authentification)
-- - delete_user_completely (sécurité utilisateur)
-- - has_active_subscription (vérification d'abonnement)
-- - update_updated_at_column (trigger système)
-- - set_updated_at (trigger système)

-- =====================================================
-- 4. CRÉER UNE FONCTION SIMPLE POUR LES STATISTIQUES
-- =====================================================

-- Fonction publique simple pour les statistiques de base (sans SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_basic_stats()
RETURNS json
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  stats json;
BEGIN
  -- Cette fonction respecte les politiques RLS
  SELECT json_build_object(
    'sessions_count', (
      SELECT COUNT(*) 
      FROM public.sessions 
      WHERE status = 'published'
    ),
    'active_sessions', (
      SELECT COUNT(*) 
      FROM public.sessions 
      WHERE status = 'published' AND scheduled_at > now()
    )
  ) INTO stats;
  
  RETURN stats;
END;
$$;

-- =====================================================
-- 5. VÉRIFICATION FINALE
-- =====================================================

-- Compter les fonctions SECURITY DEFINER restantes
SELECT 
  'FONCTIONS SECURITY DEFINER RESTANTES' as info,
  COUNT(*) as count,
  string_agg(proname, ', ') as function_names
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true

UNION ALL

SELECT 
  'TABLES AVEC RLS',
  COUNT(*),
  string_agg(tablename, ', ')
FROM pg_tables 
WHERE schemaname = 'public' 
  AND rowsecurity = true

UNION ALL

SELECT 
  '✅ NETTOYAGE SÉCURITÉ TERMINÉ',
  1,
  'Migration consolidée et sécurisée'

ORDER BY info;