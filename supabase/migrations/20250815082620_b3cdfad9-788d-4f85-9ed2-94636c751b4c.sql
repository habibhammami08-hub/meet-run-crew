-- Créer la table de blocklist pour empêcher les reconnexions immédiates après suppression
CREATE TABLE IF NOT EXISTS public.deletion_blocklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  blocked_until TIMESTAMP WITH TIME ZONE NOT NULL,
  original_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index pour nettoyer automatiquement les entrées expirées
CREATE INDEX idx_deletion_blocklist_expiry ON public.deletion_blocklist(blocked_until);

-- RLS pour cette table (admin uniquement)
ALTER TABLE public.deletion_blocklist ENABLE ROW LEVEL SECURITY;

-- Fonction pour hasher un email côté base
CREATE OR REPLACE FUNCTION public.hash_email(email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN encode(digest(lower(email), 'sha256'), 'hex');
END;
$$;

-- Fonction trigger pour vérifier la blocklist lors de l'inscription
CREATE OR REPLACE FUNCTION public.check_deletion_blocklist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  email_hash TEXT;
  is_blocked BOOLEAN := FALSE;
BEGIN
  -- Hasher l'email de l'utilisateur qui s'inscrit
  email_hash := public.hash_email(NEW.email);
  
  -- Vérifier si l'email est bloqué
  SELECT EXISTS(
    SELECT 1 FROM public.deletion_blocklist 
    WHERE email_hash = hash_email(NEW.email) 
    AND blocked_until > now()
  ) INTO is_blocked;
  
  IF is_blocked THEN
    RAISE EXCEPTION 'Inscription temporairement bloquée. Veuillez réessayer plus tard.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger sur auth.users pour vérifier la blocklist
DROP TRIGGER IF EXISTS check_deletion_blocklist_trigger ON auth.users;
CREATE TRIGGER check_deletion_blocklist_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.check_deletion_blocklist();

-- Fonction pour nettoyer automatiquement les entrées expirées
CREATE OR REPLACE FUNCTION public.cleanup_expired_blocklist()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.deletion_blocklist 
  WHERE blocked_until <= now();
END;
$$;