-- === NETTOYAGE ET OPTIMISATION BASE DE DONNÉES (ÉTAPE 1) ===

-- 1. SUPPRIMER LES TRIGGERS DÉPENDANTS AVANT LES FONCTIONS
DROP TRIGGER IF EXISTS protect_deleted_users_trigger ON auth.users;

-- 2. MAINTENANT SUPPRIMER LES FONCTIONS REDONDANTES
DROP FUNCTION IF EXISTS public.handle_new_user_protected() CASCADE;
DROP FUNCTION IF EXISTS public.backfill_missing_profiles();

-- 3. SUPPRIMER LES TRIGGERS DUPLIQUÉS 
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;

-- 4. OPTIMISER LA TABLE PROFILES - Supprimer colonnes redondantes
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS photo_url,
DROP COLUMN IF EXISTS first_name,
DROP COLUMN IF EXISTS last_name;

-- 5. SUPPRIMER LES POLITIQUES RLS DOUBLÉES
DROP POLICY IF EXISTS "subscribers_own_only" ON public.subscribers;

-- 6. SIMPLIFIER LES FONCTIONS DE MONITORING INUTILES
DROP FUNCTION IF EXISTS public.get_basic_stats();
DROP FUNCTION IF EXISTS public.get_system_health();
DROP FUNCTION IF EXISTS public.cleanup_expired_blocklist();