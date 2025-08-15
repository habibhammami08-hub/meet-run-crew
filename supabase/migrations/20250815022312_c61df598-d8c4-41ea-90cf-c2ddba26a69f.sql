-- =====================================================
-- MIGRATION CONSOLIDÉE - MEETRUN DATABASE SCHEMA (Version finale)
-- Amélioration et standardisation du schéma existant
-- =====================================================

-- Extension pour UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. AMÉLIORATION DE LA TABLE PROFILES
-- =====================================================

-- Ajouter les colonnes manquantes pour profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS age integer,
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS role text DEFAULT 'participant';

-- Ajouter les contraintes sur les nouvelles colonnes
DO $$
BEGIN
    BEGIN
        ALTER TABLE public.profiles 
        ADD CONSTRAINT profiles_age_check 
        CHECK (age IS NULL OR (age >= 16 AND age <= 100));
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;

    BEGIN
        ALTER TABLE public.profiles 
        ADD CONSTRAINT profiles_gender_check 
        CHECK (gender IS NULL OR gender IN ('homme', 'femme', 'autre'));
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;

    BEGIN
        ALTER TABLE public.profiles 
        ADD CONSTRAINT profiles_role_check 
        CHECK (role IN ('participant', 'host', 'admin'));
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;

-- Améliorer la contrainte sur sub_status
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_sub_status_check;

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_sub_status_check 
CHECK (sub_status IN ('inactive', 'active', 'trialing', 'canceled', 'past_due'));

-- =====================================================
-- 2. AMÉLIORATION DE LA TABLE SESSIONS  
-- =====================================================

-- Vérifier et renommer les colonnes géographiques si nécessaire
DO $$
BEGIN
    -- Renommer location_lat vers start_lat si elle existe
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'location_lat') THEN
        ALTER TABLE public.sessions RENAME COLUMN location_lat TO start_lat;
    END IF;
    
    -- Renommer location_lng vers start_lng si elle existe
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'location_lng') THEN
        ALTER TABLE public.sessions RENAME COLUMN location_lng TO start_lng;
    END IF;
    
    -- Renommer distance vers distance_km si elle existe
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'distance') THEN
        ALTER TABLE public.sessions RENAME COLUMN distance TO distance_km;
    END IF;
END $$;

-- Ajouter les nouvelles colonnes pour sessions
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS end_lat numeric(10,8),
ADD COLUMN IF NOT EXISTS end_lng numeric(11,8),
ADD COLUMN IF NOT EXISTS location_hint text,
ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS session_type text DEFAULT 'mixed',
ADD COLUMN IF NOT EXISTS min_participants integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS host_fee_cents integer DEFAULT 200,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

-- Migrer les données existantes pour scheduled_at
DO $$
BEGIN
    -- Vérifier si les colonnes date et time existent
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'date') AND
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'time') THEN
        
        -- Migrer date + time vers scheduled_at
        UPDATE public.sessions 
        SET scheduled_at = (date + time)
        WHERE scheduled_at IS NULL;
        
        -- Supprimer les anciennes colonnes
        ALTER TABLE public.sessions DROP COLUMN date;
        ALTER TABLE public.sessions DROP COLUMN time;
    END IF;
END $$;

-- =====================================================
-- 3. CONTRAINTES POUR SESSIONS
-- =====================================================

