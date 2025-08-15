-- Ajouter des politiques RLS pour la table deletion_blocklist
-- Seuls les administrateurs/service roles peuvent accéder à cette table

CREATE POLICY "deletion_blocklist_service_role_access" 
ON public.deletion_blocklist 
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Les utilisateurs normaux ne peuvent pas accéder à cette table
CREATE POLICY "deletion_blocklist_no_user_access" 
ON public.deletion_blocklist 
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);