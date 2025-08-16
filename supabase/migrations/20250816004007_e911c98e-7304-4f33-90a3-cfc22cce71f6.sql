-- === NETTOYAGE ET OPTIMISATION BASE DE DONNÉES (ÉTAPE 2) ===

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
CREATE OR REPLACE TRIGGER protect_deleted_users_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- 10. AJOUTER CONTRAINTES MANQUANTES pour la sécurité
ALTER TABLE public.profiles 
ADD CONSTRAINT IF NOT EXISTS valid_email_format 
CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- 11. OPTIMISER LES INDEX pour les performances
CREATE INDEX IF NOT EXISTS idx_sessions_host_status 
ON public.sessions(host_id, status) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_enrollments_user_status 
ON public.enrollments(user_id, status) 
WHERE status IN ('paid', 'confirmed', 'present');