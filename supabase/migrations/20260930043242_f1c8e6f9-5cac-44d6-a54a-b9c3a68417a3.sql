CREATE OR REPLACE FUNCTION public.enrollments_guard_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_count integer;
BEGIN
  -- service_role (webhooks Stripe, etc.) contourne le garde-fou
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Verrouille la session le temps du comptage (évite la course sur la dernière place)
  SELECT max_participants INTO v_max
  FROM public.sessions
  WHERE id = NEW.session_id
  FOR UPDATE;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.enrollments e
  WHERE e.session_id = NEW.session_id
    AND e.status IN ('paid', 'included_by_subscription', 'confirmed')
    AND (TG_OP = 'INSERT' OR e.id <> OLD.id);

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'La session est complète.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enrollments_guard_capacity() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enrollments_capacity ON public.enrollments;
CREATE TRIGGER trg_enrollments_capacity
BEFORE INSERT OR UPDATE OF status ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.enrollments_guard_capacity();