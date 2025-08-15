-- =====================================================
-- MIGRATION FINALE SÉCURISÉE - CONSOLIDATION MEETRUN
-- Suppression des dépendances avant nettoyage
-- =====================================================

-- =====================================================
-- 1. SUPPRIMER LES VUES DÉPENDANTES AVANT NETTOYAGE
-- =====================================================

-- Supprimer toutes les vues qui pourraient dépendre des colonnes à nettoyer
DROP VIEW IF EXISTS public.sessions_with_host CASCADE;
DROP VIEW IF EXISTS public.sessions_with_details CASCADE;
DROP VIEW IF EXISTS public.enrollments_detailed CASCADE;
DROP VIEW IF EXISTS public.enrollments_with_details CASCADE;
DROP VIEW IF EXISTS public.sessions_view CASCADE;

-- =====================================================
-- 2. NETTOYAGE SÉCURISÉ DES COLONNES REDONDANTES
-- =====================================================

-- Temporairement désactiver les triggers pour éviter les conflits
SET session_replication_role = replica;

DO $$
BEGIN
    -- Migrer area_hint vers location_hint puis supprimer area_hint
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'area_hint') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'location_hint') THEN
        
        -- Fusionner les données
        UPDATE public.sessions 
        SET location_hint = COALESCE(location_hint, area_hint);
        
        -- Supprimer la colonne redondante
        ALTER TABLE public.sessions DROP COLUMN area_hint CASCADE;
    END IF;
    
    -- Même chose pour host_payout_cents/host_fee_cents
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_payout_cents') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_fee_cents') THEN
        
        UPDATE public.sessions 
        SET host_fee_cents = COALESCE(host_fee_cents, host_payout_cents, 200);
        
        ALTER TABLE public.sessions DROP COLUMN host_payout_cents CASCADE;
    END IF;
    
    -- Nettoyer type/session_type
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'type') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'session_type') THEN
        
        UPDATE public.sessions 
        SET session_type = COALESCE(session_type, type, 'mixed');
        
        ALTER TABLE public.sessions DROP COLUMN type CASCADE;
    END IF;
END $$;

-- Réactiver les triggers
SET session_replication_role = DEFAULT;

-- =====================================================
-- 3. MISE À JOUR DES VALEURS PAR DÉFAUT
-- =====================================================

UPDATE public.sessions 
SET 
    duration_minutes = COALESCE(duration_minutes, 60),
    min_participants = COALESCE(min_participants, 2),
    status = COALESCE(status, 'draft'),
    session_type = COALESCE(session_type, 'mixed'),
    host_fee_cents = COALESCE(host_fee_cents, 200);

-- =====================================================
-- 4. CONTRAINTES DE VALIDATION ESSENTIELLES
-- =====================================================

