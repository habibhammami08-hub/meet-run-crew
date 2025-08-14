-- 1) PROFILES : RLS propre (lecture/insert/update/suppression pour soi)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- permettre à l'utilisateur de marquer son profil supprimé
DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;
CREATE POLICY "profiles_delete_own"
ON public.profiles FOR DELETE TO authenticated
USING (id = auth.uid());

-- trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) SESSIONS : lecture publique + insert par l'hôte
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view all sessions" ON public.sessions;
CREATE POLICY "Public can view all sessions"
ON public.sessions FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "insert own sessions" ON public.sessions;
CREATE POLICY "insert own sessions"
ON public.sessions FOR INSERT TO authenticated
WITH CHECK (host_id = auth.uid());

-- FK vers profiles (avec CASCADE)
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_host_id_fkey;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_host_id_fkey
  FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Realtime déjà configuré, on vérifie juste
ALTER TABLE public.sessions REPLICA IDENTITY FULL;

-- Backfill si certains users existent dans auth.users sans profil
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name','')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;