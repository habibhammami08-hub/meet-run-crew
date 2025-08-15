-- =====================================================
-- COMPLETE USER DELETION SYSTEM
-- Assure la suppression complète de l'utilisateur
-- =====================================================

-- =====================================================
-- 1. FONCTION DE SUPPRESSION COMPLÈTE
-- =====================================================

-- Fonction pour supprimer complètement un utilisateur (profiles + auth.users)
CREATE OR REPLACE FUNCTION public.delete_user_completely()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  deletion_stats json;
  sessions_count integer := 0;
  enrollments_count integer := 0;
  storage_files_count integer := 0;
BEGIN
  -- Récupérer l'ID utilisateur actuel
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Vérifier les sessions futures hébergées
  SELECT COUNT(*) INTO sessions_count
  FROM public.sessions 
  WHERE host_id = current_user_id 
    AND status = 'published' 
    AND scheduled_at > now();
    
  IF sessions_count > 0 THEN
    RAISE EXCEPTION 'Impossible de supprimer le compte. Vous avez % session(s) programmée(s) à venir.', sessions_count;
  END IF;
  
  -- Annuler les inscriptions futures
  UPDATE public.enrollments 
  SET 
    status = 'cancelled',
    updated_at = now()
  WHERE user_id = current_user_id 
    AND session_id IN (
      SELECT id FROM public.sessions 
      WHERE scheduled_at > now()
    );
  
  GET DIAGNOSTICS enrollments_count = ROW_COUNT;
  
  -- Archiver les sessions passées (ne pas supprimer pour l'intégrité des données)
  UPDATE public.sessions 
  SET 
    status = 'cancelled',
    updated_at = now()
  WHERE host_id = current_user_id 
    AND scheduled_at <= now();
  
  -- Supprimer les abonnements
  DELETE FROM public.subscribers WHERE user_id = current_user_id;
  
  -- Supprimer le profil (avec CASCADE)
  DELETE FROM public.profiles WHERE id = current_user_id;
  
  -- Préparer les statistiques
  SELECT json_build_object(
    'success', true,
    'user_id', current_user_id,
    'deleted_data', json_build_object(
      'enrollments_cancelled', enrollments_count,
      'sessions_archived', sessions_count,
      'storage_files', storage_files_count
    ),
    'message', 'Profil supprimé avec succès. La suppression auth sera effectuée par l''Edge Function.'
  ) INTO deletion_stats;
  
  RETURN deletion_stats;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erreur lors de la suppression: %', SQLERRM;
END;
$$;

-- =====================================================
-- 2. FONCTION DE VÉRIFICATION AVANT SUPPRESSION
-- =====================================================

-- Fonction pour vérifier si un utilisateur peut supprimer son compte
CREATE OR REPLACE FUNCTION public.can_delete_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  future_sessions_count integer;
  active_enrollments_count integer;
  result json;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    SELECT json_build_object(
      'can_delete', false,
      'reason', 'not_authenticated'
    ) INTO result;
    RETURN result;
  END IF;
  
  -- Compter les sessions futures hébergées
  SELECT COUNT(*) INTO future_sessions_count
  FROM public.sessions 
  WHERE host_id = current_user_id 
    AND status = 'published' 
    AND scheduled_at > now();
  
  -- Compter les inscriptions actives
  SELECT COUNT(*) INTO active_enrollments_count
  FROM public.enrollments e
  JOIN public.sessions s ON e.session_id = s.id
  WHERE e.user_id = current_user_id 
    AND e.status IN ('paid', 'confirmed')
    AND s.scheduled_at > now();
  
  -- Déterminer si la suppression est possible
  IF future_sessions_count > 0 THEN
    SELECT json_build_object(
      'can_delete', false,
      'reason', 'has_future_sessions',
      'future_sessions_count', future_sessions_count,
      'message', 'Vous ne pouvez pas supprimer votre compte car vous organisez des sessions à venir. Annulez-les d''abord.'
    ) INTO result;
  ELSE
    SELECT json_build_object(
      'can_delete', true,
      'reason', 'eligible',
      'active_enrollments_count', active_enrollments_count,
      'future_sessions_count', future_sessions_count,
      'message', CASE 
        WHEN active_enrollments_count > 0 THEN 
          'Attention: vous avez ' || active_enrollments_count || ' inscription(s) active(s) qui seront annulée(s).'
        ELSE 
          'Votre compte peut être supprimé.'
      END
    ) INTO result;
  END IF;
  
  RETURN result;
END;
$$;

-- =====================================================
-- 3. TRIGGER POUR NETTOYAGE AUTOMATIQUE
-- =====================================================

-- Fonction trigger pour nettoyer les données quand un utilisateur auth est supprimé
CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nettoyer les données orphelines si l'utilisateur auth est supprimé directement
  -- (cela arrive quand on utilise supabase.auth.admin.deleteUser())
  
  -- Annuler les inscriptions
  UPDATE public.enrollments 
  SET status = 'cancelled', updated_at = now()
  WHERE user_id = OLD.id;
  
  -- Archiver les sessions
  UPDATE public.sessions 
  SET status = 'cancelled', updated_at = now()
  WHERE host_id = OLD.id;
  
  -- Supprimer les abonnements
  DELETE FROM public.subscribers WHERE user_id = OLD.id;
  
  -- Supprimer le profil s'il existe encore
  DELETE FROM public.profiles WHERE id = OLD.id;
  
  RETURN OLD;
END;
$$;

-- Créer le trigger sur auth.users
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_auth_user_deleted();

-- =====================================================
-- 4. FONCTION DE TEST (à utiliser uniquement en développement)
-- =====================================================

-- Fonction pour tester la suppression (mode dry-run)
CREATE OR REPLACE FUNCTION public.test_delete_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  result json;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;
  
  -- Simuler la suppression sans rien supprimer réellement
  SELECT json_build_object(
    'would_delete', json_build_object(
      'user_id', current_user_id,
      'profile_exists', EXISTS(SELECT 1 FROM public.profiles WHERE id = current_user_id),
      'sessions_count', (SELECT COUNT(*) FROM public.sessions WHERE host_id = current_user_id),
      'enrollments_count', (SELECT COUNT(*) FROM public.enrollments WHERE user_id = current_user_id),
      'subscribers_count', (SELECT COUNT(*) FROM public.subscribers WHERE user_id = current_user_id)
    ),
    'can_proceed', NOT EXISTS(
      SELECT 1 FROM public.sessions 
      WHERE host_id = current_user_id 
        AND status = 'published' 
        AND scheduled_at > now()
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- =====================================================
-- 5. VUES POUR MONITORING
-- =====================================================

-- Vue pour monitoring des suppressions d'utilisateurs
CREATE OR REPLACE VIEW public.user_deletion_stats AS
SELECT 
  DATE(deleted_at) as deletion_date,
  COUNT(*) as users_deleted,
  COUNT(*) FILTER (WHERE deleted_at > now() - interval '24 hours') as deleted_last_24h,
  COUNT(*) FILTER (WHERE deleted_at > now() - interval '7 days') as deleted_last_7d
FROM auth.users 
WHERE deleted_at IS NOT NULL
GROUP BY DATE(deleted_at)
ORDER BY deletion_date DESC;

-- =====================================================
-- 6. FONCTION DE VÉRIFICATION DU SYSTÈME
-- =====================================================

-- Fonction pour vérifier que le système de suppression fonctionne
CREATE OR REPLACE FUNCTION public.verify_deletion_system()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  system_status json;
BEGIN
  SELECT json_build_object(
    'deletion_system_status', 'operational',
    'functions_available', json_build_object(
      'delete_user_completely', (SELECT COUNT(*) FROM pg_proc WHERE proname = 'delete_user_completely'),
      'can_delete_account', (SELECT COUNT(*) FROM pg_proc WHERE proname = 'can_delete_account'),
      'test_delete_account', (SELECT COUNT(*) FROM pg_proc WHERE proname = 'test_delete_account')
    ),
    'triggers_active', json_build_object(
      'auth_user_deleted_trigger', EXISTS(
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'on_auth_user_deleted'
      )
    ),
    'rls_enabled', json_build_object(
      'profiles', (SELECT relrowsecurity FROM pg_class WHERE relname = 'profiles'),
      'sessions', (SELECT relrowsecurity FROM pg_class WHERE relname = 'sessions'),
      'enrollments', (SELECT relrowsecurity FROM pg_class WHERE relname = 'enrollments')
    )
  ) INTO system_status;
  
  RETURN system_status;
END;
$$;