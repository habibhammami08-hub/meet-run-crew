-- Ensure RLS is enabled on sessions table
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and create new ones
DROP POLICY IF EXISTS "Public can view all sessions" ON public.sessions;
CREATE POLICY "Public can view all sessions"
ON public.sessions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert own sessions" ON public.sessions;
CREATE POLICY "insert own sessions"
ON public.sessions FOR INSERT TO authenticated
WITH CHECK (host_id = auth.uid());

-- Drop redundant policies
DROP POLICY IF EXISTS "Anyone can view sessions" ON public.sessions;
DROP POLICY IF EXISTS "Authenticated users can create sessions" ON public.sessions;