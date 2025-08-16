-- Ajouter colonnes prix si elles n'existent pas
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS price_currency TEXT;

-- Supprimer la colonne duration si elle existe
ALTER TABLE public.sessions
  DROP COLUMN IF EXISTS duration_minutes;

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