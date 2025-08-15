-- =====================================================
-- CORRECTIONS DE SÉCURITÉ
-- Corriger les problèmes détectés par le linter
-- =====================================================

-- Corriger la vue user_deletion_stats pour utiliser SECURITY INVOKER
DROP VIEW IF EXISTS public.user_deletion_stats;

CREATE OR REPLACE VIEW public.user_deletion_stats
WITH (security_invoker = true)
AS
SELECT 
  DATE(deleted_at) as deletion_date,
  COUNT(*) as users_deleted,
  COUNT(*) FILTER (WHERE deleted_at > now() - interval '24 hours') as deleted_last_24h,
  COUNT(*) FILTER (WHERE deleted_at > now() - interval '7 days') as deleted_last_7d
FROM auth.users 
WHERE deleted_at IS NOT NULL
GROUP BY DATE(deleted_at)
ORDER BY deletion_date DESC;

-- Ajouter une politique RLS pour restreindre l'accès à cette vue (uniquement pour les admins)
-- Note: Cette vue ne devrait être accessible qu'aux administrateurs
ALTER VIEW public.user_deletion_stats SET (security_invoker = true);