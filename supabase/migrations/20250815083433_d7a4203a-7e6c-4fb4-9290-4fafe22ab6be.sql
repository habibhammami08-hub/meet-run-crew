-- Supprimer l'ancien trigger qui ne fonctionne pas sur auth.users
DROP TRIGGER IF EXISTS check_deletion_blocklist_trigger ON auth.users;

-- Créer un trigger sur la table profiles qui se déclenche lors de la création
-- (car chaque utilisateur auth génère automatiquement un profil)
CREATE OR REPLACE FUNCTION public.prevent_deleted_user_profile_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  email_hash TEXT;
  is_blocked BOOLEAN := FALSE;
  user_email TEXT;
BEGIN
  -- Récupérer l'email de l'utilisateur depuis auth.users
  SELECT email INTO user_email 
  FROM auth.users 
  WHERE id = NEW.id;
  
  IF user_email IS NULL THEN
    RETURN NEW; -- Si on ne trouve pas l'email, on laisse passer
  END IF;
  
  -- Hasher l'email et vérifier s'il est bloqué
  email_hash := encode(digest(lower(user_email), 'sha256'), 'hex');
  
  SELECT EXISTS(
    SELECT 1 FROM public.deletion_blocklist 
    WHERE email_hash = encode(digest(lower(user_email), 'sha256'), 'hex')
    AND blocked_until > now()
  ) INTO is_blocked;
  
  IF is_blocked THEN
    -- Supprimer l'utilisateur auth qui vient d'être créé
    DELETE FROM auth.users WHERE id = NEW.id;
    RAISE EXCEPTION 'Inscription temporairement bloquée après suppression de compte. Veuillez réessayer dans 7 jours.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Appliquer le trigger à la création de profils
DROP TRIGGER IF EXISTS prevent_deleted_user_profile_creation_trigger ON public.profiles;
CREATE TRIGGER prevent_deleted_user_profile_creation_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_deleted_user_profile_creation();