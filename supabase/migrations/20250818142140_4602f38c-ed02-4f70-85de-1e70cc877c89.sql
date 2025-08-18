-- Correction des problèmes de sécurité détectés

-- 1. Corriger les fonctions pour inclure search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_profile public.profiles)
RETURNS BOOLEAN 
LANGUAGE plpgsql
IMMUTABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN user_profile.sub_status IN ('active', 'trialing') 
    AND (user_profile.sub_current_period_end IS NULL 
         OR user_profile.sub_current_period_end > NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public.get_available_spots(session_id UUID)
RETURNS INTEGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_spots INTEGER;
  taken_spots INTEGER;
BEGIN
  SELECT max_participants INTO max_spots
  FROM public.sessions WHERE id = session_id;
  
  SELECT COUNT(*) INTO taken_spots
  FROM public.enrollments 
  WHERE session_id = get_available_spots.session_id 
    AND status IN ('paid', 'included_by_subscription', 'confirmed');
  
  RETURN GREATEST(0, max_spots - taken_spots);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;