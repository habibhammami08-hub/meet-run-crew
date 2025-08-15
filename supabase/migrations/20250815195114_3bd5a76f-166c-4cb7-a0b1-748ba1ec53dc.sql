-- =====================================================
-- MIGRATION FINALE DE NETTOYAGE - MEETRUN
-- À exécuter APRÈS toutes les autres corrections
-- =====================================================

-- 1. SUPPRESSION DES ÉLÉMENTS OBSOLÈTES ET PROBLÉMATIQUES
-- =====================================================

-- Supprimer les fonctions problématiques et obsolètes
DROP FUNCTION IF EXISTS delete_user_completely CASCADE;
DROP FUNCTION IF EXISTS delete_user_account_v2 CASCADE;
DROP FUNCTION IF EXISTS can_delete_account CASCADE;
DROP FUNCTION IF EXISTS test_delete_account CASCADE;
DROP FUNCTION IF EXISTS verify_deletion_system CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_sessions CASCADE;
DROP FUNCTION IF EXISTS get_platform_stats CASCADE;

-- Supprimer les vues cassées ou obsolètes
DROP VIEW IF EXISTS public.sessions_complete CASCADE;
DROP VIEW IF EXISTS public.session_summary CASCADE;
DROP VIEW IF EXISTS public.sessions_with_host CASCADE;
DROP VIEW IF EXISTS public.session_details CASCADE;
DROP VIEW IF EXISTS public.enrollments_detailed CASCADE;
DROP VIEW IF EXISTS public.user_deletion_stats CASCADE;

-- Supprimer les tables obsolètes ou problématiques
DROP TABLE IF EXISTS public.deletion_blocklist CASCADE;
DROP TABLE IF EXISTS public.runs CASCADE;
DROP TABLE IF EXISTS public.registrations CASCADE;

-- 2. NETTOYAGE DES TRIGGERS DUPLIQUÉS
-- =====================================================

-- Supprimer tous les triggers dupliqués
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_sessions_updated_at ON public.sessions;
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS trigger_sessions_updated_at ON public.sessions;
DROP TRIGGER IF EXISTS audit_sessions_trigger ON public.sessions;
DROP TRIGGER IF EXISTS audit_enrollments_trigger ON public.enrollments;
DROP TRIGGER IF EXISTS audit_profiles_trigger ON public.profiles;

-- Recréer uniquement les triggers essentiels
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. NETTOYAGE DES COLONNES DUPLIQUÉES SESSIONS
-- =====================================================

-- Script sécurisé pour nettoyer les colonnes dupliquées
DO $$
BEGIN
    -- Migrer les données de location_lat vers start_lat si nécessaire
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'location_lat')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'start_lat') THEN
        
        UPDATE public.sessions 
        SET start_lat = COALESCE(start_lat, location_lat)
        WHERE start_lat IS NULL AND location_lat IS NOT NULL;
        
        ALTER TABLE public.sessions DROP COLUMN location_lat CASCADE;
    END IF;
    
    -- Migrer les données de location_lng vers start_lng si nécessaire
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'location_lng')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'start_lng') THEN
        
        UPDATE public.sessions 
        SET start_lng = COALESCE(start_lng, location_lng)
        WHERE start_lng IS NULL AND location_lng IS NOT NULL;
        
        ALTER TABLE public.sessions DROP COLUMN location_lng CASCADE;
    END IF;
    
    -- Migrer area_hint vers location_hint
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'area_hint')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'location_hint') THEN
        
        UPDATE public.sessions 
        SET location_hint = COALESCE(location_hint, area_hint)
        WHERE location_hint IS NULL AND area_hint IS NOT NULL;
        
        ALTER TABLE public.sessions DROP COLUMN area_hint CASCADE;
    END IF;
    
    -- Migrer host_payout_cents vers host_fee_cents
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_payout_cents')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_fee_cents') THEN
        
        UPDATE public.sessions 
        SET host_fee_cents = COALESCE(host_fee_cents, host_payout_cents, 200)
        WHERE host_fee_cents IS NULL;
        
        ALTER TABLE public.sessions DROP COLUMN host_payout_cents CASCADE;
    END IF;
    
    -- Supprimer les colonnes obsolètes date/time si elles existent
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'date') THEN
        ALTER TABLE public.sessions DROP COLUMN date CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'time') THEN
        ALTER TABLE public.sessions DROP COLUMN time CASCADE;
    END IF;
    
    -- Nettoyer la colonne type vers session_type
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'type')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'session_type') THEN
        
        UPDATE public.sessions 
        SET session_type = COALESCE(session_type, type, 'mixed')
        WHERE session_type IS NULL;
        
        ALTER TABLE public.sessions DROP COLUMN type CASCADE;
    END IF;
