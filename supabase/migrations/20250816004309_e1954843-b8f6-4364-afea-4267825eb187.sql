-- === NETTOYAGE ET OPTIMISATION BASE DE DONNÉES (ÉTAPE 3 - FINALE) ===

-- 11. CORRIGER LA POLITIQUE D'INSERTION SUBSCRIBERS
DROP POLICY IF EXISTS "subscribers_insert_own" ON public.subscribers;
CREATE POLICY "subscribers_insert_own" ON public.subscribers
FOR INSERT
WITH CHECK ((auth.uid() = user_id) AND (auth.email() = email));

-- 12. AJOUTER UNE FONCTION DE NETTOYAGE AUTOMATIQUE
CREATE OR REPLACE FUNCTION public.cleanup_database()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Nettoyer les anciens logs d'audit
  PERFORM public.cleanup_old_audit_logs();
  
  -- Nettoyer les anciens utilisateurs supprimés (>90 jours)
  DELETE FROM public.deleted_users 
  WHERE deleted_at < NOW() - INTERVAL '90 days';
  
  -- Nettoyer les sessions expirées en draft depuis >30 jours
  DELETE FROM public.sessions 
  WHERE status = 'draft' 
  AND created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- 14. AJOUTER INDEX POUR DELETED_USERS POUR LA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_deleted_users_email 
ON public.deleted_users(email);

CREATE INDEX IF NOT EXISTS idx_deleted_users_id 
ON public.deleted_users(id);

-- 15. CRÉER UNE VUE POUR LES STATISTIQUES SIMPLIFIÉES
CREATE OR REPLACE VIEW public.dashboard_stats AS
SELECT 
  (SELECT COUNT(*) FROM public.sessions WHERE status = 'published') as published_sessions,
  (SELECT COUNT(*) FROM public.sessions WHERE status = 'published' AND scheduled_at > NOW()) as upcoming_sessions,
  (SELECT COUNT(*) FROM public.profiles) as total_users,
  (SELECT COUNT(*) FROM public.subscribers WHERE subscribed = true) as active_subscribers;