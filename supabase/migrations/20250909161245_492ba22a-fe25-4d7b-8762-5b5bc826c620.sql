-- Supprimer TOUTES les politiques RLS pour permettre un accès complet
DO $$
DECLARE
    rec RECORD;
BEGIN
    -- Supprimer toutes les politiques sur la table profiles
    FOR rec IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'profiles' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || rec.policyname || '" ON public.profiles';
    END LOOP;

    -- Supprimer toutes les politiques sur la table sessions
    FOR rec IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'sessions' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || rec.policyname || '" ON public.sessions';
    END LOOP;

    -- Supprimer toutes les politiques sur la table enrollments
    FOR rec IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'enrollments' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || rec.policyname || '" ON public.enrollments';
    END LOOP;
END $$;

-- Créer des politiques complètement ouvertes
CREATE POLICY "open_access_profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_access_sessions" ON public.sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_access_enrollments" ON public.enrollments FOR ALL USING (true) WITH CHECK (true);

-- Configurer le realtime
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
ALTER TABLE public.enrollments REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;