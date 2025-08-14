-- 12. VÉRIFICATIONS FINALES ET FOREIGN KEYS
-- =====================================================

-- Vérifier les foreign keys critiques
DO $$
BEGIN
  -- FK sessions -> profiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints 
    WHERE constraint_name = 'sessions_host_id_fkey'
  ) THEN
    ALTER TABLE public.sessions 
    ADD CONSTRAINT sessions_host_id_fkey 
    FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  -- FK enrollments -> sessions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints 
    WHERE constraint_name = 'enrollments_session_id_fkey'
  ) THEN
    ALTER TABLE public.enrollments 
    ADD CONSTRAINT enrollments_session_id_fkey 
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
  END IF;

  -- FK enrollments -> profiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints 
    WHERE constraint_name = 'enrollments_user_id_fkey'
  ) THEN
    ALTER TABLE public.enrollments 
    ADD CONSTRAINT enrollments_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 13. ASSURER LA COHÉRENCE DES DONNÉES
-- =====================================================

-- Mise à jour des timestamps NULL
UPDATE public.profiles 
SET updated_at = now() 
WHERE updated_at IS NULL;

UPDATE public.sessions 
SET created_at = now() 
WHERE created_at IS NULL;

-- Validation des coordonnées existantes
UPDATE public.sessions 
SET location_lat = GREATEST(-90, LEAST(90, location_lat)),
    location_lng = GREATEST(-180, LEAST(180, location_lng))
WHERE location_lat < -90 OR location_lat > 90 OR location_lng < -180 OR location_lng > 180;

-- 14. VÉRIFICATIONS RLS
-- =====================================================

-- Vérifier que toutes les tables ont RLS activé
DO $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN 
        SELECT schemaname, tablename, rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN ('profiles', 'sessions', 'enrollments', 'subscribers')
        AND rowsecurity = false
    LOOP
        RAISE NOTICE 'Table %.% n''a pas RLS activé!', table_record.schemaname, table_record.tablename;
    END LOOP;
END $$;

-- Statistiques finales
SELECT 
  'profiles' as table_name, COUNT(*) as count FROM public.profiles
UNION ALL
SELECT 
  'sessions' as table_name, COUNT(*) as count FROM public.sessions
UNION ALL
SELECT 
  'enrollments' as table_name, COUNT(*) as count FROM public.enrollments;