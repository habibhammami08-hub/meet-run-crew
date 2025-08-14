-- Compléter la configuration de sécurité MeetRun
-- Correction des fonctions et ajout des éléments manquants

-- ============================================================================
-- FONCTIONS DE SÉCURITÉ POUR RLS (avec search_path correct)
-- ============================================================================

-- Fonction pour backfill des profils manquants
CREATE OR REPLACE FUNCTION public.backfill_missing_profiles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
    SELECT 
        au.id,
        au.email,
        COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''),
        au.created_at,
        NOW()
    FROM auth.users au
    WHERE au.id NOT IN (SELECT id FROM public.profiles)
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Backfill des profils terminé';
END;
$$;

-- Exécuter le backfill
SELECT public.backfill_missing_profiles();

-- ============================================================================
-- FONCTION TRIGGER POUR NOUVEAUX UTILISATEURS (avec search_path)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$;

-- Créer le trigger sur auth.users (si pas déjà existant)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- CONTRAINTES FOREIGN KEY avec CASCADE
-- ============================================================================

-- Vérifier et ajouter les contraintes FK si elles n'existent pas
DO $$
BEGIN
    -- FK sessions -> profiles
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'sessions_host_id_fkey' AND table_name = 'sessions'
    ) THEN
        ALTER TABLE public.sessions 
        ADD CONSTRAINT sessions_host_id_fkey 
        FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
    
    -- FK enrollments -> profiles
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'enrollments_user_id_fkey' AND table_name = 'enrollments'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
    
    -- FK enrollments -> sessions
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'enrollments_session_id_fkey' AND table_name = 'enrollments'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_session_id_fkey 
        FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- VERIFICATION DES POLITIQUES
-- ============================================================================

-- Afficher toutes les politiques actives pour vérification
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;