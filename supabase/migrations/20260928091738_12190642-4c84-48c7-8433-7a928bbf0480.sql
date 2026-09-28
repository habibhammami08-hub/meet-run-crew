CREATE OR REPLACE VIEW public.profiles_public_open
WITH (security_invoker=on) AS
  SELECT id, full_name, age, avatar_url
  FROM public.profiles;

GRANT SELECT ON public.profiles_public_open TO anon;
GRANT SELECT ON public.profiles_public_open TO authenticated;
GRANT SELECT ON public.profiles_public_open TO service_role;