DO $$
BEGIN
    -- Contraintes de validation
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_title_length 
        CHECK (length(title) BETWEEN 3 AND 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_intensity_values 
        CHECK (intensity IN ('low', 'medium', 'high'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_type_values 
        CHECK (session_type IN ('mixed', 'women_only', 'men_only'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_status_values 
        CHECK (status IN ('draft', 'published', 'cancelled', 'completed'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_max_participants_range 
        CHECK (max_participants BETWEEN 2 AND 20);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_valid_participant_count 
        CHECK (min_participants <= max_participants);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_price_range 
        CHECK (price_cents BETWEEN 0 AND 5000);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_valid_host_fee 
        CHECK (host_fee_cents <= price_cents);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- =====================================================
-- 4. AMÉLIORATION DE LA TABLE ENROLLMENTS
-- =====================================================

-- Ajouter les nouvelles colonnes pour enrollments
ALTER TABLE public.enrollments 
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
ADD COLUMN IF NOT EXISTS paid_at timestamptz,
ADD COLUMN IF NOT EXISTS amount_paid_cents integer;

-- Améliorer la contrainte sur status
ALTER TABLE public.enrollments 
DROP CONSTRAINT IF EXISTS enrollments_status_check;

ALTER TABLE public.enrollments 
ADD CONSTRAINT enrollments_status_check 
CHECK (status IN ('pending', 'paid', 'confirmed', 'cancelled', 'noshow', 'present'));

-- =====================================================
-- 5. INDEX POUR PERFORMANCES
-- =====================================================

-- Index pour sessions
CREATE INDEX IF NOT EXISTS idx_sessions_published_scheduled 
ON public.sessions(status, scheduled_at) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_sessions_host_date 
ON public.sessions(host_id, scheduled_at);

-- Index pour enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_user_status 
ON public.enrollments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_enrollments_session_status 
ON public.enrollments(session_id, status);

CREATE INDEX IF NOT EXISTS idx_enrollments_stripe_session 
ON public.enrollments(stripe_session_id) 
WHERE stripe_session_id IS NOT NULL;

-- Index pour profiles
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer 
ON public.profiles(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_email 
ON public.profiles(email);

-- Index pour subscribers
CREATE INDEX IF NOT EXISTS idx_subscribers_email 
ON public.subscribers(email);

-- =====================================================
-- 6. FONCTIONS UTILITAIRES
-- =====================================================

-- Corriger la fonction has_active_subscription
CREATE OR REPLACE FUNCTION public.has_active_subscription(user_profile public.profiles)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN user_profile.sub_status IN ('active', 'trialing') AND 
         (user_profile.sub_current_period_end IS NULL OR user_profile.sub_current_period_end > now());
END;
$$;

-- Fonction pour mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Ajouter les triggers pour updated_at
DO $$
BEGIN
    BEGIN
        CREATE TRIGGER trigger_sessions_updated_at
        BEFORE UPDATE ON public.sessions
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;

    BEGIN
        CREATE TRIGGER trigger_enrollments_updated_at
        BEFORE UPDATE ON public.enrollments
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;

-- =====================================================
-- 7. VUES UTILES POUR L'APPLICATION
-- =====================================================

-- Vue des sessions avec informations de l'hôte
CREATE OR REPLACE VIEW public.sessions_with_host AS
SELECT 
  s.*,
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  COALESCE(enrollment_counts.count, 0) as current_enrollments,
  CASE 
    WHEN s.scheduled_at IS NOT NULL AND s.scheduled_at < now() THEN 'past'
    WHEN COALESCE(enrollment_counts.count, 0) >= s.max_participants THEN 'full'
    WHEN s.status = 'published' THEN 'available'
    ELSE s.status
  END as computed_status
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_id = p.id
LEFT JOIN (
  SELECT 
    session_id, 
    COUNT(*) as count
  FROM public.enrollments 
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
) enrollment_counts ON s.id = enrollment_counts.session_id;

-- Vue des inscriptions avec détails
CREATE OR REPLACE VIEW public.enrollments_detailed AS
SELECT 
  e.*,
  p.full_name as participant_name,
  p.avatar_url as participant_avatar,
  p.email as participant_email,
  s.title as session_title,
  s.scheduled_at as session_date,
  s.location_hint as session_location,
  s.price_cents as session_price
FROM public.enrollments e
LEFT JOIN public.profiles p ON e.user_id = p.id
LEFT JOIN public.sessions s ON e.session_id = s.id;

-- =====================================================
-- 8. REALTIME CONFIGURATION
-- =====================================================

-- Configurer Realtime pour les tables principales
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
ALTER TABLE public.enrollments REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Ajouter les tables à la publication Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.enrollments;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- =====================================================
-- 9. FONCTIONS DE MAINTENANCE
-- =====================================================

-- Fonction pour nettoyer les sessions expirées
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.sessions 
  WHERE scheduled_at IS NOT NULL 
  AND scheduled_at < (now() - interval '30 days')
  AND status IN ('draft', 'cancelled');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Fonction pour calculer les statistiques
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stats json;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'total_sessions', (SELECT COUNT(*) FROM public.sessions),
    'active_sessions', (SELECT COUNT(*) FROM public.sessions WHERE status = 'published' AND scheduled_at > now()),
    'total_enrollments', (SELECT COUNT(*) FROM public.enrollments WHERE status IN ('paid', 'confirmed')),
    'subscribers', (SELECT COUNT(*) FROM public.profiles WHERE sub_status IN ('active', 'trialing'))
  ) INTO stats;
  
  RETURN stats;
END;
$$;