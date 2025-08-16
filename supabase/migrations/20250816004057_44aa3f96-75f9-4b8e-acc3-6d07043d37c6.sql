-- === NETTOYAGE ET OPTIMISATION BASE DE DONNÉES (ÉTAPE 3) ===

-- 7. OPTIMISER LA TABLE AUDIT_LOG - Ajouter une politique de rétention
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

-- 8. CORRIGER LA FONCTION DE CRÉATION D'UTILISATEUR POUR SÉCURITÉ
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

-- 9. RECRÉER LE TRIGGER PROTÉGÉ POUR DELETED_USERS
DROP TRIGGER IF EXISTS protect_deleted_users_trigger ON auth.users;
CREATE TRIGGER protect_deleted_users_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- 10. AJOUTER CONTRAINTES MANQUANTES pour la sécurité (syntaxe corrigée)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'valid_email_format' 
    AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT valid_email_format 
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  END IF;
END
$$;

-- 11. OPTIMISER LES INDEX pour les performances
CREATE INDEX IF NOT EXISTS idx_sessions_host_status 
ON public.sessions(host_id, status) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_enrollments_user_status 
ON public.enrollments(user_id, status) 
WHERE status IN ('paid', 'confirmed', 'present');

-- 12. CORRIGER LA POLITIQUE D'INSERTION SUBSCRIBERS
DROP POLICY IF EXISTS "subscribers_insert_own" ON public.subscribers;
CREATE POLICY "subscribers_insert_own" ON public.subscribers
FOR INSERT
WITH CHECK ((auth.uid() = user_id) AND (auth.email() = email));

-- 13. AJOUTER UNE FONCTION DE NETTOYAGE AUTOMATIQUE
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