-- =====================================================
-- NETTOYAGE COMPLET AVEC GESTION DES DÉPENDANCES
-- =====================================================

-- 1. SUPPRESSION DES DÉPENDANCES DANS L'ORDRE
-- =====================================================

-- D'abord supprimer tous les triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
DROP TRIGGER IF EXISTS update_enrollments_updated_at ON enrollments;
DROP TRIGGER IF EXISTS update_sessions_on_profile_change ON profiles;
DROP TRIGGER IF EXISTS update_sessions_on_enrollment_change ON enrollments;

-- Supprimer les publications realtime
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime DROP TABLE sessions;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime DROP TABLE enrollments;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

-- Supprimer les politiques RLS
DROP POLICY IF EXISTS "profiles_read_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_write_policy" ON profiles;
DROP POLICY IF EXISTS "sessions_read_policy" ON sessions;
DROP POLICY IF EXISTS "sessions_write_policy" ON sessions;
DROP POLICY IF EXISTS "enrollments_read_policy" ON enrollments;
DROP POLICY IF EXISTS "enrollments_write_policy" ON enrollments;
DROP POLICY IF EXISTS "select_own_subscription" ON subscribers;
DROP POLICY IF EXISTS "subscribers_update_own" ON subscribers;
DROP POLICY IF EXISTS "subscribers_insert_own" ON subscribers;
DROP POLICY IF EXISTS "audit_log_read_own" ON audit_log;

-- Supprimer les vues
DROP VIEW IF EXISTS sessions_with_details;

-- Supprimer toutes les fonctions avec CASCADE pour gérer les dépendances
DROP FUNCTION IF EXISTS can_enroll_in_session(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_session_status(uuid) CASCADE;
DROP FUNCTION IF EXISTS is_session_open(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_user_sessions(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_user_enrollments(uuid) CASCADE;
DROP FUNCTION IF EXISTS update_session_denormalized_data() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_sessions() CASCADE;
DROP FUNCTION IF EXISTS audit_trigger() CASCADE;
DROP FUNCTION IF EXISTS record_user_deletion() CASCADE;
DROP FUNCTION IF EXISTS is_user_deleted(text) CASCADE;
DROP FUNCTION IF EXISTS cleanup_database() CASCADE;
DROP FUNCTION IF EXISTS handle_auth_user_deleted() CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_audit_logs() CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_deleted_users() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

-- Supprimer les tables (CASCADE pour gérer les contraintes)
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS deleted_users CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS subscribers CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 2. CRÉATION DU NOUVEAU SCHÉMA PROPRE
-- =====================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table des profils utilisateurs
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text,
  phone text,
  age integer CHECK (age >= 16 AND age <= 100),
  gender text CHECK (gender IN ('homme', 'femme', 'autre')),
  avatar_url text,
  role text DEFAULT 'participant' CHECK (role IN ('participant', 'host', 'admin')),
  
  -- Abonnement Stripe
  stripe_customer_id text,
  sub_status text DEFAULT 'inactive' CHECK (sub_status IN ('inactive', 'active', 'trialing', 'canceled', 'past_due')),
  sub_current_period_end timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table des sessions de course
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Détails session
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 100),
  description text CHECK (length(description) <= 500),
  
  -- Horaire
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer DEFAULT 60 CHECK (duration_minutes BETWEEN 30 AND 180),
  
  -- Localisation
  start_lat numeric NOT NULL CHECK (start_lat BETWEEN -90 AND 90),
  start_lng numeric NOT NULL CHECK (start_lng BETWEEN -180 AND 180),
  end_lat numeric CHECK (end_lat BETWEEN -90 AND 90),
  end_lng numeric CHECK (end_lng BETWEEN -180 AND 180),
  location_hint text CHECK (length(location_hint) <= 100),
  
  -- Caractéristiques
  distance_km numeric NOT NULL CHECK (distance_km BETWEEN 1 AND 50),
  intensity text NOT NULL CHECK (intensity IN ('low', 'medium', 'high')),
  session_type text DEFAULT 'mixed' CHECK (session_type IN ('mixed', 'women_only', 'men_only')),
  
  -- Participants
  min_participants integer DEFAULT 2 CHECK (min_participants >= 2),
  max_participants integer NOT NULL CHECK (max_participants BETWEEN 3 AND 20),
  
  -- Tarification
  price_cents integer DEFAULT 450 CHECK (price_cents BETWEEN 0 AND 5000),
  host_fee_cents integer DEFAULT 200 CHECK (host_fee_cents >= 0),
  
  -- Statut
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Contraintes métier
  CONSTRAINT valid_participant_count CHECK (min_participants <= max_participants),
  CONSTRAINT valid_host_fee CHECK (host_fee_cents <= price_cents),
  CONSTRAINT valid_end_location CHECK ((end_lat IS NULL AND end_lng IS NULL) OR (end_lat IS NOT NULL AND end_lng IS NOT NULL))
);

-- Table des inscriptions
CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Paiement Stripe
  stripe_session_id text,
  stripe_payment_intent_id text,
  amount_paid_cents integer,
  paid_at timestamptz,
  
  -- Statut
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'confirmed', 'cancelled', 'noshow', 'present')),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(session_id, user_id)
);