DO $$
BEGIN
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_intensity_check 
        CHECK (intensity IN ('low', 'medium', 'high'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_session_type_check 
        CHECK (session_type IN ('mixed', 'women_only', 'men_only'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_status_check 
        CHECK (status IN ('draft', 'published', 'cancelled', 'completed'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_participants_check 
        CHECK (min_participants <= max_participants AND min_participants >= 2 AND max_participants <= 20);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_price_check 
        CHECK (price_cents >= 0 AND price_cents <= 5000);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_fee_check 
        CHECK (host_fee_cents >= 0 AND host_fee_cents <= price_cents);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_distance_check 
        CHECK (distance_km > 0 AND distance_km <= 50);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_duration_check 
        CHECK (duration_minutes >= 30 AND duration_minutes <= 180);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_coordinates_check 
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
-- 5. INDEX OPTIMISÉS POUR LES PERFORMANCES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_sessions_active_future 
ON public.sessions(scheduled_at DESC) 
WHERE status = 'published' AND scheduled_at > now();

CREATE INDEX IF NOT EXISTS idx_sessions_location_published 
ON public.sessions(start_lat, start_lng) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_sessions_host_recent 
ON public.sessions(host_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrollments_session_paid 
ON public.enrollments(session_id, status) 
WHERE status IN ('paid', 'confirmed', 'present');

CREATE INDEX IF NOT EXISTS idx_enrollments_user_recent 
ON public.enrollments(user_id, created_at DESC);

-- =====================================================
-- 6. VUE PRINCIPALE RECONSTITUÉE
-- =====================================================

-- Vue principale propre et optimisée
CREATE VIEW public.sessions_with_enrollment_info AS
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
  p.email as host_email,
  -- Statistiques d'inscription
  COALESCE(ec.enrollment_count, 0) as current_enrollments,
  (s.max_participants - COALESCE(ec.enrollment_count, 0)) as available_spots,
  -- Statut calculé
  CASE 
    WHEN s.scheduled_at < now() THEN 'past'
    WHEN COALESCE(ec.enrollment_count, 0) >= s.max_participants THEN 'full'
    WHEN s.status = 'published' AND s.scheduled_at > now() THEN 'available'
    ELSE s.status
  END as computed_status
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_id = p.id
LEFT JOIN (
  SELECT 
    session_id, 
    COUNT(*) as enrollment_count
  FROM public.enrollments 
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
) ec ON s.id = ec.session_id;

-- =====================================================
-- 7. FONCTION UTILITAIRE DE VALIDATION
-- =====================================================

-- Fonction pour vérifier l'éligibilité d'inscription
CREATE OR REPLACE FUNCTION public.check_enrollment_eligibility(p_session_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_info RECORD;
  existing_enrollment RECORD;
  result json;
BEGIN
  -- Récupérer les informations de la session
  SELECT 
    s.*,
    COALESCE(COUNT(e.id), 0) as current_enrollments
  INTO session_info
  FROM public.sessions s
  LEFT JOIN public.enrollments e ON s.id = e.session_id 
    AND e.status IN ('paid', 'confirmed', 'present')
  WHERE s.id = p_session_id
  GROUP BY s.id;
  
  -- Session n'existe pas
  IF NOT FOUND THEN
    SELECT json_build_object(
      'eligible', false,
      'reason', 'session_not_found'
    ) INTO result;
    RETURN result;
  END IF;
  
  -- Vérifier si déjà inscrit
  SELECT * INTO existing_enrollment
  FROM public.enrollments
  WHERE session_id = p_session_id 
    AND user_id = p_user_id 
    AND status IN ('pending', 'paid', 'confirmed', 'present');
  
  IF FOUND THEN
    SELECT json_build_object(
      'eligible', false,
      'reason', 'already_enrolled',
      'enrollment_status', existing_enrollment.status
    ) INTO result;
    RETURN result;
  END IF;
  
  -- Vérifications d'éligibilité
  IF session_info.host_id = p_user_id THEN
    SELECT json_build_object(
      'eligible', false,
      'reason', 'own_session'
    ) INTO result;
  ELSIF session_info.status != 'published' THEN
    SELECT json_build_object(
      'eligible', false,
      'reason', 'session_not_published',
      'current_status', session_info.status
    ) INTO result;
  ELSIF session_info.scheduled_at <= now() THEN
    SELECT json_build_object(
      'eligible', false,
      'reason', 'session_past'
    ) INTO result;
  ELSIF session_info.current_enrollments >= session_info.max_participants THEN
    SELECT json_build_object(
      'eligible', false,
      'reason', 'session_full',
      'current_enrollments', session_info.current_enrollments,
      'max_participants', session_info.max_participants
    ) INTO result;
  ELSE
    SELECT json_build_object(
      'eligible', true,
      'session_info', json_build_object(
        'title', session_info.title,
        'scheduled_at', session_info.scheduled_at,
        'price_cents', session_info.price_cents,
        'available_spots', session_info.max_participants - session_info.current_enrollments
      )
    ) INTO result;
  END IF;
  
  RETURN result;
END;
$$;

-- =====================================================
-- 8. RAPPORT FINAL DE LA MIGRATION
-- =====================================================

-- Statistiques finales après consolidation
SELECT 
  'MIGRATION CONSOLIDÉE RÉUSSIE' as status,
  'SESSIONS' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE status = 'published') as published,
  COUNT(*) FILTER (WHERE scheduled_at > now()) as future_sessions,
  COUNT(*) FILTER (WHERE status = 'draft') as drafts
FROM public.sessions

UNION ALL

SELECT 
  '',
  'ENROLLMENTS',
  COUNT(*),
  COUNT(*) FILTER (WHERE status = 'paid'),
  COUNT(*) FILTER (WHERE status = 'confirmed'),
  COUNT(*) FILTER (WHERE status = 'pending')
FROM public.enrollments

UNION ALL

SELECT 
  '',
  'PROFILES',
  COUNT(*),
  COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL),
  COUNT(*) FILTER (WHERE role = 'host'),
  COUNT(*) FILTER (WHERE sub_status = 'active')
FROM public.profiles

ORDER BY table_name;