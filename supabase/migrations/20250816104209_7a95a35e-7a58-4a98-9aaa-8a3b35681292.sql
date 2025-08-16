-- =============================================================================
-- SECURITY FIXES FOR LINTER WARNINGS
-- =============================================================================

-- Fix search_path for existing functions
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$ 
BEGIN 
    NEW.updated_at = now(); 
    RETURN NEW; 
END; 
$$;

-- Fix search_path for user management functions
CREATE OR REPLACE FUNCTION public.handle_new_user_protected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deletion_date TIMESTAMPTZ;
BEGIN
  -- Vérifier si l'utilisateur a été supprimé
  SELECT deleted_at INTO deletion_date
  FROM public.deleted_users 
  WHERE email = NEW.email;
  
  -- Si supprimé il y a moins de 24h, bloquer
  IF deletion_date IS NOT NULL AND deletion_date > NOW() - INTERVAL '24 hours' THEN
    DELETE FROM auth.users WHERE id = NEW.id;
    RAISE EXCEPTION 'Ce compte a été supprimé récemment. Attendez 24h avant de créer un nouveau compte.';
  END IF;
  
  -- Si supprimé il y a plus de 24h, autoriser et nettoyer
  IF deletion_date IS NOT NULL THEN
    DELETE FROM public.deleted_users WHERE email = NEW.email;
  END IF;
  
  -- Créer le profil normalement
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_user_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Récupérer l'email depuis auth.users
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = OLD.id;
  
  -- Enregistrer l'utilisateur supprimé
  INSERT INTO public.deleted_users (id, email, deleted_at, deletion_reason)
  VALUES (OLD.id, COALESCE(user_email, OLD.email), NOW(), 'user_request')
  ON CONFLICT (id) DO UPDATE SET
    deleted_at = NOW(),
    email = COALESCE(EXCLUDED.email, deleted_users.email);
    
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_deleted_user_recreation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérifier si l'email existe dans deleted_users
  IF EXISTS (
    SELECT 1 FROM public.deleted_users 
    WHERE email = NEW.email
  ) THEN
    RAISE EXCEPTION 'Cannot create account: This email was previously deleted. Please contact support for account reactivation.'
      USING ERRCODE = '23505'; -- Unique violation error code
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_deleted_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Supprimer les enregistrements de plus de 90 jours
  DELETE FROM public.deleted_users 
  WHERE deleted_at < NOW() - INTERVAL '90 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_user_deleted(check_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.deleted_users 
    WHERE email = check_email
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_profile profiles)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN user_profile.sub_status IN ('active', 'trialing') AND 
         (user_profile.sub_current_period_end IS NULL OR user_profile.sub_current_period_end > now());
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate handle_new_user with proper search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vous pouvez ajouter ici d'autres logiques pour les nouveaux utilisateurs
  -- Par exemple : créer un profil, envoyer un email de bienvenue, etc.
  
  -- Pour l'instant, on ne fait que retourner le nouvel utilisateur
  RETURN NEW;
END;
$$;