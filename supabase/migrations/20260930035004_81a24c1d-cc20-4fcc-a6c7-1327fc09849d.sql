-- 1) Sessions : pas plus de 7 jours à l'avance
CREATE OR REPLACE FUNCTION public.sessions_guard_schedule_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('service_role','postgres','supabase_admin') OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.scheduled_at > now() + interval '7 days' THEN
    RAISE EXCEPTION 'La session ne peut pas être programmée plus de 7 jours à l''avance';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_sessions_schedule_window ON public.sessions;
CREATE TRIGGER trg_sessions_schedule_window
BEFORE INSERT OR UPDATE OF scheduled_at ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.sessions_guard_schedule_window();

-- 2) Inscriptions : max 3 sessions à venir en tant que participant
CREATE OR REPLACE FUNCTION public.enrollments_guard_max_upcoming()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  upcoming_count integer;
BEGIN
  IF current_user IN ('service_role','postgres','supabase_admin') OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Ne s'applique qu'aux inscriptions actives
  IF NEW.status NOT IN ('pending','paid','included_by_subscription','confirmed') THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO upcoming_count
  FROM public.enrollments e
  JOIN public.sessions s ON s.id = e.session_id
  WHERE e.user_id = NEW.user_id
    AND e.status IN ('pending','paid','included_by_subscription','confirmed')
    AND s.scheduled_at > now()
    AND (TG_OP = 'INSERT' OR e.id <> OLD.id);
  IF upcoming_count >= 3 THEN
    RAISE EXCEPTION 'Vous êtes déjà inscrit(e) à 3 sessions à venir. Attendez qu''une session soit passée pour vous inscrire à une nouvelle.';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_enrollments_max_upcoming ON public.enrollments;
CREATE TRIGGER trg_enrollments_max_upcoming
BEFORE INSERT ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.enrollments_guard_max_upcoming();