-- =====================================================
-- MIGRATION FINALE SIMPLIFIÉE - SANS INDEX TEMPORELS
-- Consolidation complète sans fonctions non-immutable dans les index
-- =====================================================

-- =====================================================
-- 1. NETTOYAGE COMPLET DES TRIGGERS PROBLÉMATIQUES
-- =====================================================

DROP TRIGGER IF EXISTS trigger_sessions_updated_at ON public.sessions CASCADE;
DROP TRIGGER IF EXISTS update_sessions_updated_at ON public.sessions CASCADE;
DROP TRIGGER IF EXISTS sessions_updated_at ON public.sessions CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;

-- =====================================================
-- 2. NETTOYAGE DES VUES EXISTANTES
-- =====================================================

DROP VIEW IF EXISTS public.sessions_with_host CASCADE;
DROP VIEW IF EXISTS public.sessions_with_details CASCADE;
DROP VIEW IF EXISTS public.enrollments_detailed CASCADE;
DROP VIEW IF EXISTS public.sessions_view CASCADE;
DROP VIEW IF EXISTS public.sessions_with_enrollment_info CASCADE;

-- =====================================================
-- 3. FINALISER LE NETTOYAGE DES COLONNES
-- =====================================================

-- Nettoyer les colonnes redondantes restantes
DO $$
BEGIN
    -- Fusionner area_hint avec location_hint
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'area_hint') THEN
        UPDATE public.sessions 
        SET location_hint = COALESCE(location_hint, area_hint)
        WHERE area_hint IS NOT NULL;
        
        ALTER TABLE public.sessions DROP COLUMN area_hint CASCADE;
    END IF;
    
    -- Fusionner host_payout_cents avec host_fee_cents  
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_payout_cents') THEN
        UPDATE public.sessions 
        SET host_fee_cents = COALESCE(host_fee_cents, host_payout_cents, 200);
        
        ALTER TABLE public.sessions DROP COLUMN host_payout_cents CASCADE;
    END IF;
END $$;

-- =====================================================
-- 4. VALEURS PAR DÉFAUT ET NORMALISATION
-- =====================================================

-- Normaliser toutes les valeurs NULL avec des défauts appropriés
UPDATE public.sessions 
SET 
    duration_minutes = COALESCE(duration_minutes, 60),
    min_participants = COALESCE(min_participants, 2),
    status = COALESCE(status, 'draft'),
    session_type = COALESCE(session_type, 'mixed'),
    host_fee_cents = COALESCE(host_fee_cents, 200);

-- =====================================================
-- 5. CONTRAINTES DE VALIDATION ROBUSTES
-- =====================================================

