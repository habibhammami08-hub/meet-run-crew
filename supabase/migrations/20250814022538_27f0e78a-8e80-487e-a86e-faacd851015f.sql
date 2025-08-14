-- Enable realtime for sessions table
ALTER TABLE public.sessions REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;