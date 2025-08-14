-- Migration finale - Corrections critiques MeetRun
-- Application de toutes les corrections identifiées dans l'analyse

-- 1. Storage bucket avatars avec policies RLS
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Policies Storage pour avatars
CREATE POLICY IF NOT EXISTS "Public read avatars" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'avatars');

CREATE POLICY IF NOT EXISTS "Users upload own avatars" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY IF NOT EXISTS "Users update own avatars" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Corrections RLS - Policies plus permissives pour profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Profiles : lecture publique (nécessaire pour afficher les hosts)
CREATE POLICY "Public can view profiles" ON public.profiles
FOR SELECT USING (true);

-- Sessions : lecture publique déjà existante, on vérifie juste
DROP POLICY IF EXISTS "Public can view all sessions" ON public.sessions;
CREATE POLICY IF NOT EXISTS "Public can view sessions" ON public.sessions
FOR SELECT USING (true);

-- 3. Realtime sur sessions
ALTER TABLE public.sessions REPLICA IDENTITY FULL;

-- Ajouter sessions à la publication realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
  END IF;
END
$$;

-- 4. Backfill profils manquants
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
SELECT 
  u.id, 
  u.email, 
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  now(),
  now()
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 5. Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_sessions_date_location 
ON public.sessions(date, location_lat, location_lng);

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer 
ON public.profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- 6. Contraintes de validation améliorées
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'check_max_participants_positive'
    AND table_name = 'sessions'
  ) THEN
    ALTER TABLE public.sessions 
    ADD CONSTRAINT check_max_participants_positive 
    CHECK (max_participants > 0);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'check_price_positive'
    AND table_name = 'sessions'
  ) THEN
    ALTER TABLE public.sessions 
    ADD CONSTRAINT check_price_positive 
    CHECK (price_cents >= 0);
  END IF;
END $$;