-- 1. Remplacer la création de profil à la connexion par un trigger à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- S'assurer que le trigger existe et n'est pas dupliqué
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Ajouter des clés étrangères avec CASCADE pour simplifier les suppressions
-- Enrollments
ALTER TABLE public.enrollments 
DROP CONSTRAINT IF EXISTS enrollments_user_id_fkey;

ALTER TABLE public.enrollments 
ADD CONSTRAINT enrollments_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Registrations  
ALTER TABLE public.registrations 
DROP CONSTRAINT IF EXISTS registrations_user_id_fkey;

ALTER TABLE public.registrations 
ADD CONSTRAINT registrations_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Sessions
ALTER TABLE public.sessions 
DROP CONSTRAINT IF EXISTS sessions_host_id_fkey;

ALTER TABLE public.sessions 
ADD CONSTRAINT sessions_host_id_fkey 
FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Runs
ALTER TABLE public.runs 
DROP CONSTRAINT IF EXISTS runs_host_id_fkey;

ALTER TABLE public.runs 
ADD CONSTRAINT runs_host_id_fkey 
FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Subscribers
ALTER TABLE public.subscribers 
DROP CONSTRAINT IF EXISTS subscribers_user_id_fkey;

ALTER TABLE public.subscribers 
ADD CONSTRAINT subscribers_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;