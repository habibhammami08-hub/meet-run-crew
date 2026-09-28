-- 1. Remove the "anyone can do anything" rules
DROP POLICY IF EXISTS open_access_profiles ON public.profiles;
DROP POLICY IF EXISTS open_access_sessions ON public.sessions;
DROP POLICY IF EXISTS open_access_enrollments ON public.enrollments;

-- Recount helpers must still update sessions they don't own
ALTER FUNCTION public.recalc_participants_count(uuid) SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.sync_participants_count() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.enrollments_after_change_recount() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.sessions_recount_on_host_change() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.sessions_purge_new_host_enrollment() SECURITY DEFINER SET search_path = public;

-- 2. SESSIONS: everyone reads, only host edits
CREATE POLICY sessions_public_read ON public.sessions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY sessions_host_insert ON public.sessions FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
CREATE POLICY sessions_host_update ON public.sessions FOR UPDATE TO authenticated USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());

-- 3. ENROLLMENTS: members see confirmed participants; own rows only for writes
CREATE POLICY enrollments_confirmed_read ON public.enrollments FOR SELECT TO authenticated
  USING (status IN ('paid','included_by_subscription','confirmed'));
CREATE POLICY enrollments_host_delete ON public.enrollments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.host_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.enrollments_guard_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles;
BEGIN
  IF current_user IN ('service_role','postgres','supabase_admin') OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- clients may not change payment fields
    NEW.status := OLD.status; NEW.stripe_session_id := OLD.stripe_session_id;
    NEW.stripe_payment_intent_id := OLD.stripe_payment_intent_id;
    NEW.amount_paid_cents := OLD.amount_paid_cents; NEW.paid_at := OLD.paid_at;
    NEW.user_id := OLD.user_id; NEW.session_id := OLD.session_id;
    RETURN NEW;
  END IF;
  NEW.stripe_session_id := NULL; NEW.stripe_payment_intent_id := NULL;
  NEW.amount_paid_cents := NULL; NEW.paid_at := NULL;
  IF NEW.status = 'included_by_subscription' THEN
    SELECT * INTO p FROM public.profiles WHERE id = auth.uid();
    IF NOT (now() <= timestamptz '2026-12-31 23:59:59+01'
            OR (p.sub_status = 'active' AND (p.sub_current_period_end IS NULL OR p.sub_current_period_end > now()))) THEN
      RAISE EXCEPTION 'Abonnement requis';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM 'pending' THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_enrollments_guard_status BEFORE INSERT OR UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.enrollments_guard_status();

-- 4. PROFILES: own row only; subscription fields server-only; safe public view
CREATE OR REPLACE FUNCTION public.profiles_guard_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user IN ('service_role','postgres','supabase_admin') OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.sub_status := OLD.sub_status; NEW.sub_current_period_end := OLD.sub_current_period_end;
    NEW.stripe_customer_id := OLD.stripe_customer_id; NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  ELSE
    NEW.sub_status := 'inactive'; NEW.sub_current_period_end := NULL;
    NEW.stripe_customer_id := NULL; NEW.stripe_subscription_id := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_profiles_guard_billing BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_billing();

CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT id, full_name, age, gender, avatar_url, city FROM public.profiles;
GRANT SELECT ON public.public_profiles TO authenticated;