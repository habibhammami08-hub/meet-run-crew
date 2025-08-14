-- Finalisation de la migration critique MeetRun (sans CONCURRENTLY)

-- 5. INDEX POUR PERFORMANCES (version non-concurrent)
-- =====================================================

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_sessions_date_location 
ON public.sessions(date, location_lat, location_lng);

CREATE INDEX IF NOT EXISTS idx_sessions_host_date 
ON public.sessions(host_id, date);

CREATE INDEX IF NOT EXISTS idx_enrollments_session_user 
ON public.enrollments(session_id, user_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_status 
ON public.enrollments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer 
ON public.profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- 7. FONCTION DE SUPPRESSION COMPLÈTE UTILISATEUR
-- =====================================================

CREATE OR REPLACE FUNCTION public.delete_user_completely()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  current_user_id uuid;
BEGIN
  -- Récupérer l'ID utilisateur actuel
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Supprimer le profil (cascade supprimera les sessions et enrollments)
  DELETE FROM public.profiles WHERE id = current_user_id;
  
  -- Supprimer de auth.users (suppression complète du compte)
  DELETE FROM auth.users WHERE id = current_user_id;
  
  RAISE NOTICE 'Compte utilisateur % supprimé complètement', current_user_id;
END;
$function$;

-- 8. BACKFILL DES PROFILS MANQUANTS
-- =====================================================

-- Créer des profils pour les utilisateurs auth existants qui n'en ont pas
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', '') as full_name,
  COALESCE(u.created_at, now()) as created_at,
  now() as updated_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 9. NETTOYAGE DES DONNÉES ORPHELINES
-- =====================================================

-- Supprimer les enrollments orphelins
DELETE FROM public.enrollments 
WHERE user_id NOT IN (SELECT id FROM public.profiles);

DELETE FROM public.enrollments 
WHERE session_id NOT IN (SELECT id FROM public.sessions);

-- Supprimer les sessions avec hôte inexistant
DELETE FROM public.sessions 
WHERE host_id NOT IN (SELECT id FROM public.profiles);

-- 10. FONCTION UTILITAIRE POUR ABONNEMENT
-- =====================================================

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_profile profiles)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  RETURN user_profile.sub_status IN ('active', 'trialing') AND 
         (user_profile.sub_current_period_end IS NULL OR user_profile.sub_current_period_end > now());
END;
$function$;

-- 11. TRIGGER POUR MISE À JOUR AUTOMATIQUE updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END;
$function$;

-- Appliquer le trigger aux tables nécessaires
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();