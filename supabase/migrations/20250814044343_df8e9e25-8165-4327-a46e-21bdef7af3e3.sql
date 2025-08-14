-- Fix security warning for function search_path
CREATE OR REPLACE FUNCTION public.has_active_subscription(user_profile public.profiles)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN user_profile.sub_status IN ('active', 'trialing') AND 
         (user_profile.sub_current_period_end IS NULL OR user_profile.sub_current_period_end > now());
END;
$$;