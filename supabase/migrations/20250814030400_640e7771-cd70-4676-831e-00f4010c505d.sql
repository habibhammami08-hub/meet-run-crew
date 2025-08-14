-- Ensure realtime is properly configured for sessions table
ALTER TABLE public.sessions REPLICA IDENTITY FULL;