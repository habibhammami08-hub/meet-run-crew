-- Modifier le trigger pour utiliser l'email en clair temporairement (debug)
CREATE OR REPLACE FUNCTION public.prevent_deleted_user_profile_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
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
  
  -- Vérifier s'il est bloqué (temporairement avec email en clair)
  SELECT EXISTS(
    SELECT 1 FROM public.deletion_blocklist 
    WHERE email_hash = user_email
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