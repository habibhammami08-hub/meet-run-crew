-- === CORRECTION SÉCURITÉ - SUPPRESSION VUE SECURITY DEFINER ===

-- Supprimer la vue qui pose problème de sécurité
DROP VIEW IF EXISTS public.dashboard_stats;