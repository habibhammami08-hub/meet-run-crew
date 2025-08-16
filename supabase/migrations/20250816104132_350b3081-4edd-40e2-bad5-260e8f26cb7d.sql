-- =============================================================================
-- SUPABASE SCHEMA & RLS HARDENING
-- =============================================================================

-- 2.1 CANONICAL COLUMNS FOR SESSIONS TABLE
-- =============================================================================

-- Add missing columns and normalize existing ones with idempotent guards
DO $$ 
BEGIN
    -- Check and add min_participants column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'min_participants') THEN
        ALTER TABLE public.sessions ADD COLUMN min_participants INTEGER;
    END IF;
    
    -- Ensure intensity has proper check constraint
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'sessions_intensity_check') THEN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_intensity_check CHECK (intensity IN ('low', 'medium', 'high'));
    END IF;
    
    -- Ensure session_type has proper check constraint  
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'sessions_session_type_check') THEN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_session_type_check CHECK (session_type IN ('mixed', 'women_only', 'men_only'));
    END IF;
    
    -- Set proper defaults
    ALTER TABLE public.sessions ALTER COLUMN status SET DEFAULT 'published';
    ALTER TABLE public.sessions ALTER COLUMN created_at SET DEFAULT now();
    ALTER TABLE public.sessions ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE public.sessions ALTER COLUMN min_participants SET DEFAULT 2;
END $$;

-- =============================================================================
-- 2.2 RLS POLICIES (CONCISE, NON-CONFLICTING)
-- =============================================================================

-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;
DROP POLICY IF EXISTS profiles_write_policy ON public.profiles;
DROP POLICY IF EXISTS sessions_select_policy ON public.sessions;
DROP POLICY IF EXISTS sessions_write_policy ON public.sessions;
DROP POLICY IF EXISTS enrollments_select_policy ON public.enrollments;
DROP POLICY IF EXISTS enrollments_write_policy ON public.enrollments;

-- PROFILES: Users can only access their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_self ON public.profiles 
FOR SELECT TO authenticated 
USING (id = auth.uid());

CREATE POLICY profiles_insert_self ON public.profiles 
FOR INSERT TO authenticated 
WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_self ON public.profiles 
FOR UPDATE TO authenticated 
USING (id = auth.uid()) 
WITH CHECK (id = auth.uid());

-- SESSIONS: Publicly visible for map, write restricted to hosts
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_public_read ON public.sessions 
FOR SELECT TO anon, authenticated 
USING (true);

CREATE POLICY sessions_insert_own ON public.sessions 
FOR INSERT TO authenticated 
WITH CHECK (host_id = auth.uid());

CREATE POLICY sessions_update_own ON public.sessions 
FOR UPDATE TO authenticated 
USING (host_id = auth.uid());

CREATE POLICY sessions_delete_own ON public.sessions 
FOR DELETE TO authenticated 
USING (host_id = auth.uid());

-- ENROLLMENTS: Users can only manage their own enrollments
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY enrollments_select_self ON public.enrollments 
FOR SELECT TO authenticated 
USING (user_id = auth.uid());

CREATE POLICY enrollments_insert_self ON public.enrollments 
FOR INSERT TO authenticated 
WITH CHECK (user_id = auth.uid());

CREATE POLICY enrollments_delete_self ON public.enrollments 
FOR DELETE TO authenticated 
USING (user_id = auth.uid());

-- STORAGE POLICIES: Avatar bucket management
-- Drop existing storage policies to avoid conflicts
DROP POLICY IF EXISTS storage_avatars_public_read ON storage.objects;
DROP POLICY IF EXISTS storage_avatars_owner_write ON storage.objects;
DROP POLICY IF EXISTS storage_avatars_owner_update ON storage.objects;
DROP POLICY IF EXISTS storage_avatars_owner_delete ON storage.objects;

-- Public read access to avatars bucket
CREATE POLICY storage_avatars_public_read ON storage.objects 
FOR SELECT TO public 
USING (bucket_id = 'avatars');

-- Owner-only write access (files must be in user's folder)
CREATE POLICY storage_avatars_owner_write ON storage.objects 
FOR INSERT TO authenticated 
WITH CHECK (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY storage_avatars_owner_update ON storage.objects 
FOR UPDATE TO authenticated 
USING (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
) 
WITH CHECK (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY storage_avatars_owner_delete ON storage.objects 
FOR DELETE TO authenticated 
USING (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

-- =============================================================================
-- 2.3 TRIGGERS & DEFAULTS
-- =============================================================================

-- Updated_at maintenance trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql 
AS $$ 
BEGIN 
    NEW.updated_at = now(); 
    RETURN NEW; 
END; 
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS sessions_set_updated_at ON public.sessions;
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;

-- Apply trigger to sessions table
CREATE TRIGGER sessions_set_updated_at 
BEFORE UPDATE ON public.sessions 
FOR EACH ROW 
EXECUTE FUNCTION public.set_updated_at();

-- Apply trigger to profiles table  
CREATE TRIGGER profiles_set_updated_at 
BEFORE UPDATE ON public.profiles 
FOR EACH ROW 
EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- VALIDATION AND CLEANUP
-- =============================================================================

-- Ensure all tables have proper constraints
DO $$
BEGIN
    -- Validate sessions table structure
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sessions' 
        AND column_name = 'host_id' 
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.sessions ALTER COLUMN host_id SET NOT NULL;
    END IF;
    
    -- Validate enrollments table structure  
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'enrollments' 
        AND column_name = 'user_id' 
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.enrollments ALTER COLUMN user_id SET NOT NULL;
    END IF;
    
    -- Validate profiles table structure
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'id' 
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.profiles ALTER COLUMN id SET NOT NULL;
    END IF;
END $$;