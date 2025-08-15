-- =====================================================
-- MIGRATION FINALE - CONSOLIDATION MEETRUN SCHEMA
-- Finalisation de la standardisation du schéma
-- =====================================================

-- =====================================================
-- 1. NETTOYAGE ET FINALISATION TABLE SESSIONS
-- =====================================================

-- Supprimer les colonnes redondantes s'il y en a
DO $$
BEGIN
    -- Supprimer area_hint si location_hint existe déjà
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'area_hint') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'location_hint') THEN
        -- Copier les données de area_hint vers location_hint si location_hint est vide
        UPDATE public.sessions 
        SET location_hint = area_hint 
        WHERE location_hint IS NULL AND area_hint IS NOT NULL;
        
        -- Supprimer area_hint
        ALTER TABLE public.sessions DROP COLUMN area_hint;
    END IF;
    
    -- Supprimer host_payout_cents si host_fee_cents existe déjà
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_payout_cents') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_fee_cents') THEN
        -- Copier les données si nécessaire
        UPDATE public.sessions 
        SET host_fee_cents = host_payout_cents 
        WHERE host_fee_cents IS NULL AND host_payout_cents IS NOT NULL;
        
        -- Supprimer host_payout_cents
        ALTER TABLE public.sessions DROP COLUMN host_payout_cents;
    END IF;
    
    -- Supprimer type si session_type existe déjà
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'type') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'session_type') THEN
        -- Copier les données si nécessaire
        UPDATE public.sessions 
        SET session_type = type 
        WHERE session_type IS NULL AND type IS NOT NULL;
        
        -- Supprimer type
        ALTER TABLE public.sessions DROP COLUMN type;
    END IF;
    
    -- Supprimer date si scheduled_at existe déjà
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'date') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'scheduled_at') THEN
        -- Copier les données si nécessaire
        UPDATE public.sessions 
        SET scheduled_at = date 
        WHERE scheduled_at IS NULL AND date IS NOT NULL;
        
        -- Supprimer date
        ALTER TABLE public.sessions DROP COLUMN date;
    END IF;
END $$;

-- Mettre à jour les valeurs par défaut pour les nouvelles colonnes
UPDATE public.sessions 
SET 
    duration_minutes = 60 
WHERE duration_minutes IS NULL;

UPDATE public.sessions 
SET 
    min_participants = 2 
WHERE min_participants IS NULL;

UPDATE public.sessions 
SET 
    status = 'draft' 
WHERE status IS NULL;

UPDATE public.sessions 
SET 
    session_type = 'mixed' 
WHERE session_type IS NULL;

UPDATE public.sessions 
SET 
    host_fee_cents = 200 
WHERE host_fee_cents IS NULL;

-- Rendre les colonnes non-nullables après avoir défini les valeurs par défaut
ALTER TABLE public.sessions 
ALTER COLUMN duration_minutes SET NOT NULL,
ALTER COLUMN min_participants SET NOT NULL,
ALTER COLUMN status SET NOT NULL,
ALTER COLUMN session_type SET NOT NULL,
ALTER COLUMN host_fee_cents SET NOT NULL;

-- =====================================================
-- 2. AJOUTER TOUTES LES CONTRAINTES MANQUANTES
-- =====================================================

