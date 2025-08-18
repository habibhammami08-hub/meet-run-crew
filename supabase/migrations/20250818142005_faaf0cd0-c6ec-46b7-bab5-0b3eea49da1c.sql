-- Refonte complète Backend MeetRun
-- 1. Suppression de l'ancien schéma
DROP TABLE IF EXISTS public.runs CASCADE;
DROP TABLE IF EXISTS public.registrations CASCADE;
DROP TABLE IF EXISTS public.subscribers CASCADE;
DROP TABLE IF EXISTS public.enrollments CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.deleted_users CASCADE;

-- Suppression des vues
DROP VIEW IF EXISTS public.sessions_view CASCADE;
DROP VIEW IF EXISTS public.sessions_with_details CASCADE;
DROP VIEW IF EXISTS public.deletion_stats CASCADE;

-- Suppression des fonctions
DROP FUNCTION IF EXISTS public.update_participant_profile() CASCADE;
DROP FUNCTION IF EXISTS public.update_host_profile() CASCADE;
DROP FUNCTION IF EXISTS public.app_delete_account() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_deleted_user_recreation() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_protected() CASCADE;
DROP FUNCTION IF EXISTS public.record_user_deletion() CASCADE;
DROP FUNCTION IF EXISTS public.mark_enrollment_completed(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_old_deleted_users() CASCADE;
DROP FUNCTION IF EXISTS public.is_user_deleted(text) CASCADE;
DROP FUNCTION IF EXISTS public.sessions_force_fixed_price() CASCADE;
DROP FUNCTION IF EXISTS public.has_active_subscription(profiles) CASCADE;

-- 2. Nouveau schéma MeetRun

-- Table des profils utilisateurs
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  age INTEGER CHECK (age >= 16 AND age <= 99),
  gender TEXT CHECK (gender IN ('homme', 'femme', 'autre')),
  phone TEXT,
  city TEXT,
  avatar_url TEXT,
  
  -- Abonnement Stripe
  stripe_customer_id TEXT UNIQUE,
  sub_status TEXT DEFAULT 'inactive' CHECK (sub_status IN ('inactive', 'active', 'trialing', 'canceled', 'past_due')),
  sub_current_period_end TIMESTAMPTZ,
  
  -- Statistiques
  sessions_hosted INTEGER DEFAULT 0,
  sessions_joined INTEGER DEFAULT 0,
  total_km DECIMAL(8,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des sessions de running
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Informations de base
  title TEXT NOT NULL CHECK (length(title) >= 3 AND length(title) <= 100),
  description TEXT CHECK (length(description) <= 500),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60 CHECK (duration_minutes BETWEEN 30 AND 240),
  
  -- Géolocalisation (obligatoires)
  start_lat DECIMAL(10,8) NOT NULL CHECK (start_lat BETWEEN -90 AND 90),
  start_lng DECIMAL(11,8) NOT NULL CHECK (start_lng BETWEEN -180 AND 180),
  end_lat DECIMAL(10,8) CHECK (end_lat BETWEEN -90 AND 90),
  end_lng DECIMAL(11,8) CHECK (end_lng BETWEEN -180 AND 180),
  
  -- Descriptions lieux
  start_place TEXT,
  end_place TEXT,
  location_hint TEXT,
  
  -- Parcours
  distance_km DECIMAL(6,2) NOT NULL CHECK (distance_km > 0 AND distance_km <= 50),
  route_polyline TEXT,
  route_distance_m INTEGER,
  
  -- Paramètres session
  intensity TEXT NOT NULL CHECK (intensity IN ('low', 'medium', 'high')),
  session_type TEXT DEFAULT 'mixed' CHECK (session_type IN ('mixed', 'women_only', 'men_only')),
  max_participants INTEGER NOT NULL CHECK (max_participants BETWEEN 2 AND 20),
  min_participants INTEGER DEFAULT 2 CHECK (min_participants >= 2),
  
  -- Monétisation
  price_cents INTEGER DEFAULT 450 CHECK (price_cents >= 0 AND price_cents <= 10000),
  host_fee_cents INTEGER DEFAULT 0,
  price_currency TEXT DEFAULT 'EUR',
  
  -- Masquage pour non-abonnés
  blur_radius_m INTEGER DEFAULT 800 CHECK (blur_radius_m BETWEEN 100 AND 2000),
  
  -- État
  status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des inscriptions aux sessions
CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Statut de l'inscription
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',
    'paid',
    'included_by_subscription',
    'confirmed',
    'cancelled',
    'noshow',
    'present'
  )),
  
  -- Paiement Stripe
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  amount_paid_cents INTEGER,
  paid_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(session_id, user_id)
);

