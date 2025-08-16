-- Corriger les fonctions avec SECURITY DEFINER et search_path fixe
CREATE OR REPLACE FUNCTION public.update_host_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Mise à jour lors de la création d'une session
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles 
    SET 
      sessions_hosted = COALESCE(sessions_hosted, 0) + 1,
      total_distance_hosted_km = COALESCE(total_distance_hosted_km, 0) + COALESCE(NEW.distance_km, 0),
      updated_at = NOW()
    WHERE id = NEW.host_id;
    RETURN NEW;
  END IF;
  
  -- Mise à jour lors de la suppression d'une session
  IF TG_OP = 'DELETE' THEN
    UPDATE public.profiles 
    SET 
      sessions_hosted = GREATEST(COALESCE(sessions_hosted, 0) - 1, 0),
      total_distance_hosted_km = GREATEST(COALESCE(total_distance_hosted_km, 0) - COALESCE(OLD.distance_km, 0), 0),
      updated_at = NOW()
    WHERE id = OLD.host_id;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_participant_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  session_distance_km NUMERIC;
BEGIN
  -- Récupérer la distance de la session
  SELECT COALESCE(distance_km, 0) INTO session_distance_km
  FROM public.sessions 
  WHERE id = COALESCE(NEW.session_id, OLD.session_id);
  
  -- Mise à jour lors de l'inscription
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles 
    SET 
      sessions_joined = COALESCE(sessions_joined, 0) + 1,
      total_km = COALESCE(total_km, 0) + session_distance_km,
      updated_at = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;
  
  -- Mise à jour lors de la désinscription
  IF TG_OP = 'DELETE' THEN
    UPDATE public.profiles 
    SET 
      sessions_joined = GREATEST(COALESCE(sessions_joined, 0) - 1, 0),
      total_km = GREATEST(COALESCE(total_km, 0) - session_distance_km, 0),
      updated_at = NOW()
    WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$function$;