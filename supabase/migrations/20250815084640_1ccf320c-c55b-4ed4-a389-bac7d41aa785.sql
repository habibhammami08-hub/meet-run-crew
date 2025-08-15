-- Activer l'extension pgcrypto pour les fonctions de hachage
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Corriger la fonction hash_email avec la bonne syntaxe
CREATE OR REPLACE FUNCTION public.hash_email(email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN encode(digest(lower(email), 'sha256'), 'hex');
END;
$$;

-- Recréer le trigger avec la syntaxe corrigée
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
  
  -- Hasher l'email (maintenant que pgcrypto est activé)
  email_hash := encode(digest(lower(user_email), 'sha256'), 'hex');
  
  -- Vérifier s'il est bloqué
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