-- Ajouter une politique RLS restrictive pour la table deletion_blocklist
-- Seuls les administrateurs (service role) peuvent accéder à cette table
CREATE POLICY "deletion_blocklist_admin_only" 
ON public.deletion_blocklist 
FOR ALL 
TO service_role
USING (true);

-- Aucun accès utilisateur normal à cette table
-- (utilisateurs authentifiés ne peuvent ni lire ni écrire)
-- Seule l'Edge Function avec service_role peut y accéder