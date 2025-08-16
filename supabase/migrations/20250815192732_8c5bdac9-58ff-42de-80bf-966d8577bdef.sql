-- =====================================================
-- MIGRATION DE CORRECTION - MEETRUN DATABASE
-- Correction des erreurs critiques identifiées
-- =====================================================

-- 1. CORRECTION DES CONTRAINTES DUPLIQUÉES
-- =====================================================

-- Supprimer les contraintes dupliquées qui causent des erreurs
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- Supprimer les contraintes dupliquées sur sessions
    FOR constraint_record IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.sessions'::regclass 
        AND contype = 'c'
        AND conname SIMILAR TO '%(check|chk)_%'
    LOOP
        BEGIN
            EXECUTE 'ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS ' || constraint_record.conname;
        EXCEPTION WHEN OTHERS THEN
            -- Ignorer les erreurs si la contrainte n'existe pas
            NULL;
        END;
    END LOOP;
END $$;

-- Recréer les contraintes essentielles une seule fois
ALTER TABLE public.sessions 
ADD CONSTRAINT sessions_intensity_valid 
CHECK (intensity IN ('low', 'medium', 'high')),

ADD CONSTRAINT sessions_session_type_valid 
CHECK (session_type IN ('mixed', 'women_only', 'men_only')),

ADD CONSTRAINT sessions_status_valid 
CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),

ADD CONSTRAINT sessions_participants_valid 
CHECK (min_participants <= max_participants AND min_participants >= 2 AND max_participants <= 20),

ADD CONSTRAINT sessions_price_valid 
CHECK (price_cents >= 0 AND price_cents <= 10000),

ADD CONSTRAINT sessions_fee_valid 
CHECK (host_fee_cents >= 0 AND host_fee_cents <= price_cents),

ADD CONSTRAINT sessions_distance_valid 
CHECK (distance_km > 0 AND distance_km <= 50);

-- 2. CORRECTION DES COLONNES GÉOGRAPHIQUES
-- =====================================================

-- Renommer correctement les colonnes géographiques
DO $$
BEGIN
    -- Renommer location_lat vers start_lat si nécessaire
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sessions' AND column_name = 'location_lat') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'sessions' AND column_name = 'start_lat') THEN
        ALTER TABLE public.sessions RENAME COLUMN location_lat TO start_lat;
    END IF;
    
    -- Renommer location_lng vers start_lng si nécessaire
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sessions' AND column_name = 'location_lng') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'sessions' AND column_name = 'start_lng') THEN
        ALTER TABLE public.sessions RENAME COLUMN location_lng TO start_lng;
    END IF;
END $$;

-- Ajouter les contraintes géographiques correctes
ALTER TABLE public.sessions 
ADD CONSTRAINT sessions_coordinates_valid 
CHECK (
  start_lat BETWEEN -90 AND 90 AND 
  start_lng BETWEEN -180 AND 180 AND
  (end_lat IS NULL OR end_lat BETWEEN -90 AND 90) AND
  (end_lng IS NULL OR end_lng BETWEEN -180 AND 180)
);

-- 3. CORRECTION DES FOREIGN KEYS
-- =====================================================

-- Supprimer et recréer les foreign keys avec CASCADE appropriés
ALTER TABLE public.enrollments 
DROP CONSTRAINT IF EXISTS enrollments_user_id_fkey,
DROP CONSTRAINT IF EXISTS enrollments_session_id_fkey;

ALTER TABLE public.enrollments 
ADD CONSTRAINT enrollments_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
ADD CONSTRAINT enrollments_session_id_fkey 
FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE public.sessions 
DROP CONSTRAINT IF EXISTS sessions_host_id_fkey;

ALTER TABLE public.sessions 
ADD CONSTRAINT sessions_host_id_fkey 
FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Corriger la table subscribers si elle existe
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscribers') THEN
        ALTER TABLE public.subscribers 
        DROP CONSTRAINT IF EXISTS subscribers_user_id_fkey;
        
        ALTER TABLE public.subscribers 
        ADD CONSTRAINT subscribers_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. CORRECTION DES POLITIQUES RLS
-- =====================================================

-- Supprimer toutes les politiques conflictuelles
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Supprimer les politiques sur sessions
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'sessions'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON public.sessions';
    END LOOP;
    
    -- Supprimer les politiques sur profiles
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'profiles'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON public.profiles';
    END LOOP;
    
    -- Supprimer les politiques sur enrollments
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'enrollments'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON public.enrollments';
    END LOOP;
END $$;

-- Recréer les politiques RLS propres et sécurisées
-- Sessions
CREATE POLICY "sessions_select_policy" ON public.sessions
  FOR SELECT USING (status = 'published' OR auth.uid() = host_id);

CREATE POLICY "sessions_insert_policy" ON public.sessions
  FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "sessions_update_policy" ON public.sessions
  FOR UPDATE USING (auth.uid() = host_id);

CREATE POLICY "sessions_delete_policy" ON public.sessions
  FOR DELETE USING (auth.uid() = host_id);

