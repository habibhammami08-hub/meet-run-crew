-- Migration de nettoyage et sécurisation - MeetRun
-- Corrige les problèmes identifiés dans l'analyse

-- 1. Sécuriser toutes les fonctions avec search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_profile profiles)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  RETURN user_profile.sub_status IN ('active', 'trialing') AND 
         (user_profile.sub_current_period_end IS NULL OR user_profile.sub_current_period_end > now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    now(),
    now()
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Profile already exists, ignore
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't block user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_user_completely()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  current_user_id uuid;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'No authenticated user';
  END IF;
  
  -- Delete from profiles (will cascade to other tables)
  DELETE FROM public.profiles WHERE id = current_user_id;
  
  -- Delete from auth.users (this removes the user completely)
  DELETE FROM auth.users WHERE id = current_user_id;
END;
$function$;

-- 2. Ajouter des index pour optimiser les performances
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_stripe_customer_id 
ON public.profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_date_location 
ON public.sessions(date, location_lat, location_lng);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_session_user 
ON public.enrollments(session_id, user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_registrations_run_user 
ON public.registrations(run_id, user_id);

-- 3. Améliorer les contraintes de validation
ALTER TABLE public.sessions 
ADD CONSTRAINT check_max_participants_positive 
CHECK (max_participants > 0);

ALTER TABLE public.sessions 
ADD CONSTRAINT check_price_positive 
CHECK (price_cents >= 0);

ALTER TABLE public.sessions 
ADD CONSTRAINT check_host_payout_valid 
CHECK (host_payout_cents >= 0 AND host_payout_cents <= price_cents);

-- 4. Nettoyer les données orphelines (si existantes)
DELETE FROM public.enrollments 
WHERE user_id NOT IN (SELECT id FROM public.profiles);

DELETE FROM public.registrations 
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- 5. Assurer la cohérence des timestamps
UPDATE public.profiles 
SET updated_at = now() 
WHERE updated_at IS NULL;

UPDATE public.sessions 
SET created_at = now() 
WHERE created_at IS NULL;