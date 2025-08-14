-- Finalisation complète de la migration critique MeetRun

-- 12. VÉRIFICATIONS ET FOREIGN KEYS
-- =====================================================

-- Ajouter les foreign keys manquantes si elles n'existent pas
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

-- Mise à jour des sessions avec des valeurs par défaut manquantes
UPDATE public.sessions 
SET blur_radius_m = 1000 
WHERE blur_radius_m IS NULL;

UPDATE public.sessions 
SET price_cents = 450 
WHERE price_cents IS NULL;

UPDATE public.sessions 
SET host_payout_cents = 200 
WHERE host_payout_cents IS NULL;