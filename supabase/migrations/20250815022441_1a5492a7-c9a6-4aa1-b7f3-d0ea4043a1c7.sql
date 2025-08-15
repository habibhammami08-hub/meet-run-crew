-- =====================================================
-- CORRECTION DES PROBLÈMES DE SÉCURITÉ DES VUES
-- Recrée les vues sans SECURITY DEFINER
-- =====================================================

-- Supprimer et recréer les vues sans problèmes de sécurité
DROP VIEW IF EXISTS public.sessions_with_host;
DROP VIEW IF EXISTS public.enrollments_detailed;

-- Vue des sessions avec informations de l'hôte (sans SECURITY DEFINER)
CREATE VIEW public.sessions_with_host AS
SELECT 
  s.*,
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  COALESCE(enrollment_counts.count, 0) as current_enrollments,
  CASE 
    WHEN s.scheduled_at IS NOT NULL AND s.scheduled_at < now() THEN 'past'
    WHEN COALESCE(enrollment_counts.count, 0) >= s.max_participants THEN 'full'
    WHEN s.status = 'published' THEN 'available'
    ELSE s.status
  END as computed_status
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_id = p.id
LEFT JOIN (
  SELECT 
    session_id, 
    COUNT(*) as count
  FROM public.enrollments 
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
) enrollment_counts ON s.id = enrollment_counts.session_id;

-- Vue des inscriptions avec détails (sans SECURITY DEFINER)
CREATE VIEW public.enrollments_detailed AS
SELECT 
  e.*,
  p.full_name as participant_name,
  p.avatar_url as participant_avatar,
  p.email as participant_email,
  s.title as session_title,
  s.scheduled_at as session_date,
  s.location_hint as session_location,
  s.price_cents as session_price
FROM public.enrollments e
LEFT JOIN public.profiles p ON e.user_id = p.id
LEFT JOIN public.sessions s ON e.session_id = s.id;

-- Activer RLS sur les vues pour la sécurité
ALTER VIEW public.sessions_with_host SET (security_invoker = true);
ALTER VIEW public.enrollments_detailed SET (security_invoker = true);