DO $$
BEGIN
    -- Contraintes pour sessions
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_title_length 
        CHECK (length(title) BETWEEN 3 AND 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_description_length 
        CHECK (description IS NULL OR length(description) <= 500);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_start_lat_range 
        CHECK (start_lat BETWEEN -90 AND 90);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_start_lng_range 
        CHECK (start_lng BETWEEN -180 AND 180);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_end_lat_range 
        CHECK (end_lat IS NULL OR end_lat BETWEEN -90 AND 90);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_end_lng_range 
        CHECK (end_lng IS NULL OR end_lng BETWEEN -180 AND 180);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_intensity_values 
        CHECK (intensity IN ('low', 'medium', 'high'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_session_type_values 
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
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_min_participants_range 
        CHECK (min_participants >= 2);
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
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_host_fee_range 
        CHECK (host_fee_cents >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_valid_host_fee 
        CHECK (host_fee_cents <= price_cents);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_distance_range 
        CHECK (distance_km BETWEEN 1 AND 50);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_duration_range 
        CHECK (duration_minutes BETWEEN 30 AND 180);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_location_hint_length 
        CHECK (location_hint IS NULL OR length(location_hint) <= 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- =====================================================
-- 3. FINALISER LES INDEX DE PERFORMANCE
-- =====================================================

-- Index optimisés pour les requêtes courantes
CREATE INDEX IF NOT EXISTS idx_sessions_published_scheduled 
ON public.sessions(status, scheduled_at) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_sessions_geo_search 
ON public.sessions(start_lat, start_lng, scheduled_at) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_sessions_host_date 
ON public.sessions(host_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_status 
ON public.enrollments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_enrollments_session_status 
ON public.enrollments(session_id, status);

-- =====================================================
-- 4. VUES FINALES OPTIMISÉES
-- =====================================================

-- Vue des sessions avec toutes les informations nécessaires
CREATE OR REPLACE VIEW public.sessions_with_details AS
SELECT 
  s.*,
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  p.email as host_email,
  COALESCE(enrollment_counts.count, 0) as current_enrollments,
  CASE 
    WHEN s.scheduled_at < now() THEN 'past'
    WHEN COALESCE(enrollment_counts.count, 0) >= s.max_participants THEN 'full'
    WHEN s.status = 'published' AND s.scheduled_at > now() THEN 'available'
    ELSE s.status
  END as computed_status,
  -- Calculer s'il reste des places
  (s.max_participants - COALESCE(enrollment_counts.count, 0)) as available_spots
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

-- Vue des enrollments avec toutes les informations
CREATE OR REPLACE VIEW public.enrollments_with_details AS
SELECT 
  e.*,
  p.full_name as participant_name,
  p.avatar_url as participant_avatar,
  p.email as participant_email,
  s.title as session_title,
  s.scheduled_at as session_date,
  s.location_hint as session_location,
  s.price_cents as session_price,
  s.start_lat,
  s.start_lng,
  hp.full_name as host_name
FROM public.enrollments e
LEFT JOIN public.profiles p ON e.user_id = p.id
LEFT JOIN public.sessions s ON e.session_id = s.id
LEFT JOIN public.profiles hp ON s.host_id = hp.id;

-- =====================================================
-- 5. FONCTIONS UTILITAIRES FINALES
-- =====================================================

-- Fonction pour obtenir le statut d'une session
CREATE OR REPLACE FUNCTION public.get_session_status(session_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_record RECORD;
  enrollment_count INTEGER;
BEGIN
  -- Récupérer les informations de la session
  SELECT s.*, COUNT(e.id) as enrollments
  INTO session_record
  FROM public.sessions s
  LEFT JOIN public.enrollments e ON s.id = e.session_id 
    AND e.status IN ('paid', 'confirmed', 'present')
  WHERE s.id = session_id
  GROUP BY s.id;
  
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  
  -- Déterminer le statut
  IF session_record.scheduled_at < now() THEN
    RETURN 'past';
  ELSIF session_record.enrollments >= session_record.max_participants THEN
    RETURN 'full';
  ELSIF session_record.status = 'published' THEN
    RETURN 'available';
  ELSE
    RETURN session_record.status;
  END IF;
END;
$$;

-- Fonction pour calculer les revenus d'un hôte
CREATE OR REPLACE FUNCTION public.calculate_host_earnings(host_user_id uuid, start_date date DEFAULT NULL, end_date date DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  earnings json;
  session_count INTEGER;
  total_enrollments INTEGER;
  total_revenue INTEGER;
BEGIN
  SELECT 
    COUNT(DISTINCT s.id) as sessions,
    COUNT(e.id) as enrollments,
    COALESCE(SUM(s.host_fee_cents), 0) as revenue
  INTO session_count, total_enrollments, total_revenue
  FROM public.sessions s
  LEFT JOIN public.enrollments e ON s.id = e.session_id 
    AND e.status IN ('paid', 'confirmed', 'present')
  WHERE s.host_id = host_user_id
    AND s.status = 'completed'
    AND (start_date IS NULL OR s.scheduled_at::date >= start_date)
    AND (end_date IS NULL OR s.scheduled_at::date <= end_date);
  
  SELECT json_build_object(
    'session_count', session_count,
    'total_enrollments', total_enrollments,
    'total_revenue_cents', total_revenue,
    'average_revenue_per_session', 
      CASE WHEN session_count > 0 THEN total_revenue / session_count ELSE 0 END
  ) INTO earnings;
  
  RETURN earnings;
END;
$$;

-- =====================================================
-- 6. STATISTIQUES FINALES
-- =====================================================

-- Afficher le résumé de la migration
SELECT 
  'Migration completed successfully!' as status,
  'PROFILES' as table_name, 
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL) as with_stripe_customer
FROM public.profiles

UNION ALL

SELECT 
  '',
  'SESSIONS',
  COUNT(*),
  COUNT(*) FILTER (WHERE status = 'published')
FROM public.sessions

UNION ALL

SELECT 
  '',
  'ENROLLMENTS',
  COUNT(*),
  COUNT(*) FILTER (WHERE status = 'paid')
FROM public.enrollments

UNION ALL

SELECT 
  '',
  'SUBSCRIBERS',
  COUNT(*),
  COUNT(*) FILTER (WHERE subscribed = true)
FROM public.subscribers

ORDER BY table_name;