END $$;

-- 4. STANDARDISATION DES COLONNES SESSIONS
-- =====================================================

-- S'assurer que toutes les colonnes nécessaires existent avec les bons types
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS min_participants integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS session_type text DEFAULT 'mixed',
ADD COLUMN IF NOT EXISTS host_fee_cents integer DEFAULT 200,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

-- Mettre à jour les valeurs NULL avec des défauts appropriés
UPDATE public.sessions 
SET 
    duration_minutes = COALESCE(duration_minutes, 60),
    min_participants = COALESCE(min_participants, 2),
    session_type = COALESCE(session_type, 'mixed'),
    host_fee_cents = COALESCE(host_fee_cents, 200),
    status = COALESCE(status, 'draft')
WHERE duration_minutes IS NULL 
   OR min_participants IS NULL 
   OR session_type IS NULL 
   OR host_fee_cents IS NULL 
   OR status IS NULL;

-- 5. NETTOYAGE DES CONTRAINTES DUPLIQUÉES
-- =====================================================

-- Supprimer toutes les contraintes check existantes sur sessions
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.sessions'::regclass 
        AND contype = 'c'
    LOOP
        EXECUTE 'ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS ' || constraint_name;
    END LOOP;
END $$;

-- Recréer les contraintes essentielles une seule fois
ALTER TABLE public.sessions 
ADD CONSTRAINT sessions_intensity_check 
CHECK (intensity IN ('low', 'medium', 'high')),

ADD CONSTRAINT sessions_session_type_check 
CHECK (session_type IN ('mixed', 'women_only', 'men_only')),

ADD CONSTRAINT sessions_status_check 
CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),

ADD CONSTRAINT sessions_participants_check 
CHECK (min_participants <= max_participants AND min_participants >= 2 AND max_participants <= 20),

ADD CONSTRAINT sessions_price_check 
CHECK (price_cents >= 0 AND price_cents <= 10000),

ADD CONSTRAINT sessions_fee_check 
CHECK (host_fee_cents >= 0 AND host_fee_cents <= price_cents),

ADD CONSTRAINT sessions_distance_check 
CHECK (distance_km > 0 AND distance_km <= 50),

ADD CONSTRAINT sessions_coordinates_check 
CHECK (
  start_lat BETWEEN -90 AND 90 AND 
  start_lng BETWEEN -180 AND 180 AND
  (end_lat IS NULL OR end_lat BETWEEN -90 AND 90) AND
  (end_lng IS NULL OR end_lng BETWEEN -180 AND 180)
);

-- 6. NETTOYAGE DES POLITIQUES RLS DUPLIQUÉES
-- =====================================================

-- Supprimer toutes les politiques RLS et les recréer proprement
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Sessions
    FOR policy_record IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sessions' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON public.sessions';
    END LOOP;
    
    -- Profiles
    FOR policy_record IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON public.profiles';
    END LOOP;
    
    -- Enrollments
    FOR policy_record IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'enrollments' LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON public.enrollments';
    END LOOP;
END $$;

-- Recréer les politiques RLS essentielles
-- Sessions
CREATE POLICY "sessions_read_policy" ON public.sessions
  FOR SELECT USING (status = 'published' OR auth.uid() = host_id);

CREATE POLICY "sessions_write_policy" ON public.sessions
  FOR ALL USING (auth.uid() = host_id);

-- Profiles
CREATE POLICY "profiles_read_policy" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id OR 
    id IN (SELECT DISTINCT host_id FROM public.sessions WHERE status = 'published')
  );

CREATE POLICY "profiles_write_policy" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- Enrollments
CREATE POLICY "enrollments_read_policy" ON public.enrollments
  FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT host_id FROM public.sessions WHERE id = enrollments.session_id)
  );

CREATE POLICY "enrollments_write_policy" ON public.enrollments
  FOR ALL USING (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT host_id FROM public.sessions WHERE id = enrollments.session_id)
  );

-- 7. ACTIVATION RLS SUR TOUTES LES TABLES
-- =====================================================

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;