-- Créer une fonction pour supprimer toutes les données utilisateur de manière transactionnelle
CREATE OR REPLACE FUNCTION public.app_delete_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  current_user_id uuid;
  deleted_sessions_count integer := 0;
  cancelled_sessions_count integer := 0;
  deleted_enrollments_count integer := 0;
  deleted_profile boolean := false;
BEGIN
  -- Récupérer l'ID de l'utilisateur authentifié
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Compter et supprimer les inscriptions de l'utilisateur
  SELECT COUNT(*) INTO deleted_enrollments_count
  FROM public.enrollments 
  WHERE user_id = current_user_id;
  
  DELETE FROM public.enrollments 
  WHERE user_id = current_user_id;

  -- Compter les sessions futures (à annuler) vs anciennes (à supprimer)
  SELECT COUNT(*) INTO cancelled_sessions_count
  FROM public.sessions 
  WHERE host_id = current_user_id 
    AND scheduled_at > NOW()
    AND status IN ('published', 'active');
  
  SELECT COUNT(*) INTO deleted_sessions_count  
  FROM public.sessions 
  WHERE host_id = current_user_id 
    AND (scheduled_at <= NOW() OR status NOT IN ('published', 'active'));

  -- Annuler les sessions futures (au lieu de les supprimer)
  UPDATE public.sessions 
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE host_id = current_user_id 
    AND scheduled_at > NOW()
    AND status IN ('published', 'active');

  -- Supprimer les anciennes sessions et brouillons
  DELETE FROM public.sessions 
  WHERE host_id = current_user_id 
    AND (scheduled_at <= NOW() OR status NOT IN ('published', 'active', 'cancelled'));

  -- Supprimer le profil utilisateur
  DELETE FROM public.profiles 
  WHERE id = current_user_id;
  
  IF FOUND THEN
    deleted_profile := true;
  END IF;

  -- Construire le résultat
  SELECT json_build_object(
    'deleted_sessions', deleted_sessions_count,
    'cancelled_sessions', cancelled_sessions_count,
    'deleted_enrollments', deleted_enrollments_count,
    'deleted_profile', deleted_profile,
    'user_id', current_user_id
  ) INTO result;

  RETURN result;
END;
$function$;

-- Créer une fonction pour nettoyer les données d'un utilisateur spécifique (pour admin)
CREATE OR REPLACE FUNCTION public.app_delete_user_data(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  deleted_sessions_count integer := 0;
  cancelled_sessions_count integer := 0;
  deleted_enrollments_count integer := 0;
  deleted_profile boolean := false;
BEGIN
  -- Vérification de sécurité : seul l'utilisateur lui-même ou un admin peut supprimer
  IF p_user_id != auth.uid() AND auth.jwt() ->> 'role' != 'admin' THEN
    RAISE EXCEPTION 'Access denied: cannot delete other user data';
  END IF;

  -- Compter et supprimer les inscriptions de l'utilisateur
  SELECT COUNT(*) INTO deleted_enrollments_count
  FROM public.enrollments 
  WHERE user_id = p_user_id;
  
  DELETE FROM public.enrollments 
  WHERE user_id = p_user_id;

  -- Compter les sessions futures (à annuler) vs anciennes (à supprimer)
  SELECT COUNT(*) INTO cancelled_sessions_count
  FROM public.sessions 
  WHERE host_id = p_user_id 
    AND scheduled_at > NOW()
    AND status IN ('published', 'active');
  
  SELECT COUNT(*) INTO deleted_sessions_count  
  FROM public.sessions 
  WHERE host_id = p_user_id 
    AND (scheduled_at <= NOW() OR status NOT IN ('published', 'active'));

  -- Annuler les sessions futures (au lieu de les supprimer)
  UPDATE public.sessions 
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE host_id = p_user_id 
    AND scheduled_at > NOW()
    AND status IN ('published', 'active');

  -- Supprimer les anciennes sessions et brouillons
  DELETE FROM public.sessions 
  WHERE host_id = p_user_id 
    AND (scheduled_at <= NOW() OR status NOT IN ('published', 'active', 'cancelled'));

  -- Supprimer le profil utilisateur
  DELETE FROM public.profiles 
  WHERE id = p_user_id;
  
  IF FOUND THEN
    deleted_profile := true;
  END IF;

  -- Construire le résultat
  SELECT json_build_object(
    'deleted_sessions', deleted_sessions_count,
    'cancelled_sessions', cancelled_sessions_count,
    'deleted_enrollments', deleted_enrollments_count,
    'deleted_profile', deleted_profile,
    'user_id', p_user_id
  ) INTO result;

  RETURN result;
END;
$function$;