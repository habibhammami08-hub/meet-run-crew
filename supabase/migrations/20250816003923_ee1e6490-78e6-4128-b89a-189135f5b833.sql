-- === NETTOYAGE ET OPTIMISATION BASE DE DONNÉES ===

-- 1. SUPPRIMER LES FONCTIONS REDONDANTES
DROP FUNCTION IF EXISTS public.handle_new_user_protected();
DROP FUNCTION IF EXISTS public.backfill_missing_profiles();

-- 2. SUPPRIMER LES TRIGGERS DUPLIQUÉS 
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;

-- 3. OPTIMISER LA TABLE PROFILES - Supprimer colonnes redondantes
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS photo_url,
DROP COLUMN IF EXISTS first_name,
DROP COLUMN IF EXISTS last_name;

-- 4. SUPPRIMER LES POLITIQUES RLS DOUBLÉES
DROP POLICY IF EXISTS "subscribers_own_only" ON public.subscribers;

-- 5. SIMPLIFIER LES FONCTIONS DE MONITORING INUTILES
DROP FUNCTION IF EXISTS public.get_basic_stats();
DROP FUNCTION IF EXISTS public.get_system_health();
DROP FUNCTION IF EXISTS public.cleanup_expired_blocklist();

-- 6. OPTIMISER LA TABLE AUDIT_LOG - Ajouter une politique de rétention
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Supprimer les logs de plus de 30 jours
  DELETE FROM public.audit_log 
  WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$;

-- 7. CORRIGER LA FONCTION DE CRÉATION D'UTILISATEUR POUR SÉCURITÉ
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_deleted BOOLEAN := FALSE;
BEGIN
  -- Vérifier si cet utilisateur a été supprimé
  SELECT EXISTS(
    SELECT 1 FROM public.deleted_users 
    WHERE id = NEW.id OR email = NEW.email
  ) INTO is_deleted;
  
  -- Si l'utilisateur a été supprimé, bloquer la création
  IF is_deleted THEN
    RAISE EXCEPTION 'Ce compte a été supprimé et ne peut pas être recréé.';
  END IF;
  
  -- Créer le profil seulement si pas supprimé
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Erreur lors de la création du profil pour %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 8. AJOUTER CONTRAINTES MANQUANTES pour la sécurité
ALTER TABLE public.profiles 
ADD CONSTRAINT valid_email_format 
CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- 9. OPTIMISER LES INDEX pour les performances
CREATE INDEX IF NOT EXISTS idx_sessions_host_status 
ON public.sessions(host_id, status) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_enrollments_user_status 
ON public.enrollments(user_id, status) 
WHERE status IN ('paid', 'confirmed', 'present');

-- 10. CORRIGER LA POLITIQUE D'INSERTION SUBSCRIBERS
DROP POLICY IF EXISTS "subscribers_insert_own" ON public.subscribers;
CREATE POLICY "subscribers_insert_own" ON public.subscribers
FOR INSERT
WITH CHECK ((auth.uid() = user_id) AND (auth.email() = email));

-- 11. AJOUTER UNE FONCTION DE NETTOYAGE AUTOMATIQUE
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