-- Profiles  
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id OR 
    id IN (SELECT DISTINCT host_id FROM public.sessions WHERE status = 'published')
  );

CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_delete_policy" ON public.profiles
  FOR DELETE USING (auth.uid() = id);

-- Enrollments
CREATE POLICY "enrollments_select_policy" ON public.enrollments
  FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT host_id FROM public.sessions WHERE id = enrollments.session_id)
  );

CREATE POLICY "enrollments_insert_policy" ON public.enrollments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "enrollments_update_policy" ON public.enrollments
  FOR UPDATE USING (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT host_id FROM public.sessions WHERE id = enrollments.session_id)
  );

CREATE POLICY "enrollments_delete_policy" ON public.enrollments
  FOR DELETE USING (
    auth.uid() = user_id OR 
    auth.uid() IN (SELECT host_id FROM public.sessions WHERE id = enrollments.session_id)
  );

-- 5. CORRECTION DES FONCTIONS SÉCURISÉES
-- =====================================================

-- Corriger la fonction handle_new_user avec search_path sécurisé
CREATE OR REPLACE FUNCTION public.handle_new_user()
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
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log l'erreur mais ne pas bloquer la création d'utilisateur
        RAISE WARNING 'Erreur lors de la création du profil pour %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

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

-- Fonction simple pour mise à jour des timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
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

-- 6. CORRECTION DES TRIGGERS
-- =====================================================

-- S'assurer que le trigger principal existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Triggers pour updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. NETTOYAGE DES VUES CASSÉES
-- =====================================================

-- Supprimer toutes les vues potentiellement cassées
DROP VIEW IF EXISTS public.sessions_complete CASCADE;
DROP VIEW IF EXISTS public.sessions_with_host CASCADE;
DROP VIEW IF EXISTS public.sessions_view CASCADE;
DROP VIEW IF EXISTS public.session_summary CASCADE;
DROP VIEW IF EXISTS public.session_details CASCADE;

-- Créer une vue principale propre et fonctionnelle
CREATE VIEW public.sessions_with_details AS
SELECT 
  s.id,
  s.title,
  s.description,
  s.scheduled_at,
  s.duration_minutes,
  s.start_lat,
  s.start_lng,
  s.end_lat,
  s.end_lng,
  s.location_hint,
  s.distance_km,
  s.intensity,
  s.session_type,
  s.max_participants,
  s.min_participants,
  s.price_cents,
  s.host_fee_cents,
  s.status,
  s.created_at,
  -- Informations de l'hôte
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  -- Statistiques d'inscription
  COALESCE(e.enrollment_count, 0) as current_enrollments,
  (s.max_participants - COALESCE(e.enrollment_count, 0)) as available_spots
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_id = p.id
LEFT JOIN (
  SELECT 
    session_id, 
    COUNT(*) as enrollment_count
  FROM public.enrollments 
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
) e ON s.id = e.session_id;

-- 8. CORRECTION DES INDEX
-- =====================================================

-- Supprimer les index potentiellement problématiques et les recréer
DROP INDEX IF EXISTS idx_sessions_date_location;
DROP INDEX IF EXISTS idx_sessions_geo_search;
DROP INDEX IF EXISTS idx_sessions_published_scheduled;

-- Créer des index optimisés et fonctionnels
CREATE INDEX IF NOT EXISTS idx_sessions_status_scheduled 
ON public.sessions(status, scheduled_at) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_sessions_location 
ON public.sessions(start_lat, start_lng) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_sessions_host_id 
ON public.sessions(host_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_session_id 
ON public.enrollments(session_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_id 
ON public.enrollments(user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_email 
ON public.profiles(email);

-- 9. VÉRIFICATION FINALE
-- =====================================================

-- Vérifier que RLS est activé sur toutes les tables principales
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- S'assurer que les tables ont les colonnes updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'updated_at') THEN
        ALTER TABLE public.profiles ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sessions' AND column_name = 'updated_at') THEN
        ALTER TABLE public.sessions ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'enrollments' AND column_name = 'updated_at') THEN
        ALTER TABLE public.enrollments ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;
END $$;

-- 10. RAPPORT FINAL
-- =====================================================

-- Vérification que tout est en ordre
SELECT 
  'CORRECTION TERMINÉE' as status,
  'Base de données stabilisée' as message,
  now() as completed_at

UNION ALL

SELECT 
  'Tables RLS',
  COUNT(*)::text || ' tables protégées',
  null
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('profiles', 'sessions', 'enrollments')
  AND rowsecurity = true

UNION ALL

SELECT 
  'Contraintes',
  COUNT(*)::text || ' contraintes actives',
  null
FROM pg_constraint 
WHERE conrelid IN ('public.sessions'::regclass, 'public.profiles'::regclass, 'public.enrollments'::regclass)

UNION ALL

SELECT 
  'Index',
  COUNT(*)::text || ' index optimisés',
  null
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('sessions', 'profiles', 'enrollments');