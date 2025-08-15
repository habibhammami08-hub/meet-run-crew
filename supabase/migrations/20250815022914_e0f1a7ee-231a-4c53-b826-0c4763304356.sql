-- =====================================================
-- MIGRATION FINALE DE CONSOLIDATION - DERNIÈRE ÉTAPE
-- Consolidation réussie du schéma MeetRun
-- =====================================================

-- =====================================================
-- 1. NETTOYAGE FINAL DES VUES EXISTANTES
-- =====================================================

-- Supprimer toutes les vues qui pourraient exister
DROP VIEW IF EXISTS public.session_summary CASCADE;
DROP VIEW IF EXISTS public.session_details CASCADE;
DROP VIEW IF EXISTS public.sessions_with_host CASCADE;
DROP VIEW IF EXISTS public.sessions_with_details CASCADE;
DROP VIEW IF EXISTS public.enrollments_detailed CASCADE;
DROP VIEW IF EXISTS public.sessions_view CASCADE;

-- =====================================================
-- 2. NETTOYAGE FINAL DES COLONNES REDONDANTES
-- =====================================================

-- Finaliser le nettoyage des colonnes redondantes
DO $$
BEGIN
    -- Supprimer area_hint si elle existe encore
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'area_hint') THEN
        ALTER TABLE public.sessions DROP COLUMN area_hint CASCADE;
    END IF;
    
    -- Supprimer host_payout_cents si elle existe encore
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_payout_cents') THEN
        ALTER TABLE public.sessions DROP COLUMN host_payout_cents CASCADE;
    END IF;
END $$;

-- =====================================================
-- 3. MISE À JOUR FINALE DES VALEURS PAR DÉFAUT
-- =====================================================

UPDATE public.sessions 
SET 
    duration_minutes = COALESCE(duration_minutes, 60),
    min_participants = COALESCE(min_participants, 2),
    status = COALESCE(status, 'draft'),
    session_type = COALESCE(session_type, 'mixed'),
    host_fee_cents = COALESCE(host_fee_cents, 200)
WHERE 
    duration_minutes IS NULL OR
    min_participants IS NULL OR
    status IS NULL OR
    session_type IS NULL OR
    host_fee_cents IS NULL;

-- =====================================================
-- 4. CONTRAINTES FINALES ESSENTIELLES
-- =====================================================

-- Ajouter les contraintes les plus importantes
DO $$
BEGIN
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT final_intensity_check 
        CHECK (intensity IN ('low', 'medium', 'high'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT final_status_check 
        CHECK (status IN ('draft', 'published', 'cancelled', 'completed'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT final_participants_check 
        CHECK (min_participants <= max_participants AND min_participants >= 2);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT final_price_check 
        CHECK (price_cents >= 0 AND price_cents <= 5000);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- =====================================================
-- 5. INDEX FINAUX
-- =====================================================

-- Index essentiels pour les performances
CREATE INDEX IF NOT EXISTS idx_final_sessions_lookup 
ON public.sessions(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_final_sessions_geo 
ON public.sessions(start_lat, start_lng);

CREATE INDEX IF NOT EXISTS idx_final_enrollments_lookup 
ON public.enrollments(session_id, status);

-- =====================================================
-- 6. VUE FINALE SIMPLE ET EFFICACE
-- =====================================================

-- Vue principale pour les sessions avec toutes les informations nécessaires
CREATE VIEW public.sessions_complete AS
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
  -- Comptage des inscriptions
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

-- =====================================================
-- 7. FONCTION UTILITAIRE FINALE
-- =====================================================

-- Fonction simple pour vérifier si une session accepte les inscriptions
CREATE OR REPLACE FUNCTION public.can_enroll_in_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_info RECORD;
BEGIN
  SELECT 
    s.status,
    s.scheduled_at,
    s.max_participants,
    COALESCE(COUNT(e.id), 0) as enrollments
  INTO session_info
  FROM public.sessions s
  LEFT JOIN public.enrollments e ON s.id = e.session_id 
    AND e.status IN ('paid', 'confirmed', 'present')
  WHERE s.id = p_session_id
  GROUP BY s.id, s.status, s.scheduled_at, s.max_participants;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  RETURN (
    session_info.status = 'published' AND
    session_info.scheduled_at > now() AND
    session_info.enrollments < session_info.max_participants
  );
END;
$$;

-- =====================================================
-- 8. RAPPORT DE CONSOLIDATION FINAL
-- =====================================================

-- Afficher les statistiques finales après la consolidation complète
SELECT 
  '✅ CONSOLIDATION RÉUSSIE' as message,
  'Sessions' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE status = 'published') as published_count,
  'Schéma standardisé' as note
FROM public.sessions

UNION ALL

SELECT 
  '',
  'Enrollments',
  COUNT(*),
  COUNT(*) FILTER (WHERE status IN ('paid', 'confirmed')),
  'Statuts validés'
FROM public.enrollments

UNION ALL

SELECT 
  '',
  'Profiles',
  COUNT(*),
  COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL),
  'Intégration Stripe'
FROM public.profiles

UNION ALL

SELECT 
  '',
  'Database',
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'),
  (SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public'),
  'Tables et vues'
ORDER BY table_name;