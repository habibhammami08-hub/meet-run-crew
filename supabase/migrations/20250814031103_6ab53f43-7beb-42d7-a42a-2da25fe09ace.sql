-- 1. Vérifier et corriger la structure de la table sessions
-- S'assurer que location_lat et location_lng sont NOT NULL
ALTER TABLE public.sessions 
ALTER COLUMN location_lat SET NOT NULL,
ALTER COLUMN location_lng SET NOT NULL;

-- 2. Vérifier les permissions RLS pour lecture publique
DROP POLICY IF EXISTS "read sessions public" ON public.sessions;
CREATE POLICY "read sessions public"
ON public.sessions FOR SELECT
TO anon, authenticated
USING (true);

-- 3. S'assurer que le Realtime est bien configuré
ALTER TABLE public.sessions REPLICA IDENTITY FULL;