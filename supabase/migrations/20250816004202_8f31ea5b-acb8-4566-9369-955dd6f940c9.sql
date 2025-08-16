-- === FINALISER L'OPTIMISATION ET NETTOYAGE ===

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

-- 13. AJOUTER UN TRIGGER POUR PROTÉGER CONTRE LA RECRÉATION DE COMPTES SUPPRIMÉS
CREATE TRIGGER protect_deleted_users_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 14. NETTOYER LA TABLE AUDIT_LOG IMMÉDIATEMENT
PERFORM public.cleanup_old_audit_logs();