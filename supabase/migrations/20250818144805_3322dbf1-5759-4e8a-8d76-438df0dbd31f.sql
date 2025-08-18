-- Supprimer les politiques RLS trop restrictives et les remplacer par des plus permissives

-- Supprimer toutes les politiques existantes sur profiles
DROP POLICY IF EXISTS "Public profiles visible" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Créer des politiques plus permissives pour profiles
CREATE POLICY "Allow all access to profiles" ON public.profiles
FOR ALL 
USING (true)
WITH CHECK (true);

-- Supprimer les politiques restrictives sur sessions
DROP POLICY IF EXISTS "Published sessions visible" ON public.sessions;
DROP POLICY IF EXISTS "Hosts can manage own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Authenticated users can create sessions" ON public.sessions;

-- Créer des politiques plus permissives pour sessions
CREATE POLICY "Allow read access to all sessions" ON public.sessions
FOR SELECT 
USING (true);

CREATE POLICY "Allow authenticated users to create sessions" ON public.sessions
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow users to update their own sessions" ON public.sessions
FOR UPDATE 
USING (auth.uid() = host_id);

CREATE POLICY "Allow users to delete their own sessions" ON public.sessions
FOR DELETE 
USING (auth.uid() = host_id);

-- Supprimer les politiques complexes sur enrollments
DROP POLICY IF EXISTS "Users see own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Hosts see session enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Users can enroll" ON public.enrollments;
DROP POLICY IF EXISTS "Users can cancel enrollment" ON public.enrollments;

-- Créer des politiques plus simples pour enrollments
CREATE POLICY "Allow read access to enrollments" ON public.enrollments
FOR SELECT 
USING (true);

CREATE POLICY "Allow authenticated users to create enrollments" ON public.enrollments
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow users to update enrollments" ON public.enrollments
FOR UPDATE 
USING (true);

-- Activer le realtime pour toutes les tables importantes
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
ALTER TABLE public.enrollments REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- S'assurer que les tables sont dans la publication realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.enrollments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;