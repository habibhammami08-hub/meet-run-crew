-- =====================================================
-- MIGRATIONS SQL CRITIQUES POUR PRODUCTION - MEETRUN
-- =====================================================

-- 1. SÉCURISATION DES FONCTIONS (search_path requis)
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    now(),
    now()
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Profile already exists, ignore
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't block user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

-- Trigger pour création automatique du profil
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. CORRECTION DES POLICIES RLS
-- =====================================================

-- Profiles : lecture publique pour affichage sur carte
DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;
CREATE POLICY "Public can view profiles" ON public.profiles
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile" ON public.profiles
FOR DELETE USING (auth.uid() = id);

-- Sessions : lecture publique + création/modification par hôte
DROP POLICY IF EXISTS "Public can view sessions" ON public.sessions;
CREATE POLICY "Public can view sessions" ON public.sessions
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can create sessions" ON public.sessions;
CREATE POLICY "Authenticated can create sessions" ON public.sessions
FOR INSERT WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Users can update own sessions" ON public.sessions;
CREATE POLICY "Users can update own sessions" ON public.sessions
FOR UPDATE USING (auth.uid() = host_id);

DROP POLICY IF EXISTS "Users can delete own sessions" ON public.sessions;
CREATE POLICY "Users can delete own sessions" ON public.sessions
FOR DELETE USING (auth.uid() = host_id);

-- Enrollments : lecture pour utilisateur + hôte
DROP POLICY IF EXISTS "Users can view own enrollments" ON public.enrollments;
CREATE POLICY "Users can view own enrollments" ON public.enrollments
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Hosts can view session enrollments" ON public.enrollments;
CREATE POLICY "Hosts can view session enrollments" ON public.enrollments
FOR SELECT USING (auth.uid() IN (SELECT host_id FROM sessions WHERE id = enrollments.session_id));

DROP POLICY IF EXISTS "Users can create enrollments" ON public.enrollments;
CREATE POLICY "Users can create enrollments" ON public.enrollments
FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own enrollments" ON public.enrollments;
CREATE POLICY "Users can update own enrollments" ON public.enrollments
FOR UPDATE USING (auth.uid() = user_id);

-- 3. STORAGE BUCKET AVATARS
-- =====================================================

-- Créer le bucket s'il n'existe pas
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Policies Storage pour avatars
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'avatars');