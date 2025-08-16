-- =====================================================
-- MIGRATION FINALE DE CONSOLIDATION - MEETRUN
-- À exécuter pour nettoyer et stabiliser la base
-- =====================================================

-- 1. SUPPRESSION DES ÉLÉMENTS OBSOLÈTES
-- =====================================================

-- Supprimer toutes les vues cassées/obsolètes
DROP VIEW IF EXISTS public.sessions_complete CASCADE;
DROP VIEW IF EXISTS public.session_summary CASCADE;
DROP VIEW IF EXISTS public.sessions_with_host CASCADE;
DROP VIEW IF EXISTS public.session_details CASCADE;
DROP VIEW IF EXISTS public.enrollments_detailed CASCADE;

-- Supprimer les fonctions problématiques
DROP FUNCTION IF EXISTS delete_user_completely CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_sessions CASCADE;
DROP FUNCTION IF EXISTS public.get_platform_stats CASCADE;

-- 2. NETTOYAGE DU SCHÉMA SESSIONS
-- =====================================================

-- Supprimer les colonnes dupliquées/obsolètes si elles existent
DO $$
BEGIN
    -- Supprimer area_hint si elle existe (remplacée par location_hint)
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sessions' AND column_name = 'area_hint') THEN
        ALTER TABLE public.sessions DROP COLUMN area_hint CASCADE;
    END IF;
    
    -- Supprimer host_payout_cents si elle existe (remplacée par host_fee_cents)  
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sessions' AND column_name = 'host_payout_cents') THEN
        ALTER TABLE public.sessions DROP COLUMN host_payout_cents CASCADE;
    END IF;
    
    -- Supprimer type si elle existe (remplacée par session_type)
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sessions' AND column_name = 'type') THEN
        ALTER TABLE public.sessions DROP COLUMN type CASCADE;
    END IF;
END $$;

-- 3. AJOUTER LES COLONNES MANQUANTES
-- =====================================================

-- S'assurer que toutes les colonnes nécessaires existent
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS min_participants integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS session_type text DEFAULT 'mixed',
ADD COLUMN IF NOT EXISTS host_fee_cents integer DEFAULT 200,
ADD COLUMN IF NOT EXISTS end_lat numeric,
ADD COLUMN IF NOT EXISTS end_lng numeric;

-- Mise à jour des valeurs NULL avec des défauts appropriés
UPDATE public.sessions 
SET 
    duration_minutes = COALESCE(duration_minutes, 60),
    min_participants = COALESCE(min_participants, 2),
    session_type = COALESCE(session_type, 'mixed'),
    host_fee_cents = COALESCE(host_fee_cents, 200),
    scheduled_at = COALESCE(scheduled_at, date + time::interval)
WHERE scheduled_at IS NULL AND date IS NOT NULL AND time IS NOT NULL;

-- 4. CONTRAINTES DE VALIDATION ESSENTIELLES
-- =====================================================

-- Supprimer les anciennes contraintes qui peuvent être problématiques
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN 
        SELECT conname FROM pg_constraint 
        WHERE conrelid = 'public.sessions'::regclass 
        AND contype = 'c'
        AND conname LIKE 'chk_%'
    LOOP
        EXECUTE 'ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS ' || constraint_name;
    END LOOP;
END $$;

-- Ajouter les nouvelles contraintes essentielles
ALTER TABLE public.sessions 
ADD CONSTRAINT chk_sessions_intensity 
CHECK (intensity IN ('low', 'medium', 'high')),

ADD CONSTRAINT chk_sessions_type 
CHECK (session_type IN ('mixed', 'women_only', 'men_only')),

ADD CONSTRAINT chk_sessions_status 
CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),

ADD CONSTRAINT chk_sessions_participants 
CHECK (min_participants <= max_participants AND min_participants >= 2 AND max_participants <= 20),

ADD CONSTRAINT chk_sessions_price 
CHECK (price_cents >= 0 AND price_cents <= 10000),

ADD CONSTRAINT chk_sessions_fee 
CHECK (host_fee_cents >= 0 AND host_fee_cents <= price_cents),

ADD CONSTRAINT chk_sessions_distance 
CHECK (distance_km > 0 AND distance_km <= 50);

-- 5. CRÉER LA VUE PRINCIPALE CONSOLIDÉE
-- =====================================================

CREATE OR REPLACE VIEW public.sessions_view AS
SELECT 
  s.*,
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  COALESCE(e.count, 0) as current_enrollments,
  (s.max_participants - COALESCE(e.count, 0)) as available_spots
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_id = p.id
LEFT JOIN (
  SELECT session_id, COUNT(*) as count
  FROM public.enrollments 
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
) e ON s.id = e.session_id;

-- 6. POLITIQUE RLS SIMPLIFIÉE ET SÉCURISÉE
-- =====================================================

-- Nettoyer les anciennes policies
DROP POLICY IF EXISTS "sessions_public_read" ON public.sessions;
DROP POLICY IF EXISTS "profiles_public_hosts" ON public.profiles;
DROP POLICY IF EXISTS "profiles_session_hosts_only" ON public.profiles;

-- Policy pour sessions - lecture publique des sessions publiées uniquement
CREATE POLICY "sessions_read_published" ON public.sessions
  FOR SELECT 
  USING (status = 'published' OR auth.uid() = host_id);

-- Policy pour profiles - seules les infos des hosts de sessions publiées sont visibles
CREATE POLICY "profiles_hosts_only" ON public.profiles
  FOR SELECT 
  USING (
    auth.uid() = id OR 
    id IN (SELECT DISTINCT host_id FROM public.sessions WHERE status = 'published')
  );

-- 7. FONCTION DE NETTOYAGE AUTOMATIQUE
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_pending_enrollments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Supprimer les enrollments pending de plus de 1 heure
  DELETE FROM public.enrollments 
  WHERE status = 'pending' 
  AND created_at < now() - interval '1 hour';
  
  -- Supprimer les sessions draft de plus de 30 jours
  DELETE FROM public.sessions 
  WHERE status = 'draft' 
  AND created_at < now() - interval '30 days';
END;
$$;

-- 8. TRIGGER POUR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer le trigger aux tables principales
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sessions_updated_at ON public.sessions;  
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();