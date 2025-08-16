-- Supprimer la vue sessions_with_details temporairement
DROP VIEW IF EXISTS public.sessions_with_details;

-- Supprimer la colonne duration_minutes
ALTER TABLE public.sessions
  DROP COLUMN IF EXISTS duration_minutes;

-- Ajouter colonnes prix si elles n'existent pas
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS price_currency TEXT;

-- Recréer la vue sessions_with_details sans duration_minutes
CREATE VIEW public.sessions_with_details AS
SELECT 
  s.*,
  p.full_name as host_name,
  p.avatar_url as host_avatar,
  COUNT(e.id) as current_enrollments,
  (s.max_participants - COUNT(e.id)) as available_spots
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_id = p.id
LEFT JOIN public.enrollments e ON s.id = e.session_id AND e.status IN ('paid', 'included_by_subscription')
GROUP BY s.id, p.full_name, p.avatar_url;

-- Créer fonction pour forcer le prix fixe
CREATE OR REPLACE FUNCTION public.sessions_force_fixed_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.price_cents := 450;
  NEW.price_currency := 'EUR';
  RETURN NEW;
END;
$$;

-- Supprimer trigger existant s'il existe
DROP TRIGGER IF EXISTS trg_sessions_force_fixed_price ON public.sessions;

-- Créer trigger pour forcer le prix fixe
CREATE TRIGGER trg_sessions_force_fixed_price
BEFORE INSERT OR UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.sessions_force_fixed_price();