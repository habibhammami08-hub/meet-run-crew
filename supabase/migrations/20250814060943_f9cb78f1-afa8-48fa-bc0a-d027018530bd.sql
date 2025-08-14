-- Vérifier et corriger les policies RLS pour la table sessions
-- On veut que tout le monde puisse lire les sessions publiques

-- D'abord, supprimer les éventuelles policies redondantes
DROP POLICY IF EXISTS "read sessions public" ON public.sessions;

-- Créer une seule policy claire pour la lecture publique
CREATE POLICY "Public can view all sessions" 
ON public.sessions 
FOR SELECT 
USING (true);

-- Vérifier que RLS est bien activé
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;