-- =====================================================
-- MIGRATION CORRECTIVE - RÉSOLUTION DU TRIGGER
-- Suppression du trigger problématique et consolidation finale
-- =====================================================

-- =====================================================
-- 1. SUPPRIMER LES TRIGGERS PROBLÉMATIQUES
-- =====================================================

-- Supprimer tous les triggers update_updated_at de la table sessions
DROP TRIGGER IF EXISTS trigger_sessions_updated_at ON public.sessions;
DROP TRIGGER IF EXISTS update_sessions_updated_at ON public.sessions;
DROP TRIGGER IF EXISTS sessions_updated_at ON public.sessions;

-- Supprimer la fonction update_updated_at défectueuse
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;

-- =====================================================
-- 2. SUPPRIMER LES VUES DÉPENDANTES
-- =====================================================

DROP VIEW IF EXISTS public.sessions_with_host CASCADE;
DROP VIEW IF EXISTS public.sessions_with_details CASCADE;
DROP VIEW IF EXISTS public.enrollments_detailed CASCADE;
DROP VIEW IF EXISTS public.enrollments_with_details CASCADE;
DROP VIEW IF EXISTS public.sessions_view CASCADE;

-- =====================================================
-- 3. NETTOYER LES COLONNES REDONDANTES
-- =====================================================

DO $$
BEGIN
    -- Nettoyer area_hint/location_hint
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'area_hint') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'location_hint') THEN
        
        UPDATE public.sessions 
        SET location_hint = COALESCE(location_hint, area_hint);
        
        ALTER TABLE public.sessions DROP COLUMN area_hint CASCADE;
    END IF;
    
    -- Nettoyer host_payout_cents/host_fee_cents
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_payout_cents') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_fee_cents') THEN
        
        UPDATE public.sessions 
        SET host_fee_cents = COALESCE(host_fee_cents, host_payout_cents, 200);
        
        ALTER TABLE public.sessions DROP COLUMN host_payout_cents CASCADE;
    END IF;
END $$;

-- =====================================================
-- 4. DÉFINIR LES VALEURS PAR DÉFAUT
-- =====================================================

UPDATE public.sessions 
SET 
    duration_minutes = COALESCE(duration_minutes, 60),
    min_participants = COALESCE(min_participants, 2),
    status = COALESCE(status, 'draft'),
    session_type = COALESCE(session_type, 'mixed'),
    host_fee_cents = COALESCE(host_fee_cents, 200);

-- =====================================================
-- 5. CONTRAINTES DE VALIDATION
-- =====================================================

DO $$
BEGIN
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT chk_sessions_intensity 
        CHECK (intensity IN ('low', 'medium', 'high'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT chk_sessions_type 
        CHECK (session_type IN ('mixed', 'women_only', 'men_only'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT chk_sessions_status 
        CHECK (status IN ('draft', 'published', 'cancelled', 'completed'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT chk_sessions_participants 
        CHECK (min_participants <= max_participants AND min_participants >= 2 AND max_participants <= 20);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT chk_sessions_price 
        CHECK (price_cents >= 0 AND price_cents <= 5000);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT chk_sessions_fee 
        CHECK (host_fee_cents >= 0 AND host_fee_cents <= price_cents);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT chk_sessions_distance 
        CHECK (distance_km > 0 AND distance_km <= 50);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT chk_sessions_coordinates 
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
-- 6. INDEX OPTIMISÉS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_sessions_published_future 
ON public.sessions(scheduled_at DESC) 
WHERE status = 'published' AND scheduled_at > now();

CREATE INDEX IF NOT EXISTS idx_sessions_geo_published 
ON public.sessions(start_lat, start_lng) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_sessions_host_schedule 
ON public.sessions(host_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrollments_session_valid 
ON public.enrollments(session_id, status) 
WHERE status IN ('paid', 'confirmed', 'present');

-- =====================================================
-- 7. VUE FINALE PROPRE
-- =====================================================

CREATE VIEW public.session_details AS
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
  -- Informations hôte
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  -- Comptage des inscriptions
  COALESCE(e.count, 0) as current_enrollments,
  (s.max_participants - COALESCE(e.count, 0)) as spots_available,
  -- Statut calculé
  CASE 
    WHEN s.scheduled_at < now() THEN 'past'
    WHEN COALESCE(e.count, 0) >= s.max_participants THEN 'full'
    WHEN s.status = 'published' AND s.scheduled_at > now() THEN 'open'
    ELSE s.status
  END as display_status
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_id = p.id
LEFT JOIN (
  SELECT 
    session_id, 
    COUNT(*) as count
  FROM public.enrollments 
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
) e ON s.id = e.session_id;

-- =====================================================
-- 8. FONCTION DE VALIDATION SIMPLE
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_session_available(session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_rec RECORD;
BEGIN
  SELECT 
    s.status,
    s.scheduled_at,
    s.max_participants,
    COALESCE(COUNT(e.id), 0) as enrollments
  INTO session_rec
  FROM public.sessions s
  LEFT JOIN public.enrollments e ON s.id = e.session_id 
    AND e.status IN ('paid', 'confirmed', 'present')
  WHERE s.id = session_id
  GROUP BY s.id, s.status, s.scheduled_at, s.max_participants;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  RETURN (
    session_rec.status = 'published' AND
    session_rec.scheduled_at > now() AND
    session_rec.enrollments < session_rec.max_participants
  );
END;
$$;

-- =====================================================
-- 9. STATISTIQUES FINALES
-- =====================================================

-- Résumé de la consolidation
SELECT 
  'CONSOLIDATION TERMINÉE' as message,
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE status = 'published') as published,
  COUNT(*) FILTER (WHERE scheduled_at > now()) as future_sessions
FROM public.sessions

UNION ALL

SELECT 
  'INSCRIPTIONS',
  COUNT(*),
  COUNT(*) FILTER (WHERE status = 'paid'),
  COUNT(*) FILTER (WHERE status IN ('paid', 'confirmed'))
FROM public.enrollments

UNION ALL

SELECT 
  'UTILISATEURS',
  COUNT(*),
  COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL),
  COUNT(*) FILTER (WHERE role IN ('host', 'admin'))
FROM public.profiles

ORDER BY message;