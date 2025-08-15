-- =====================================================
-- MIGRATION CONSOLIDÉE - MEETRUN DATABASE SCHEMA
-- Amélioration et standardisation du schéma existant
-- =====================================================

-- Extension pour UUID (si pas déjà présente)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. AMÉLIORATION DE LA TABLE PROFILES
-- =====================================================

-- Ajouter les contraintes et colonnes manquantes pour profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS age integer,
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS role text DEFAULT 'participant';

-- Ajouter les contraintes sur les nouvelles colonnes
ALTER TABLE public.profiles 
ADD CONSTRAINT IF NOT EXISTS profiles_age_check 
CHECK (age IS NULL OR (age >= 16 AND age <= 100));

ALTER TABLE public.profiles 
ADD CONSTRAINT IF NOT EXISTS profiles_gender_check 
CHECK (gender IS NULL OR gender IN ('homme', 'femme', 'autre'));

ALTER TABLE public.profiles 
ADD CONSTRAINT IF NOT EXISTS profiles_role_check 
CHECK (role IN ('participant', 'host', 'admin'));

-- Améliorer la contrainte sur sub_status
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_sub_status_check;

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_sub_status_check 
CHECK (sub_status IN ('inactive', 'active', 'trialing', 'canceled', 'past_due'));

-- =====================================================
-- 2. AMÉLIORATION DE LA TABLE SESSIONS
-- =====================================================

-- Standardiser les noms de colonnes géographiques
ALTER TABLE public.sessions 
RENAME COLUMN location_lat TO start_lat;

ALTER TABLE public.sessions 
RENAME COLUMN location_lng TO start_lng;

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

-- Migrer date + time vers scheduled_at pour les sessions existantes
UPDATE public.sessions 
SET scheduled_at = (date + time)
WHERE scheduled_at IS NULL AND date IS NOT NULL AND time IS NOT NULL;

-- Supprimer les anciennes colonnes date/time après migration
ALTER TABLE public.sessions 
DROP COLUMN IF EXISTS date,
DROP COLUMN IF EXISTS time;

-- Renommer distance vers distance_km
ALTER TABLE public.sessions 
RENAME COLUMN distance TO distance_km;

-- Ajouter les contraintes pour sessions
ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_title_length 
CHECK (length(title) BETWEEN 3 AND 100);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_description_length 
CHECK (description IS NULL OR length(description) <= 500);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_start_lat_range 
CHECK (start_lat BETWEEN -90 AND 90);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_start_lng_range 
CHECK (start_lng BETWEEN -180 AND 180);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_end_lat_range 
CHECK (end_lat IS NULL OR end_lat BETWEEN -90 AND 90);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_end_lng_range 
CHECK (end_lng IS NULL OR end_lng BETWEEN -180 AND 180);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_location_hint_length 
CHECK (location_hint IS NULL OR length(location_hint) <= 100);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_scheduled_future 
CHECK (scheduled_at > now() OR status IN ('completed', 'cancelled'));

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_duration_range 
CHECK (duration_minutes BETWEEN 30 AND 180);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_distance_range 
CHECK (distance_km BETWEEN 1 AND 50);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_intensity_values 
CHECK (intensity IN ('low', 'medium', 'high'));

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_type_values 
CHECK (session_type IN ('mixed', 'women_only', 'men_only'));

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_max_participants_range 
CHECK (max_participants BETWEEN 2 AND 20);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_min_participants_range 
CHECK (min_participants >= 2);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_price_range 
CHECK (price_cents BETWEEN 0 AND 5000);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_host_fee_range 
CHECK (host_fee_cents >= 0);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_status_values 
CHECK (status IN ('draft', 'published', 'cancelled', 'completed'));

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_valid_participant_count 
CHECK (min_participants <= max_participants);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_valid_host_fee 
CHECK (host_fee_cents <= price_cents);

ALTER TABLE public.sessions 
ADD CONSTRAINT IF NOT EXISTS sessions_valid_end_location 
CHECK ((end_lat IS NULL AND end_lng IS NULL) OR (end_lat IS NOT NULL AND end_lng IS NOT NULL));

-- =====================================================
-- 3. AMÉLIORATION DE LA TABLE ENROLLMENTS
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
-- 4. INDEX POUR PERFORMANCES
-- =====================================================

-- Index géographiques et temporels pour sessions
CREATE INDEX IF NOT EXISTS idx_sessions_published_scheduled 
ON public.sessions(status, scheduled_at) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_sessions_geo_search 
ON public.sessions(start_lat, start_lng, scheduled_at) 
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
-- 5. CORRECTION DE LA FONCTION has_active_subscription
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

-- =====================================================
-- 6. NOUVELLES FONCTIONS UTILITAIRES
-- =====================================================

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

-- Ajouter les triggers pour updated_at sur les nouvelles colonnes
CREATE TRIGGER IF NOT EXISTS trigger_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER IF NOT EXISTS trigger_enrollments_updated_at
  BEFORE UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

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
    WHEN s.scheduled_at < now() THEN 'past'
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
-- 8. FONCTIONS DE NETTOYAGE ET MAINTENANCE
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
  -- Supprimer les sessions passées depuis plus de 30 jours
  DELETE FROM public.sessions 
  WHERE scheduled_at < (now() - interval '30 days')
  AND status IN ('draft', 'cancelled');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Nettoyer les inscriptions orphelines
  DELETE FROM public.enrollments
  WHERE session_id NOT IN (SELECT id FROM public.sessions);
  
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

-- =====================================================
-- 9. REALTIME CONFIGURATION
-- =====================================================

-- Configurer Realtime pour les tables principales
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
ALTER TABLE public.enrollments REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Ajouter les tables à la publication Realtime (ignore les erreurs si déjà ajoutées)
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
-- 10. VERIFICATION ET STATS FINALES
-- =====================================================

-- Afficher les statistiques après migration
SELECT 
  'PROFILES' as table_name, 
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL) as with_stripe
FROM public.profiles

UNION ALL

SELECT 
  'SESSIONS' as table_name,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE status = 'published') as published
FROM public.sessions

UNION ALL

SELECT 
  'ENROLLMENTS' as table_name,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE status = 'paid') as paid
FROM public.enrollments

ORDER BY table_name;