-- =====================================================
-- MIGRATION DE NETTOYAGE - SUPPRESSION DES DOUBLONS
-- =====================================================

-- 1. SUPPRIMER TOUTES LES FONCTIONS DUPLIQUÉES
DROP FUNCTION IF EXISTS public.delete_user_completely() CASCADE;
DROP FUNCTION IF EXISTS public.delete_user_completely(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.can_delete_account() CASCADE;
DROP FUNCTION IF EXISTS public.test_delete_account() CASCADE;
DROP FUNCTION IF EXISTS public.verify_deletion_system() CASCADE;
DROP FUNCTION IF EXISTS public.handle_auth_user_deleted() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_deleted_user_profile_creation() CASCADE;
DROP FUNCTION IF EXISTS public.hash_email(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.simple_hash_email(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.check_email_blocklist() CASCADE;

-- 2. SUPPRIMER LES TRIGGERS REDONDANTS
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
DROP TRIGGER IF EXISTS prevent_deleted_user_profile_creation_trigger ON public.profiles;
DROP TRIGGER IF EXISTS check_deletion_blocklist_trigger ON auth.users;
DROP TRIGGER IF EXISTS check_email_blocklist_on_profile_creation ON public.profiles;

-- 3. SUPPRIMER LES VUES ET TABLES TEMPORAIRES
DROP VIEW IF EXISTS public.user_deletion_stats CASCADE;

-- 4. NETTOYER LA TABLE BLOCKLIST
DROP TABLE IF EXISTS public.deletion_blocklist CASCADE;

-- 5. REPARTIR SUR DES BASES SAINES
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.deletion_blocklist (
  id SERIAL PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  
  -- Infos Stripe pour réactivation
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  
  -- Infos de suppression
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  
  -- Infos de réactivation
  reactivated_at TIMESTAMPTZ,
  subscription_reactivated BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les performances
CREATE INDEX idx_deletion_blocklist_hash_blocked 
ON public.deletion_blocklist(email_hash, blocked_until);

CREATE INDEX idx_deletion_blocklist_stripe_customer 
ON public.deletion_blocklist(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX idx_deletion_blocklist_period_end 
ON public.deletion_blocklist(current_period_end) 
WHERE current_period_end IS NOT NULL;

-- RLS
ALTER TABLE public.deletion_blocklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY deletion_blocklist_admin_only ON public.deletion_blocklist
  FOR ALL TO service_role
  USING (true);

-- 6. FONCTIONS UTILITAIRES
CREATE OR REPLACE FUNCTION public.hash_email_secure(email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(digest(lower(trim(email)), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.is_email_blocked(email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.deletion_blocklist 
    WHERE email_hash = public.hash_email_secure(email)
    AND blocked_until > NOW()
  );
$$;

-- 7. FONCTION DE SUPPRESSION AVEC GESTION ABONNEMENTS
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
  user_sub_cancel_at_period_end boolean;
  future_sessions_count integer := 0;
  deleted_enrollments integer := 0;
  deleted_sessions integer := 0;
  result json;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not authenticated');
  END IF;

  -- Récupérer les infos utilisateur
  SELECT email INTO user_email FROM auth.users WHERE id = current_user_id;
  
  -- Récupérer les infos d'abonnement
  SELECT 
    stripe_customer_id, 
    stripe_subscription_id,
    sub_status,
    sub_current_period_end,
    sub_cancel_at_period_end
  INTO 
    user_stripe_customer_id, 
    user_stripe_subscription_id,
    user_sub_status,
    user_sub_current_period_end,
    user_sub_cancel_at_period_end
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
      'future_sessions_with_participants', future_sessions_count,
      'message', 'Vous avez des sessions à venir avec des participants inscrits. Annulez-les d''abord.'
    );
  END IF;

  BEGIN
    -- 1. Annuler toutes les inscriptions
    UPDATE public.enrollments 
    SET status = 'cancelled', updated_at = now()
    WHERE user_id = current_user_id 
      AND status IN ('paid', 'confirmed', 'pending');
    
    GET DIAGNOSTICS deleted_enrollments = ROW_COUNT;

    -- 2. Supprimer toutes les sessions créées
    DELETE FROM public.sessions 
    WHERE host_id = current_user_id;
    
    GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

    -- 3. Supprimer les données liées
    DELETE FROM public.subscribers WHERE user_id = current_user_id;
    DELETE FROM public.registrations WHERE user_id = current_user_id;
    DELETE FROM public.runs WHERE host_id = current_user_id;

    -- 4. Sauvegarder dans la blocklist avec infos d'abonnement
    IF user_email IS NOT NULL THEN
      INSERT INTO public.deletion_blocklist (
        email_hash,
        stripe_customer_id,
        stripe_subscription_id,
        subscription_status,
        current_period_end,
        cancel_at_period_end,
        deleted_at,
        blocked_until
      )
      VALUES (
        public.hash_email_secure(user_email),
        user_stripe_customer_id,
        user_stripe_subscription_id,
        user_sub_status,
        user_sub_current_period_end,
        user_sub_cancel_at_period_end,
        now(),
        now() + INTERVAL '7 days'
      )
      ON CONFLICT (email_hash) DO UPDATE SET
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        subscription_status = EXCLUDED.subscription_status,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        deleted_at = now(),
        blocked_until = now() + INTERVAL '7 days',
        reactivated_at = NULL,
        subscription_reactivated = false;
    END IF;

    -- 5. Supprimer le profil
    DELETE FROM public.profiles WHERE id = current_user_id;

    -- Construire la réponse avec infos d'abonnement
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
      ),
      'message', 'Account deleted successfully'
    );

    RETURN result;

  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Database cleanup failed: ' || SQLERRM
    );
  END;
END;
$$;

-- 8. FONCTION DE VÉRIFICATION
CREATE OR REPLACE FUNCTION public.can_delete_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  future_sessions_with_participants integer;
  active_enrollments_count integer;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('can_delete', false, 'reason', 'not_authenticated');
  END IF;
  
  SELECT COUNT(*) INTO future_sessions_with_participants
  FROM public.sessions s
  WHERE s.host_id = current_user_id 
    AND s.status = 'published' 
    AND s.scheduled_at > now()
    AND EXISTS (
      SELECT 1 FROM public.enrollments e 
      WHERE e.session_id = s.id 
      AND e.status IN ('paid', 'confirmed')
    );
  
  SELECT COUNT(*) INTO active_enrollments_count
  FROM public.enrollments e
  JOIN public.sessions s ON e.session_id = s.id
  WHERE e.user_id = current_user_id 
    AND e.status IN ('paid', 'confirmed')
    AND s.scheduled_at > now();
  
  IF future_sessions_with_participants > 0 THEN
    RETURN json_build_object(
      'can_delete', false,
      'reason', 'has_future_sessions_with_participants',
      'future_sessions_with_participants', future_sessions_with_participants,
      'message', 'Vous ne pouvez pas supprimer votre compte car vous organisez des sessions à venir avec des participants inscrits.'
    );
  ELSE
    RETURN json_build_object(
      'can_delete', true,
      'reason', 'eligible',
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

-- 9. TRIGGER DE PROTECTION
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
  
  SELECT public.is_email_blocked(user_email) INTO is_blocked;
  
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

-- 10. FONCTIONS POUR LA RÉACTIVATION
CREATE OR REPLACE FUNCTION public.get_subscription_status_for_reactivation(email TEXT)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN blocked_until > NOW() THEN
      json_build_object(
        'can_reactivate', false,
        'reason', 'still_blocked',
        'blocked_until', blocked_until
      )
    WHEN current_period_end IS NULL THEN
      json_build_object(
        'can_reactivate', true,
        'has_subscription', false
      )
    WHEN current_period_end > NOW() THEN
      json_build_object(
        'can_reactivate', true,
        'has_subscription', true,
        'subscription_still_valid', true,
        'stripe_customer_id', stripe_customer_id,
        'stripe_subscription_id', stripe_subscription_id,
        'current_period_end', current_period_end,
        'can_reactivate_subscription', true
      )
    ELSE
      json_build_object(
        'can_reactivate', true,
        'has_subscription', true,
        'subscription_still_valid', false,
        'subscription_expired', true,
        'expired_at', current_period_end
      )
    END
  FROM public.deletion_blocklist 
  WHERE email_hash = public.hash_email_secure(email);
$$;

-- 11. PERMISSIONS
GRANT EXECUTE ON FUNCTION public.hash_email_secure(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_blocked(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_delete_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_status_for_reactivation(TEXT) TO authenticated;