-- === 3. FONCTION SQL DE FALLBACK ===
CREATE OR REPLACE FUNCTION public.delete_user_completely(p_user_id uuid) 
RETURNS jsonb
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public'
AS $$ 
BEGIN
  -- Suppressions en ordre FK
  DELETE FROM public.registrations WHERE user_id = p_user_id;
  DELETE FROM public.enrollments WHERE user_id = p_user_id;
  DELETE FROM public.sessions WHERE host_id = p_user_id;
  DELETE FROM public.runs WHERE host_id = p_user_id;
  DELETE FROM public.subscribers WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
  
  RETURN jsonb_build_object('ok', true, 'stage', 'sql_fallback');
END; 
$$;

-- Permissions pour la fonction
GRANT EXECUTE ON FUNCTION public.delete_user_completely(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_user_completely(uuid) TO authenticated;