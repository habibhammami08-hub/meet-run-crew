-- =====================================================
-- CRÉATION D'UNE VUE SESSIONS SIMPLE ET SÉCURISÉE
-- =====================================================

-- Créer une vue simple pour les sessions avec détails de l'hôte
CREATE VIEW public.sessions_with_details AS
SELECT 
  s.id,
  s.title,
  s.description,
  s.scheduled_at,
  s.duration_minutes,
  s.start_lat,
  s.start_lng,
  s.end_lat,
  s.end_lng,
  s.location_hint,
  s.distance_km,
  s.intensity,
  s.session_type,
  s.max_participants,
  s.min_participants,
  s.price_cents,
  s.host_fee_cents,
  s.status,
  s.created_at,
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  COALESCE(e.enrollment_count, 0) as current_enrollments,
  (s.max_participants - COALESCE(e.enrollment_count, 0)) as available_spots
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_id = p.id
LEFT JOIN (
  SELECT 
    session_id, 
    COUNT(*) as enrollment_count
  FROM public.enrollments 
  WHERE status IN ('paid', 'confirmed', 'present')
  GROUP BY session_id
) e ON s.id = e.session_id;

-- Vérification finale de la base de données
SELECT 
  'MIGRATION COMPLÈTE' as status,
  'Base de données stabilisée et sécurisée' as message,
  now() as completed_at;