-- Activer le realtime sur la table sessions pour les mises à jour en temps réel
ALTER TABLE public.sessions REPLICA IDENTITY FULL;

-- Ajouter la table à la publication realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;