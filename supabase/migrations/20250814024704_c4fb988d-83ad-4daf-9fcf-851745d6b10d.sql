-- Enable realtime for sessions table
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER TABLE public.sessions REPLICA IDENTITY FULL;