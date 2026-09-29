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
    IF NOT (now() <= timestamptz '2027-03-31 23:59:59+02'
            OR (p.sub_status = 'active' AND (p.sub_current_period_end IS NULL OR p.sub_current_period_end > now()))) THEN
      RAISE EXCEPTION 'Abonnement requis';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM 'pending' THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END $$;