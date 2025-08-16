-- 1) RPC SQL réutilisable et sécurisée pour supprimer un compte
CREATE OR REPLACE FUNCTION public.app_delete_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_deleted_participations int := 0;
  v_deleted_enrollments int := 0;
  v_deleted_sessions int := 0;
  v_cancelled_sessions int := 0;
  v_deleted_profiles int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  v_uid := auth.uid();

  -- Annule les sessions hostées s'il y a d'autres participants (enrollments)
  UPDATE public.sessions s
     SET status = 'cancelled',
         host_id = NULL
   WHERE s.host_id = v_uid
     AND EXISTS (
       SELECT 1 FROM public.enrollments e
       WHERE e.session_id = s.id
         AND e.user_id <> v_uid
         AND e.status IN ('paid', 'included_by_subscription')
     );
  GET DIAGNOSTICS v_cancelled_sessions = ROW_COUNT;

  -- Supprime les sessions hostées sans autres participants
  DELETE FROM public.sessions s
   WHERE s.host_id = v_uid
     AND NOT EXISTS (
       SELECT 1 FROM public.enrollments e
       WHERE e.session_id = s.id
         AND e.user_id <> v_uid
         AND e.status IN ('paid', 'included_by_subscription')
     );
  GET DIAGNOSTICS v_deleted_sessions = ROW_COUNT;

  -- Supprime ses inscriptions (enrollments)
  DELETE FROM public.enrollments e
   WHERE e.user_id = v_uid;
  GET DIAGNOSTICS v_deleted_enrollments = ROW_COUNT;

  -- Supprime le profil (déclenche tes FK/RLS existantes)
  DELETE FROM public.profiles p WHERE p.id = v_uid;
  GET DIAGNOSTICS v_deleted_profiles = ROW_COUNT;

  RETURN jsonb_build_object(
    'cancelled_sessions', v_cancelled_sessions,
    'deleted_sessions', v_deleted_sessions,
    'deleted_enrollments', v_deleted_enrollments,
    'deleted_profiles', v_deleted_profiles
  );
END;
$$;

-- Permissions strictes
REVOKE ALL ON FUNCTION public.app_delete_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_delete_account() TO anon, authenticated;

-- 2) Contraintes FK pour cohérence (si pas déjà présentes)
ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_user_id_fkey,
  ADD CONSTRAINT enrollments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_host_id_fkey,
  ADD CONSTRAINT sessions_host_id_fkey
  FOREIGN KEY (host_id) REFERENCES public.profiles(id)
  ON DELETE SET NULL;