-- SYSTÈME DE SUPPRESSION DE COMPTE COMPLET (VERSION MD5)

-- Table blocklist avec gestion Stripe
CREATE TABLE public.deletion_blocklist (
  id SERIAL PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  reactivated_at TIMESTAMPTZ,
  subscription_reactivated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deletion_blocklist_hash_blocked 
ON public.deletion_blocklist(email_hash, blocked_until);

CREATE INDEX idx_deletion_blocklist_stripe_customer 
ON public.deletion_blocklist(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE public.deletion_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY deletion_blocklist_admin_only ON public.deletion_blocklist
  FOR ALL TO service_role USING (true);

-- Fonctions utilitaires avec MD5
CREATE OR REPLACE FUNCTION public.hash_email_secure(email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT md5(lower(trim(email))); 
$$;

CREATE OR REPLACE FUNCTION public.is_email_blocked(email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.deletion_blocklist 
    WHERE email_hash = md5(lower(trim(email)))
    AND blocked_until > NOW()
  );
$$;

-- Fonction principale RPC
CREATE OR REPLACE FUNCTION public.app_delete_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  user_email text;
  user_stripe_customer_id text;
  user_stripe_subscription_id text;
  user_sub_status text;
  user_sub_current_period_end timestamptz;
  future_sessions_count integer := 0;
  deleted_enrollments integer := 0;
  deleted_sessions integer := 0;
  result json;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not authenticated');
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = current_user_id;
  
  SELECT 
    stripe_customer_id, 
    stripe_subscription_id,
    sub_status,
    sub_current_period_end
  INTO 
    user_stripe_customer_id, 
    user_stripe_subscription_id,
    user_sub_status,
    user_sub_current_period_end
  FROM public.profiles 
  WHERE id = current_user_id;

  -- Vérifier les sessions futures avec participants
  SELECT COUNT(*) INTO future_sessions_count
  FROM public.sessions s
  WHERE s.host_id = current_user_id 
    AND s.status = 'published' 
    AND s.scheduled_at > now()
    AND EXISTS (
      SELECT 1 FROM public.enrollments e 
      WHERE e.session_id = s.id 
      AND e.status IN ('paid', 'confirmed')
    );
    
  IF future_sessions_count > 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot delete account with future sessions that have participants',
      'future_sessions_with_participants', future_sessions_count
    );
  END IF;

  BEGIN
    -- Annuler toutes les inscriptions
    UPDATE public.enrollments 
    SET status = 'cancelled', updated_at = now()
    WHERE user_id = current_user_id 
      AND status IN ('paid', 'confirmed', 'pending');
    GET DIAGNOSTICS deleted_enrollments = ROW_COUNT;

    -- Supprimer toutes les sessions créées
    DELETE FROM public.sessions WHERE host_id = current_user_id;
    GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

    -- Supprimer les données liées
    DELETE FROM public.subscribers WHERE user_id = current_user_id;
    DELETE FROM public.registrations WHERE user_id = current_user_id;
    DELETE FROM public.runs WHERE host_id = current_user_id;

    -- Sauvegarder dans la blocklist avec MD5
    IF user_email IS NOT NULL THEN
      INSERT INTO public.deletion_blocklist (
        email_hash, stripe_customer_id, stripe_subscription_id,
        subscription_status, current_period_end, deleted_at, blocked_until
      )
      VALUES (
        md5(lower(trim(user_email))), user_stripe_customer_id,
        user_stripe_subscription_id, user_sub_status, user_sub_current_period_end,
        now(), now() + INTERVAL '7 days'
      )
      ON CONFLICT (email_hash) DO UPDATE SET
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        subscription_status = EXCLUDED.subscription_status,
        current_period_end = EXCLUDED.current_period_end,
        deleted_at = now(),
        blocked_until = now() + INTERVAL '7 days';
    END IF;

    -- Supprimer le profil
    DELETE FROM public.profiles WHERE id = current_user_id;

    result := json_build_object(
      'success', true,
      'deleted_sessions', deleted_sessions,
      'cancelled_enrollments', deleted_enrollments,
      'user_id', current_user_id,
      'subscription_info', json_build_object(
        'has_active_subscription', (user_stripe_subscription_id IS NOT NULL AND user_sub_status = 'active'),
        'stripe_customer_id', user_stripe_customer_id,
        'stripe_subscription_id', user_stripe_subscription_id,
        'current_period_end', user_sub_current_period_end,
        'will_cancel_at_period_end', true
      )
    );

    RETURN result;

  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Database cleanup failed: ' || SQLERRM);
  END;
END;
$$;

-- Fonction de vérification
CREATE OR REPLACE FUNCTION public.can_delete_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  future_sessions_count integer;
  active_enrollments_count integer;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('can_delete', false, 'reason', 'not_authenticated');
  END IF;
  
  SELECT COUNT(*) INTO future_sessions_count
  FROM public.sessions s
  WHERE s.host_id = current_user_id AND s.status = 'published' 
    AND s.scheduled_at > now()
    AND EXISTS (
      SELECT 1 FROM public.enrollments e 
      WHERE e.session_id = s.id AND e.status IN ('paid', 'confirmed')
    );
  
  SELECT COUNT(*) INTO active_enrollments_count
  FROM public.enrollments e
  JOIN public.sessions s ON e.session_id = s.id
  WHERE e.user_id = current_user_id 
    AND e.status IN ('paid', 'confirmed')
    AND s.scheduled_at > now();
  
  IF future_sessions_count > 0 THEN
    RETURN json_build_object(
      'can_delete', false,
      'reason', 'has_future_sessions_with_participants',
      'future_sessions_with_participants', future_sessions_count,
      'message', 'Vous ne pouvez pas supprimer votre compte car vous organisez des sessions à venir avec des participants inscrits.'
    );
  ELSE
    RETURN json_build_object(
      'can_delete', true,
      'active_enrollments_count', active_enrollments_count,
      'message', CASE 
        WHEN active_enrollments_count > 0 THEN 
          'Attention: ' || active_enrollments_count || ' inscription(s) seront annulée(s).'
        ELSE 'Votre compte peut être supprimé.'
      END
    );
  END IF;
END;
$$;

-- Trigger de protection avec MD5
CREATE OR REPLACE FUNCTION public.check_email_blocklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  is_blocked boolean;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
  
  IF user_email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Vérifier avec MD5
  SELECT EXISTS(
    SELECT 1 FROM public.deletion_blocklist 
    WHERE email_hash = md5(lower(trim(user_email)))
    AND blocked_until > NOW()
  ) INTO is_blocked;
  
  IF is_blocked THEN
    DELETE FROM auth.users WHERE id = NEW.id;
    RAISE EXCEPTION 'Inscription temporairement bloquée. Veuillez réessayer dans quelques jours.';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_email_blocklist_on_profile_creation
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_email_blocklist();

-- Permissions
GRANT EXECUTE ON FUNCTION public.hash_email_secure(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_blocked(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_delete_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_account() TO authenticated;