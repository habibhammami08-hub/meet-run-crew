-- =====================================================
-- MIGRATION FINALE SIMPLIFIÉE - CONSOLIDATION MEETRUN
-- Version sans conflit avec les triggers existants
-- =====================================================

-- Temporairement désactiver les triggers pour éviter les conflits
SET session_replication_role = replica;

-- =====================================================
-- 1. NETTOYAGE TABLE SESSIONS
-- =====================================================

-- Nettoyer les colonnes redondantes sans déclencher les triggers
DO $$
BEGIN
    -- Supprimer area_hint si location_hint existe déjà
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'area_hint') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'location_hint') THEN
        
        -- Copier les données sans déclencher les triggers
        UPDATE public.sessions 
        SET location_hint = area_hint 
        WHERE location_hint IS NULL AND area_hint IS NOT NULL;
        
        -- Supprimer area_hint
        ALTER TABLE public.sessions DROP COLUMN IF EXISTS area_hint;
    END IF;
    
    -- Supprimer host_payout_cents si host_fee_cents existe déjà
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_payout_cents') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'host_fee_cents') THEN
        
        UPDATE public.sessions 
        SET host_fee_cents = COALESCE(host_fee_cents, host_payout_cents, 200);
        
        ALTER TABLE public.sessions DROP COLUMN IF EXISTS host_payout_cents;
    END IF;
    
    -- Nettoyer type/session_type
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'type') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'session_type') THEN
        
        UPDATE public.sessions 
        SET session_type = COALESCE(session_type, type, 'mixed');
        
        ALTER TABLE public.sessions DROP COLUMN IF EXISTS type;
    END IF;
END $$;

-- Réactiver les triggers normaux
SET session_replication_role = DEFAULT;

-- =====================================================
-- 2. FINALISER LES VALEURS PAR DÉFAUT
-- =====================================================

-- Mettre à jour les valeurs NULL avec des valeurs par défaut appropriées
UPDATE public.sessions 
SET 
    duration_minutes = COALESCE(duration_minutes, 60),
    min_participants = COALESCE(min_participants, 2),
    status = COALESCE(status, 'draft'),
    session_type = COALESCE(session_type, 'mixed'),
    host_fee_cents = COALESCE(host_fee_cents, 200);

-- =====================================================
-- 3. AJOUTER LES CONTRAINTES ESSENTIELLES
-- =====================================================

-- Contraintes de validation pour maintenir l'intégrité des données
DO $$
BEGIN
    -- Contraintes pour sessions
    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_intensity_valid 
        CHECK (intensity IN ('low', 'medium', 'high'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_session_type_valid 
        CHECK (session_type IN ('mixed', 'women_only', 'men_only'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_status_valid 
        CHECK (status IN ('draft', 'published', 'cancelled', 'completed'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_participants_valid 
        CHECK (min_participants <= max_participants AND min_participants >= 2 AND max_participants <= 20);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_price_valid 
        CHECK (price_cents >= 0 AND price_cents <= 5000);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_fee_valid 
        CHECK (host_fee_cents >= 0 AND host_fee_cents <= price_cents);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_distance_valid 
        CHECK (distance_km > 0 AND distance_km <= 50);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_duration_valid 
        CHECK (duration_minutes >= 30 AND duration_minutes <= 180);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_location_valid 
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
-- 4. AMÉLIORER LES POLITIQUES RLS
-- =====================================================

-- Assurer que les politiques RLS sont optimales
DROP POLICY IF EXISTS "sessions_public_read" ON public.sessions;
CREATE POLICY "sessions_public_read" ON public.sessions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "sessions_host_write" ON public.sessions;
CREATE POLICY "sessions_host_write" ON public.sessions
  FOR ALL USING (auth.uid() = host_id);

-- =====================================================
-- 5. INDEX OPTIMISÉS
-- =====================================================

-- Index pour les requêtes les plus courantes
CREATE INDEX IF NOT EXISTS idx_sessions_active_by_date 
ON public.sessions(scheduled_at DESC) 
WHERE status = 'published' AND scheduled_at > now();

CREATE INDEX IF NOT EXISTS idx_sessions_by_location 
ON public.sessions(start_lat, start_lng) 
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_sessions_by_host 
ON public.sessions(host_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrollments_by_session_status 
ON public.enrollments(session_id, status);

CREATE INDEX IF NOT EXISTS idx_enrollments_by_user 
ON public.enrollments(user_id, created_at DESC);

-- =====================================================
-- 6. VUE SIMPLE ET EFFICACE
-- =====================================================

-- Vue principale pour l'affichage des sessions
CREATE OR REPLACE VIEW public.sessions_view AS
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
  -- Calculs en temps réel
  COALESCE(e.enrollment_count, 0) as current_enrollments,
  (s.max_participants - COALESCE(e.enrollment_count, 0)) as available_spots,
  -- Statut calculé
  CASE 
    WHEN s.scheduled_at < now() THEN 'past'
    WHEN COALESCE(e.enrollment_count, 0) >= s.max_participants THEN 'full'
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
) e ON s.id = e.session_id;

-- =====================================================
-- 7. FONCTION UTILITAIRE SIMPLE
-- =====================================================

-- Fonction pour vérifier si un utilisateur peut s'inscrire à une session
CREATE OR REPLACE FUNCTION public.can_user_enroll(session_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_info RECORD;
  user_enrollment RECORD;
BEGIN
  -- Vérifier les informations de la session
  SELECT 
    s.*,
    COALESCE(COUNT(e.id), 0) as current_enrollments
  INTO session_info
  FROM public.sessions s
  LEFT JOIN public.enrollments e ON s.id = e.session_id 
    AND e.status IN ('paid', 'confirmed', 'present')
  WHERE s.id = session_id
  GROUP BY s.id;
  
  -- Session n'existe pas
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Vérifier si l'utilisateur est déjà inscrit
  SELECT * INTO user_enrollment
  FROM public.enrollments
  WHERE session_id = session_id 
    AND user_id = user_id 
    AND status IN ('pending', 'paid', 'confirmed', 'present');
  
  -- Déjà inscrit
  IF FOUND THEN
    RETURN false;
  END IF;
  
  -- Vérifications de base
  RETURN (
    session_info.status = 'published' AND
    session_info.scheduled_at > now() AND
    session_info.current_enrollments < session_info.max_participants AND
    session_info.host_id != user_id  -- Pas son propre session
  );
END;
$$;

-- =====================================================
-- 8. NETTOYAGE FINAL
-- =====================================================

-- Supprimer les vues obsolètes si elles existent
DROP VIEW IF EXISTS public.sessions_with_host CASCADE;
DROP VIEW IF EXISTS public.sessions_with_details CASCADE;
DROP VIEW IF EXISTS public.enrollments_detailed CASCADE;
DROP VIEW IF EXISTS public.enrollments_with_details CASCADE;

-- =====================================================
-- 9. STATISTIQUES FINALES
-- =====================================================

-- Afficher le résumé final
SELECT 
  'CONSOLIDATION COMPLETED' as message,
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE status = 'published') as published_sessions,
  COUNT(*) FILTER (WHERE scheduled_at > now()) as future_sessions
FROM public.sessions

UNION ALL

SELECT 
  'ENROLLMENTS STATUS',
  COUNT(*),
  COUNT(*) FILTER (WHERE status = 'paid'),
  COUNT(*) FILTER (WHERE status = 'confirmed')
FROM public.enrollments

UNION ALL

SELECT 
  'PROFILES STATUS',
  COUNT(*),
  COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL),
  COUNT(*) FILTER (WHERE role = 'host')
FROM public.profiles;