CREATE OR REPLACE VIEW public.profiles_public_open AS
SELECT
  id,
  full_name,
  age,
  avatar_url,
  gender,
  city,
  sessions_hosted,
  sessions_joined,
  total_km,
  created_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public_open TO anon;
GRANT SELECT ON public.profiles_public_open TO authenticated;
GRANT SELECT ON public.profiles_public_open TO service_role;