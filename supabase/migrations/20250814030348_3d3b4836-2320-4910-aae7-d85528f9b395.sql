-- Enable realtime for sessions table
ALTER TABLE public.sessions REPLICA IDENTITY FULL;

-- Add sessions to realtime publication if not already present
SELECT pg_catalog.pg_get_publication_tables('supabase_realtime');

-- Add sessions table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;