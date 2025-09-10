-- Créer une fonction RPC pour calculer les statistiques utilisateur de manière cohérente
CREATE OR REPLACE FUNCTION public.get_user_stats(target_user_id uuid DEFAULT auth.uid())
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  sessions_hosted_count integer;
  sessions_joined_count integer;
  total_km_hosted numeric;
  total_km_joined numeric;
BEGIN
  -- Vérifier que l'utilisateur peut accéder à ses propres stats ou qu'il est admin
  IF target_user_id != auth.uid() AND auth.jwt() ->> 'role' != 'admin' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Compter les sessions organisées (uniquement les sessions publiées et non supprimées)
  SELECT COUNT(*)
  INTO sessions_hosted_count
  FROM public.sessions 
  WHERE host_id = target_user_id 
    AND status IN ('published', 'active')
    AND scheduled_at IS NOT NULL;

  -- Compter les sessions rejointes (inscriptions confirmées)
  SELECT COUNT(DISTINCT e.session_id)
  INTO sessions_joined_count
  FROM public.enrollments e
  JOIN public.sessions s ON e.session_id = s.id
  WHERE e.user_id = target_user_id 
    AND e.status IN ('paid', 'included_by_subscription', 'confirmed')
    AND s.status IN ('published', 'active');

  -- Calculer les km organisés
  SELECT COALESCE(SUM(distance_km), 0)
  INTO total_km_hosted
  FROM public.sessions 
  WHERE host_id = target_user_id 
    AND status IN ('published', 'active')
    AND scheduled_at IS NOT NULL;

  -- Calculer les km rejoints
  SELECT COALESCE(SUM(s.distance_km), 0)
  INTO total_km_joined
  FROM public.enrollments e
  JOIN public.sessions s ON e.session_id = s.id
  WHERE e.user_id = target_user_id 
    AND e.status IN ('paid', 'included_by_subscription', 'confirmed')
    AND s.status IN ('published', 'active');

  -- Construire le résultat JSON
  SELECT json_build_object(
    'sessions_hosted', sessions_hosted_count,
    'sessions_joined', sessions_joined_count,
    'total_km_hosted', total_km_hosted,
    'total_km_joined', total_km_joined,
    'total_km', total_km_hosted + total_km_joined
  ) INTO result;

  RETURN result;
END;
$function$;