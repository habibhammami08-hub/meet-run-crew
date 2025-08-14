-- 5. Créer ou mettre à jour la fonction handle_new_user
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

-- 6. Créer le trigger pour les nouveaux utilisateurs
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Modifier la table sessions pour référencer profiles au lieu de auth.users
-- D'abord, supprimer l'ancienne contrainte si elle existe
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_host_id_fkey;

-- Puis ajouter la nouvelle contrainte vers profiles
ALTER TABLE public.sessions 
ADD CONSTRAINT sessions_host_id_fkey 
FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;