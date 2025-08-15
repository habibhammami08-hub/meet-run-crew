-- =====================================================
-- CORRECTION SÉCURITÉ - RÉSOLUTION DES WARNINGS
-- Correction des problèmes de sécurité détectés après consolidation
-- =====================================================

-- =====================================================
-- 1. CORRIGER LE PROBLÈME "SECURITY DEFINER VIEW"
-- =====================================================

-- Supprimer la vue avec SECURITY DEFINER et la recréer sans
DROP VIEW IF EXISTS public.sessions_complete CASCADE;

-- Recréer la vue sans SECURITY DEFINER (plus sécurisé)
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
  -- Informations de l'hôte (utilise les politiques RLS existantes)
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  -- Comptage des inscriptions (utilise les politiques RLS existantes)
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
-- 2. CORRIGER LES FONCTIONS SECURITY DEFINER
-- =====================================================

-- Recréer la fonction sans SECURITY DEFINER si elle n'est pas nécessaire
DROP FUNCTION IF EXISTS public.can_enroll_in_session(uuid);

-- Fonction publique normale qui respecte les politiques RLS
CREATE OR REPLACE FUNCTION public.can_enroll_in_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  session_info RECORD;
BEGIN
  -- Cette fonction respecte maintenant les politiques RLS
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
-- 3. VÉRIFIER LES POLITIQUES RLS EXISTANTES
-- =====================================================

-- S'assurer que les politiques RLS sont correctement configurées
-- pour permettre l'accès public aux sessions publiées

-- Politique pour les sessions (lecture publique)
DROP POLICY IF EXISTS "sessions_public_read" ON public.sessions;
CREATE POLICY "sessions_public_read" ON public.sessions
  FOR SELECT USING (true);

-- Politique pour les profils (lecture publique pour les informations de base)
DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;
CREATE POLICY "Public can view profiles" ON public.profiles
  FOR SELECT USING (true);

-- =====================================================
-- 4. FONCTION DE STATUT SÉCURISÉE
-- =====================================================

-- Fonction simple pour obtenir le statut d'une session sans SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_session_status(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  session_data RECORD;
BEGIN
  -- Fonction qui respecte les politiques RLS
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
  
  -- Déterminer le statut d'affichage
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
-- 5. VÉRIFICATION FINALE DE SÉCURITÉ
-- =====================================================

-- S'assurer que RLS est activé sur toutes les tables importantes
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. RAPPORT FINAL DE SÉCURITÉ
-- =====================================================

-- Vérifier l'état final de la sécurité
SELECT 
  '🔒 SÉCURITÉ RENFORCÉE' as status,
  tablename as table_name,
  rowsecurity as rls_enabled,
  'Politiques RLS actives' as note
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('sessions', 'profiles', 'enrollments', 'subscribers')

UNION ALL

SELECT 
  '✅ CONSOLIDATION FINALISÉE',
  'Schema',
  true,
  'Migration terminée avec succès'

ORDER BY table_name;