-- Ajouter les contraintes essentielles avec gestion des doublons
DO $$
BEGIN
    -- Intensité
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_intensity_check 
        CHECK (intensity IN ('low', 'medium', 'high'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Type de session
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_type_check 
        CHECK (session_type IN ('mixed', 'women_only', 'men_only'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Statut
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_status_check 
        CHECK (status IN ('draft', 'published', 'cancelled', 'completed'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Participants
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_participants_check 
        CHECK (min_participants <= max_participants AND min_participants >= 2 AND max_participants <= 20);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Prix
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_price_check 
        CHECK (price_cents >= 0 AND price_cents <= 5000);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Frais d'hôte
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_fee_check 
        CHECK (host_fee_cents >= 0 AND host_fee_cents <= price_cents);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Distance
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_distance_check 
        CHECK (distance_km > 0 AND distance_km <= 50);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    -- Coordonnées géographiques
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_coords_check 
        CHECK (
          start_lat BETWEEN -90 AND 90 AND 
          start_lng BETWEEN -180 AND 180 AND
          (end_lat IS NULL OR end_lat BETWEEN -90 AND 90) AND
          (end_lng IS NULL OR end_lng BETWEEN -180 AND 180)
        );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- =====================================================
-- 6. INDEX OPTIMISÉS SANS FONCTIONS TEMPORELLES
-- =====================================================

-- Index simples et efficaces
CREATE INDEX IF NOT EXISTS idx_sessions_status_schedule 
ON public.sessions(status, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_location 
ON public.sessions(start_lat, start_lng);

CREATE INDEX IF NOT EXISTS idx_sessions_host_date 
ON public.sessions(host_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrollments_session_status 
ON public.enrollments(session_id, status);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_date 
ON public.enrollments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_stripe 
ON public.profiles(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

-- =====================================================
-- 7. VUE PRINCIPALE CONSOLIDÉE
-- =====================================================

-- Vue optimisée pour l'affichage des sessions
CREATE VIEW public.session_summary AS
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
  -- Données de l'hôte
  h.full_name as host_name,
  h.avatar_url as host_avatar,
  -- Statistiques d'inscription
  COALESCE(enrollments.total, 0) as current_enrollments,
  (s.max_participants - COALESCE(enrollments.total, 0)) as available_spots
FROM public.sessions s
LEFT JOIN public.profiles h ON s.host_id = h.id
LEFT JOIN (
  SELECT 
    session_id, 
    COUNT(*) as total
  FROM public.enrollments 
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
) enrollments ON s.id = enrollments.session_id;

-- =====================================================
-- 8. FONCTIONS UTILITAIRES SIMPLIFIÉES
-- =====================================================

-- Fonction pour vérifier la disponibilité d'une session
CREATE OR REPLACE FUNCTION public.session_is_available(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_data RECORD;
BEGIN
  SELECT 
    s.status,
    s.scheduled_at,
    s.max_participants,
    COALESCE(COUNT(e.id), 0) as current_enrollments
  INTO session_data
  FROM public.sessions s
  LEFT JOIN public.enrollments e ON s.id = e.session_id 
    AND e.status IN ('paid', 'confirmed', 'present')
  WHERE s.id = p_session_id
  GROUP BY s.id, s.status, s.scheduled_at, s.max_participants;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  RETURN (
    session_data.status = 'published' AND
    session_data.scheduled_at > now() AND
    session_data.current_enrollments < session_data.max_participants
  );
END;
$$;

-- Fonction pour obtenir le statut d'affichage d'une session
CREATE OR REPLACE FUNCTION public.get_session_display_status(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_data RECORD;
BEGIN
  SELECT 
    s.status,
    s.scheduled_at,
    s.max_participants,
    COALESCE(COUNT(e.id), 0) as current_enrollments
  INTO session_data
  FROM public.sessions s
  LEFT JOIN public.enrollments e ON s.id = e.session_id 
    AND e.status IN ('paid', 'confirmed', 'present')
  WHERE s.id = p_session_id
  GROUP BY s.id, s.status, s.scheduled_at, s.max_participants;
  
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  
  -- Logique de statut d'affichage
  IF session_data.scheduled_at < now() THEN
    RETURN 'past';
  ELSIF session_data.current_enrollments >= session_data.max_participants THEN
    RETURN 'full';
  ELSIF session_data.status = 'published' THEN
    RETURN 'available';
  ELSE
    RETURN session_data.status;
  END IF;
END;
$$;

-- =====================================================
-- 9. RAPPORT FINAL
-- =====================================================

-- Afficher le résumé final de la consolidation
SELECT 
  'SCHÉMA CONSOLIDÉ AVEC SUCCÈS' as status,
  'Sessions' as entity,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'published') as published,
  COUNT(*) FILTER (WHERE status = 'draft') as drafts
FROM public.sessions

UNION ALL

SELECT 
  '',
  'Inscriptions',
  COUNT(*),
  COUNT(*) FILTER (WHERE status = 'paid'),
  COUNT(*) FILTER (WHERE status = 'pending')
FROM public.enrollments

UNION ALL

SELECT 
  '',
  'Profils',
  COUNT(*),
  COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL),
  COUNT(*) FILTER (WHERE sub_status = 'active')
FROM public.profiles

UNION ALL

SELECT 
  '',
  'Abonnés',
  COUNT(*),
  COUNT(*) FILTER (WHERE subscribed = true),
  0
FROM public.subscribers

ORDER BY entity;