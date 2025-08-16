-- Ajouter une politique RLS pour la table deletion_blocklist (admin uniquement via edge functions)
CREATE POLICY "Service role can manage deletion blocklist" 
ON public.deletion_blocklist 
FOR ALL 
USING (true) 
WITH CHECK (true);