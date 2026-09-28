CREATE OR REPLACE FUNCTION public.enrollments_check_gender()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type text; v_host uuid; v_gender text;
BEGIN
  SELECT session_type, host_id INTO v_type, v_host FROM sessions WHERE id = NEW.session_id;
  IF v_type IS NULL OR v_type = 'mixed' OR NEW.user_id = v_host THEN RETURN NEW; END IF;
  SELECT lower(gender) INTO v_gender FROM profiles WHERE id = NEW.user_id;
  IF v_type = 'men_only' AND coalesce(v_gender,'') <> 'homme' THEN
    RAISE EXCEPTION 'GENDER_RESTRICTED: Cette session est réservée aux hommes.';
  ELSIF v_type = 'women_only' AND coalesce(v_gender,'') <> 'femme' THEN
    RAISE EXCEPTION 'GENDER_RESTRICTED: Cette session est réservée aux femmes.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enrollments_check_gender ON public.enrollments;
CREATE TRIGGER enrollments_check_gender BEFORE INSERT ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.enrollments_check_gender();