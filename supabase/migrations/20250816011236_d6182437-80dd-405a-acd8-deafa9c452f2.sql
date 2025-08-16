-- Correction de l'avertissement Security Definer View
-- Supprimer la vue existante et la recréer sans SECURITY DEFINER

DROP VIEW IF EXISTS sessions_with_details;

-- Recréer la vue sans SECURITY DEFINER (utilise les permissions de l'utilisateur)
CREATE VIEW sessions_with_details AS
SELECT 
  s.*,
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  COALESCE(e.enrollment_count, 0) as current_enrollments,
  (s.max_participants - COALESCE(e.enrollment_count, 0)) as available_spots
FROM sessions s
LEFT JOIN profiles p ON s.host_id = p.id
LEFT JOIN (
  SELECT 
    session_id, 
    COUNT(*) as enrollment_count
  FROM enrollments 
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
) e ON s.id = e.session_id;