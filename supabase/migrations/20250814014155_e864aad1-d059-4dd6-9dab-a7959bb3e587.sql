-- Renommer la table 'runs' en 'sessions' et adapter le schéma
-- D'abord créer la nouvelle table sessions avec la structure demandée
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID NOT NULL,
  title TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  distance_km NUMERIC NOT NULL,
  intensity TEXT NOT NULL CHECK (intensity IN ('low', 'medium', 'high')),
  type TEXT NOT NULL CHECK (type IN ('mixed', 'women', 'men')),
  max_participants INTEGER NOT NULL CHECK (max_participants >= 3 AND max_participants <= 11),
  location_lat NUMERIC NOT NULL,
  location_lng NUMERIC NOT NULL,
  blur_radius_m INTEGER NOT NULL DEFAULT 1000,
  area_hint TEXT,
  price_cents INTEGER NOT NULL DEFAULT 450,
  host_payout_cents INTEGER NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrer les données de runs vers sessions
INSERT INTO public.sessions (
  id, host_id, title, date, distance_km, intensity, type, max_participants,
  location_lat, location_lng, area_hint, price_cents, created_at
)
SELECT 
  id, 
  host_id, 
  title,
  CASE 
    WHEN date IS NOT NULL AND time IS NOT NULL THEN 
      (date::TEXT || ' ' || time::TEXT)::TIMESTAMPTZ
    ELSE 
      NOW()
  END as date,
  CASE 
    WHEN distance ~ '^[0-9]+(\.[0-9]+)?$' THEN distance::NUMERIC
    ELSE 5.0 -- valeur par défaut
  END as distance_km,
  CASE 
    WHEN intensity = 'faible' THEN 'low'
    WHEN intensity = 'moyenne' THEN 'medium'
    WHEN intensity = 'élevée' OR intensity = 'forte' THEN 'high'
    ELSE 'medium'
  END as intensity,
  CASE 
    WHEN type = 'mixte' THEN 'mixed'
    WHEN type = 'femmes' THEN 'women'
    WHEN type = 'hommes' THEN 'men'
    ELSE 'mixed'
  END as type,
  COALESCE(max_participants, 10),
  latitude as location_lat,
  longitude as location_lng,
  location_name as area_hint,
  COALESCE(price_cents, 450),
  created_at
FROM public.runs;

-- Créer la nouvelle table enrollments
CREATE TABLE public.enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'noshow', 'present')),
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrer les données de registrations vers enrollments
INSERT INTO public.enrollments (session_id, user_id, status, stripe_session_id, created_at)
SELECT 
  run_id as session_id,
  user_id,
  CASE 
    WHEN payment_status = 'completed' THEN 'paid'
    WHEN payment_status = 'pending' THEN 'pending'
    ELSE 'cancelled'
  END as status,
  stripe_session_id,
  registered_at as created_at
FROM public.registrations;

-- Mettre à jour les colonnes de la table profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'participant' CHECK (role IN ('participant', 'host')),
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Activer Row Level Security sur les nouvelles tables
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour sessions
CREATE POLICY "Anyone can view sessions" ON public.sessions
FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create sessions" ON public.sessions
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own sessions" ON public.sessions
FOR UPDATE USING (auth.uid() = host_id);

-- Politiques RLS pour enrollments  
CREATE POLICY "Users can view their own enrollments" ON public.enrollments
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Session hosts can view enrollments for their sessions" ON public.enrollments
FOR SELECT USING (auth.uid() IN (SELECT host_id FROM sessions WHERE id = enrollments.session_id));

CREATE POLICY "Authenticated users can create enrollments" ON public.enrollments
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own enrollments" ON public.enrollments
FOR UPDATE USING (auth.uid() = user_id);

-- Fonction pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_sessions()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;