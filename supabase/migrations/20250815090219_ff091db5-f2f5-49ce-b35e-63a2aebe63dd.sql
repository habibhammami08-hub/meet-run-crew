-- Corriger la fonction RPC de fallback avec le bon nom de paramètre et permissions
CREATE OR REPLACE FUNCTION public.delete_user_completely(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Supprimer dans l'ordre des FK
  DELETE FROM public.audit_log WHERE user_id = p_user_id;
  DELETE FROM public.registrations WHERE user_id = p_user_id;
  DELETE FROM public.enrollments WHERE user_id = p_user_id;
  DELETE FROM public.sessions WHERE host_id = p_user_id;
  DELETE FROM public.runs WHERE host_id = p_user_id;
  DELETE FROM public.subscribers WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
  
  RETURN jsonb_build_object('ok', true, 'stage', 'sql_fallback');
END;
$$;

-- Donner les permissions nécessaires
GRANT EXECUTE ON FUNCTION public.delete_user_completely(uuid) TO anon, authenticated;