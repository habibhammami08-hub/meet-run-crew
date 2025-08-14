-- 1. Créer la table profiles pour les utilisateurs
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  age integer,
  gender text,
  role text DEFAULT 'participant',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- 2. Activer RLS sur profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Créer les politiques RLS pour profiles
CREATE POLICY IF NOT EXISTS "Users can view all profiles" 
ON public.profiles FOR SELECT 
USING (true);

CREATE POLICY IF NOT EXISTS "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- 4. Créer ou mettre à jour la fonction handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

-- 5. Créer le trigger pour les nouveaux utilisateurs
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Modifier la table sessions pour référencer profiles au lieu de auth.users
-- D'abord, supprimer l'ancienne contrainte si elle existe
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_host_id_fkey;

-- Puis ajouter la nouvelle contrainte vers profiles
ALTER TABLE public.sessions 
ADD CONSTRAINT sessions_host_id_fkey 
FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;