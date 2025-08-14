-- Update foreign key constraints to cascade deletes properly
ALTER TABLE public.sessions 
  DROP CONSTRAINT IF EXISTS sessions_host_id_fkey,
  ADD CONSTRAINT sessions_host_id_fkey 
  FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.enrollments 
  DROP CONSTRAINT IF EXISTS enrollments_user_id_fkey,
  ADD CONSTRAINT enrollments_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.registrations 
  DROP CONSTRAINT IF EXISTS registrations_user_id_fkey,
  ADD CONSTRAINT registrations_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Create function to delete user completely (profile + auth)
CREATE OR REPLACE FUNCTION public.delete_user_completely()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'No authenticated user';
  END IF;
  
  -- Delete from profiles (will cascade to other tables)
  DELETE FROM public.profiles WHERE id = current_user_id;
  
  -- Delete from auth.users (this removes the user completely)
  DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;