-- Suite de la migration - Storage policies et optimisations
-- =====================================================

DROP POLICY IF EXISTS "Users upload own avatars" ON storage.objects;
CREATE POLICY "Users upload own avatars" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users update own avatars" ON storage.objects;
CREATE POLICY "Users update own avatars" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own avatars" ON storage.objects;
CREATE POLICY "Users delete own avatars" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 4. REALTIME CONFIGURATION
-- =====================================================

-- Activer Realtime sur sessions
ALTER TABLE public.sessions REPLICA IDENTITY FULL;

-- Ajouter à la publication Realtime (seulement si pas déjà présent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
  END IF;
END $$;

-- 5. INDEX POUR PERFORMANCES
-- =====================================================

-- Index pour les requêtes fréquentes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_date_location 
ON public.sessions(date, location_lat, location_lng);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_host_date 
ON public.sessions(host_id, date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_session_user 
ON public.enrollments(session_id, user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_user_status 
ON public.enrollments(user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_stripe_customer 
ON public.profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- 6. CONTRAINTES DE VALIDATION
-- =====================================================

-- Sessions : validation des données
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'sessions_max_participants_check'
  ) THEN
    ALTER TABLE public.sessions 
    ADD CONSTRAINT sessions_max_participants_check 
    CHECK (max_participants >= 3 AND max_participants <= 20);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'sessions_price_check'
  ) THEN
    ALTER TABLE public.sessions 
    ADD CONSTRAINT sessions_price_check 
    CHECK (price_cents >= 0);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'sessions_coordinates_check'
  ) THEN
    ALTER TABLE public.sessions 
    ADD CONSTRAINT sessions_coordinates_check 
    CHECK (
      location_lat >= -90 AND location_lat <= 90 AND
      location_lng >= -180 AND location_lng <= 180 AND
      (end_lat IS NULL OR (end_lat >= -90 AND end_lat <= 90)) AND
      (end_lng IS NULL OR (end_lng >= -180 AND end_lng <= 180))
    );
  END IF;
END $$;