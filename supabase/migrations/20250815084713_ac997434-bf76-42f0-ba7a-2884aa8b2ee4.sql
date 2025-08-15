-- Remplacer par une approche plus simple sans digest
-- Utiliser md5 qui est disponible par défaut dans PostgreSQL
CREATE OR REPLACE FUNCTION public.simple_hash_email(email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(lower(email));
$$;

-- Recréer le trigger avec md5 au lieu de digest
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
  
  -- Hasher l'email avec md5 (disponible par défaut)
  email_hash := md5(lower(user_email));
  
  -- Vérifier s'il est bloqué
  SELECT EXISTS(
    SELECT 1 FROM public.deletion_blocklist 
    WHERE email_hash = md5(lower(user_email))
    AND blocked_until > now()
  ) INTO is_blocked;
  
  IF is_blocked THEN
    -- Log pour debug
    RAISE LOG 'Tentative de reconnexion bloquée pour email: %', user_email;
    
    -- Supprimer l'utilisateur auth qui vient d'être créé
    DELETE FROM auth.users WHERE id = NEW.id;
    RAISE EXCEPTION 'Inscription temporairement bloquée après suppression de compte. Veuillez réessayer dans 7 jours.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- S'assurer que le trigger est bien présent
DROP TRIGGER IF EXISTS prevent_deleted_user_profile_creation_trigger ON public.profiles;
CREATE TRIGGER prevent_deleted_user_profile_creation_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_deleted_user_profile_creation();