-- Table de suppression (RGPD)
CREATE TABLE public.deleted_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deletion_reason TEXT
);

-- Index pour optimisation
CREATE INDEX idx_sessions_location ON public.sessions USING GIST (
  point(start_lng, start_lat)
);

CREATE INDEX idx_sessions_scheduled ON public.sessions (scheduled_at) 
WHERE status = 'published';

CREATE INDEX idx_profiles_active_sub ON public.profiles (sub_status, sub_current_period_end) 
WHERE sub_status IN ('active', 'trialing');

CREATE INDEX idx_enrollments_user_status ON public.enrollments (user_id, status);
CREATE INDEX idx_enrollments_session_status ON public.enrollments (session_id, status);

-- Vue avec détails
CREATE VIEW public.sessions_with_details AS
SELECT 
  s.*,
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  COUNT(e.id) FILTER (WHERE e.status IN ('paid', 'included_by_subscription', 'confirmed')) as current_enrollments,
  (s.max_participants - COUNT(e.id) FILTER (WHERE e.status IN ('paid', 'included_by_subscription', 'confirmed'))) as available_spots
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_id = p.id
LEFT JOIN public.enrollments e ON s.id = e.session_id
GROUP BY s.id, p.id;

-- Fonctions utilitaires
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_profile public.profiles)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN user_profile.sub_status IN ('active', 'trialing') 
    AND (user_profile.sub_current_period_end IS NULL 
         OR user_profile.sub_current_period_end > NOW());
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_available_spots(session_id UUID)
RETURNS INTEGER AS $$
DECLARE
  max_spots INTEGER;
  taken_spots INTEGER;
BEGIN
  SELECT max_participants INTO max_spots
  FROM public.sessions WHERE id = session_id;
  
  SELECT COUNT(*) INTO taken_spots
  FROM public.enrollments 
  WHERE session_id = get_available_spots.session_id 
    AND status IN ('paid', 'included_by_subscription', 'confirmed');
  
  RETURN GREATEST(0, max_spots - taken_spots);
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON public.profiles 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at 
  BEFORE UPDATE ON public.sessions 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger pour créer profil automatiquement
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Politiques RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_users ENABLE ROW LEVEL SECURITY;

-- Policies pour profiles
CREATE POLICY "Public profiles visible" ON public.profiles
FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

-- Policies pour sessions
CREATE POLICY "Published sessions visible" ON public.sessions
FOR SELECT USING (status = 'published');

CREATE POLICY "Hosts can manage own sessions" ON public.sessions
FOR ALL USING (auth.uid() = host_id);

CREATE POLICY "Authenticated users can create sessions" ON public.sessions
FOR INSERT WITH CHECK (
  auth.uid() = host_id AND 
  auth.uid() IS NOT NULL
);

-- Policies pour enrollments
CREATE POLICY "Users see own enrollments" ON public.enrollments
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Hosts see session enrollments" ON public.enrollments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.sessions s 
    WHERE s.id = session_id AND s.host_id = auth.uid()
  )
);

CREATE POLICY "Users can enroll" ON public.enrollments
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.sessions s 
    WHERE s.id = session_id 
    AND s.status = 'published'
    AND s.scheduled_at > NOW()
  )
);

CREATE POLICY "Users can cancel enrollment" ON public.enrollments
FOR UPDATE USING (auth.uid() = user_id);

-- Policy pour deleted_users (admin seulement)
CREATE POLICY "Admin only access" ON public.deleted_users
FOR ALL USING (false);