-- Table des abonnements
CREATE TABLE public.subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  stripe_customer_id text,
  subscribed boolean DEFAULT false,
  subscription_tier text DEFAULT 'premium',
  subscription_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. FONCTIONS UTILITAIRES
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
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

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Erreur création profil pour %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION has_active_subscription(user_profile profiles)
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

-- 4. TRIGGERS
-- =====================================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enrollments_updated_at
  BEFORE UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- Politiques Profiles
CREATE POLICY "profiles_select_policy" ON profiles
  FOR SELECT USING (
    auth.uid() = id OR 
    id IN (SELECT DISTINCT host_id FROM sessions WHERE status = 'published')
  );

CREATE POLICY "profiles_write_policy" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Politiques Sessions
CREATE POLICY "sessions_select_policy" ON sessions
  FOR SELECT USING (status = 'published' OR auth.uid() = host_id);

CREATE POLICY "sessions_write_policy" ON sessions
  FOR ALL USING (auth.uid() = host_id);

-- Politiques Enrollments
CREATE POLICY "enrollments_select_policy" ON enrollments
  FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT host_id FROM sessions WHERE id = enrollments.session_id)
  );

CREATE POLICY "enrollments_write_policy" ON enrollments
  FOR ALL USING (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT host_id FROM sessions WHERE id = enrollments.session_id)
  );

-- Politiques Subscribers
CREATE POLICY "subscribers_own_policy" ON subscribers
  FOR ALL USING (auth.uid() = user_id OR auth.email() = email);

-- 6. INDEX POUR PERFORMANCES
-- =====================================================

CREATE INDEX idx_sessions_published_scheduled ON sessions(status, scheduled_at) WHERE status = 'published';
CREATE INDEX idx_sessions_location ON sessions(start_lat, start_lng) WHERE status = 'published';
CREATE INDEX idx_sessions_host_id ON sessions(host_id);
CREATE INDEX idx_enrollments_session_id ON enrollments(session_id);
CREATE INDEX idx_enrollments_user_id ON enrollments(user_id);
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_stripe_customer ON profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- 7. STORAGE POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;

CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- 8. VUE SESSIONS AVEC DÉTAILS
-- =====================================================

CREATE VIEW sessions_with_details AS
SELECT 
  s.*,
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  COALESCE(e.enrollment_count, 0) as current_enrollments,
  (s.max_participants - COALESCE(e.enrollment_count, 0)) as available_spots
FROM sessions s
LEFT JOIN profiles p ON s.host_id = p.id
LEFT JOIN (
  SELECT 
    session_id, 
    COUNT(*) as enrollment_count
  FROM enrollments 
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
) e ON s.id = e.session_id;

-- 9. REALTIME
-- =====================================================

ALTER TABLE sessions REPLICA IDENTITY FULL;
ALTER TABLE enrollments REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE enrollments;