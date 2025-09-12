-- Corriger l'erreur Security Definer View
-- La vue sessions_with_details utilise probablement SECURITY DEFINER

-- Recréer la vue sans SECURITY DEFINER
DROP VIEW IF EXISTS public.sessions_with_details CASCADE;

CREATE VIEW public.sessions_with_details AS
SELECT 
  s.*,
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  COALESCE(public.get_available_spots(s.id), 0) as available_spots,
  (
    SELECT COUNT(*) 
    FROM public.enrollments e 
    WHERE e.session_id = s.id 
    AND e.status IN ('paid', 'included_by_subscription', 'confirmed')
  ) as current_enrollments
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_id = p.id;